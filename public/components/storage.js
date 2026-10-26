// The warehouse: who fills the building and in what state. From storage_retention (status I, in
// storage), one row per account × box type × home location. All 1.19m boxes sit at one location
// (CHI), and there is no rack capacity in the data, so this is boxes and their state, never a
// percent full.
//
// The retention counts overlap (a box can be overdue and over ten years), so each row is split into
// four states that do not:
//   protected   permanent or on legal hold: never shredded          min(boxes, hold + permanent)
//   eligible    review overdue, not protected: at least this many    max(0, overdue − hold − permanent)
//   old         over ten years, review not yet due: at least         ten − min(ten, overdue), within what is left
//   in use      the rest
import { storageGaps } from './levers.js';

const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
export const STATES = [
  ['eligible', 'Eligible to shred'],
  ['old', 'Over ten years, review not due'],
  ['protected', 'Permanent or legal hold'],
  ['inuse', 'In use'],
];

export function rowStates(r) {
  const boxes = r.boxes || 0;
  const protectedB = Math.min(boxes, (r.hold || 0) + (r.permanent || 0));
  const eligible = Math.min(boxes - protectedB, Math.max(0, (r.overdue || 0) - (r.hold || 0) - (r.permanent || 0)));
  const old = Math.max(0, Math.min(boxes - protectedB - eligible, (r.ten || 0) - Math.min(r.ten || 0, r.overdue || 0)));
  return { eligible, old, protected: protectedB, inuse: boxes - protectedB - eligible - old };
}

// one entry per account: its boxes, states, the raw counts and its oldest box
export function byAccount(S, exclude = []) {
  const names = new Map((S.names || []).map(n => [n.level1, n.customer]));
  const m = new Map();
  for (const r of S.rows) {
    if (exclude.includes(r.level1)) continue;
    const a = m.get(r.level1) || { level1: r.level1, customer: names.get(r.level1) || `Account ${r.level1}`, boxes: 0, overdue: 0, ten: 0, eligible: 0, old: 0, protected: 0, inuse: 0, oldest: null, types: {} };
    const s = rowStates(r);
    a.boxes += r.boxes; a.overdue += r.overdue || 0; a.ten += r.ten || 0;
    for (const k of Object.keys(s)) a[k] += s[k];
    a.types[r.boxtype] = (a.types[r.boxtype] || 0) + r.boxes;
    if (r.oldest && (!a.oldest || r.oldest < a.oldest)) a.oldest = r.oldest;
    m.set(r.level1, a);
  }
  return [...m.values()].sort((x, y) => y.boxes - x.boxes);
}

export function totals(accounts) {
  const t = { boxes: 0, overdue: 0, ten: 0 };
  for (const [k] of STATES) t[k] = 0;
  for (const a of accounts) for (const k of Object.keys(t)) t[k] += a[k];
  return t;
}

// The building as cells, one per `per` boxes: a block per account of at least `per` boxes, largest
// first, the rest pooled. Cells go to each block × state by largest remainder, so they sum to
// round(total ÷ per) exactly.
export function cells(accounts, per = 1000) {
  const big = accounts.filter(a => a.boxes >= per), small = accounts.filter(a => a.boxes < per);
  const blocks = big.map(a => ({ ...a }));
  if (small.length) {
    const p = { level1: null, customer: `${small.length} smaller accounts`, boxes: 0, pooled: small.length };
    for (const [k] of STATES) p[k] = sum(small, a => a[k]);
    p.boxes = sum(small, a => a.boxes); p.overdue = sum(small, a => a.overdue); p.ten = sum(small, a => a.ten);
    blocks.push(p);
  }
  const total = sum(blocks, b => b.boxes), n = Math.round(total / per);
  const parts = [];
  blocks.forEach((b, i) => STATES.forEach(([k]) => { const v = b[k] / per; parts.push({ i, k, v, c: Math.floor(v), rem: v - Math.floor(v) }); }));
  let left = n - sum(parts, p => p.c);
  for (const p of parts.slice().sort((a, b) => b.rem - a.rem)) { if (left <= 0) break; p.c++; left--; }
  for (const b of blocks) b.cells = {};
  for (const p of parts) blocks[p.i].cells[p.k] = p.c;
  return { blocks, n, per, total };
}

// What can be shredded, by account: eligible boxes, the destruction billed once at the book's median
// R3 a box, the storage it ends at the account's own rate (else the box-weighted median), the months
// it takes the lost storage to cost what the destruction billed, and the share of the building it empties.
export function eligibleList(accounts, PR, total) {
  const r3 = PR.rates.filter(r => r.servcode === 'R3' && r.modal_rate > 0).map(r => r.modal_rate).sort((a, b) => a - b);
  const perBox = r3.length ? r3[r3.length >> 1] : null;
  const med = storageGaps(PR).med, rate = new Map(PR.storage.map(r => [r.level1, r.rate_per_box]));
  const rows = accounts.filter(a => a.eligible > 0).map(a => {
    const own = rate.get(a.level1), r = own > 0 ? own : med;
    const once = perBox * a.eligible, lost = r * a.eligible;
    return { level1: a.level1, customer: a.customer, boxes: a.boxes, eligible: a.eligible, rate: r, own: own > 0, once, lost, months: lost > 0 ? once / lost : null, share: a.eligible / total };
  }).sort((a, b) => b.eligible - a.eligible);
  return { rows, perBox, med, eligible: sum(rows, r => r.eligible), once: sum(rows, r => r.once), lost: sum(rows, r => r.lost) };
}

// Boxes held against boxes on the latest storage bill (pricing.json storage, from storage_rate_hist),
// by account: a check for Anne (timing, prepaid storage, or boxes not being billed), not a loss.
export function heldNotBilled(accounts, PR) {
  const billed = new Map(PR.storage.map(r => [r.level1, r.boxes]));
  const rows = accounts.map(a => ({ level1: a.level1, customer: a.customer, held: a.boxes, billed: billed.get(a.level1) || 0, none: !billed.has(a.level1) }))
    .map(r => ({ ...r, gap: r.held - r.billed })).filter(r => r.gap > 0).sort((a, b) => b.gap - a.gap);
  return { rows, month: PR.storage.length ? PR.storage[0].month : null, gap: sum(rows, r => r.gap), none: rows.filter(r => r.none) };
}

// The grid as an SVG string: cells in reading order, each block's cells together and coloured by
// state; data-b on each cell names its block for the hover.
export function gridSvg(G, { width = 900, size = 9, gap = 2 } = {}) {
  const step = size + gap, cols = Math.max(10, Math.floor((width + gap) / step)), rows = Math.ceil(G.n / cols);
  const h = rows * step - gap;
  let g = '', k = 0;
  G.blocks.forEach((b, bi) => {
    for (const [s] of STATES) for (let c = 0; c < (b.cells[s] || 0); c++, k++) {
      const x = (k % cols) * step, y = Math.floor(k / cols) * step;
      g += `<rect class="wc ${s}" data-b="${bi}" x="${x}" y="${y}" width="${size}" height="${size}" rx="1.5"/>`;
    }
  });
  return `<svg class="wgrid" viewBox="0 0 ${cols * step - gap} ${h}" role="img" aria-label="${G.n} cells, one per ${G.per.toLocaleString('en-US')} boxes, grouped by account and coloured by state">${g}</svg>`;
}
