// The levers between today's core revenue and $1.0m a month, each in dollars a month, each from
// the database, each with the accounts behind it. Home draws them as a bridge; every step opens a
// customer list built from the same function, so the step and its list always agree.
// Citadel is held apart from all of them.
import { buildWhitespace } from './whitespace.js';

export const TARGET = 1e6;
export const CITADEL = 6714;
export const TYPICAL_RISE = 0.08;   // the median rise when a rate moves (24 months of rate rounds; scripts/levers.js §2)
export const PRICED = ['B2', 'B3', 'B6', '01', '20', '25', '30', 'S3', 'S4', 'S6'];
export const CROSS_SELL_DEPTH = 200; // accounts sized for cross-sell: the ones worth a conversation

// the book's median rate for each priced service (accounts, not lines; 20 or more accounts)
export function serviceMedians(PR) {
  const meds = {};
  for (const code of PRICED) {
    const v = PR.rates.filter(r => r.servcode === code && r.modal_rate > 0 && r.units > 0).map(r => r.modal_rate).sort((a, b) => a - b);
    if (v.length >= 20) meds[code] = v[Math.floor(v.length / 2)];
  }
  return meds;
}

// Service lines priced under the median: per account, the monthly gap at the full median, and the
// single largest line (for the reason shown on the row).
export function serviceGaps(PR) {
  const meds = serviceMedians(PR), out = new Map();
  for (const r of PR.rates) {
    if (!meds[r.servcode] || r.level1 === CITADEL || !(r.modal_rate > 0) || r.modal_rate >= meds[r.servcode] || !(r.units > 0)) continue;
    const worth = (meds[r.servcode] - r.modal_rate) * r.units / 12;
    const a = out.get(r.level1) || { level1: r.level1, customer: r.customer, worth: 0, top: null };
    a.worth += worth;
    if (!a.top || worth > a.top.worth) a.top = { worth, service: r.service, rate: r.modal_rate, med: meds[r.servcode] };
    out.set(r.level1, a);
  }
  return out;
}

// Storage under the box-weighted median rate (minimum charges inflate an account median), on the
// latest month's boxes. Monthly gap at the full median.
export function storageGaps(PR) {
  const s = PR.storage.filter(r => r.boxes > 0 && r.rate_per_box > 0 && r.level1 !== CITADEL).sort((a, b) => a.rate_per_box - b.rate_per_box);
  const W = s.reduce((t, r) => t + r.boxes, 0);
  let acc = 0, med = null;
  for (const r of s) { acc += r.boxes; if (acc >= W / 2) { med = r.rate_per_box; break; } }
  const rows = s.filter(r => r.rate_per_box < med).map(r => ({ level1: r.level1, customer: r.customer, boxes: r.boxes, rate: r.rate_per_box, med, worth: (med - r.rate_per_box) * r.boxes }));
  return { med, rows };
}

// Boxes past their retention review, per account: destruction bills once at the book's median R3
// fee per standard box; each destroyed box stops paying storage at the account's own latest rate,
// else the box-weighted median. Home and the Overdue boxes list both read this.
export function overdueBoxes(CA, PR) {
  const r3 = PR.rates.filter(r => r.servcode === 'R3' && r.modal_rate > 0).map(r => r.modal_rate).sort((a, b) => a - b);
  const perBox = r3.length ? r3[r3.length >> 1] : null;
  const med = storageGaps(PR).med, rate = new Map(PR.storage.map(r => [r.level1, r.rate_per_box]));
  const rows = CA.filter(c => c.level1 !== CITADEL && c.boxes_review_overdue > 0).map(c => {
    const boxes = c.boxes_review_overdue, own = rate.get(c.level1), r = own > 0 ? own : med;
    const once = perBox * boxes, lost = r * boxes;
    return { level1: c.level1, customer: c.customer, boxes, rate: r, own: own > 0, once, lost, months: lost > 0 ? once / lost : null };
  }).sort((a, b) => b.boxes - a.boxes);
  const sum = k => rows.reduce((t, r) => t + r[k], 0);
  return { rows, perBox, med, boxes: sum('boxes'), oneOff: sum('once'), storageLost: sum('lost'), accounts: rows.length };
}

// R4's own cross-sell record from margin.history: accounts that already bought from R4 and later
// started a line (after their first three months and the data's first three). The last twelve
// months against the twelve before, with first-year spend (part-year for recent starts).
export function crossSellPace(H) {
  if (!H || !H.firsts || !H.firsts.length) return null;
  const plus = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
  const end = H.firsts.reduce((m, f) => f.first > m ? f.first : m, ''), from = plus(H.dataStart, 3);
  const made = H.firsts.filter(f => f.account_first && f.first >= from && f.first > plus(f.account_first, 2));
  const yr = made.filter(f => f.first > plus(end, -12)), prev = made.filter(f => f.first <= plus(end, -12) && f.first > plus(end, -24));
  const val = a => a.reduce((t, f) => t + (f.first_year || 0), 0);
  return { count: yr.length, value: val(yr), prevCount: prev.length, prevValue: val(prev), end,
    best: yr.slice().sort((a, b) => (b.first_year || 0) - (a.first_year || 0)).slice(0, 3) };
}

export function bridge({ P, PR, CA, M }) {
  const six = P.monthly.slice(-6);
  const today = six.reduce((t, m) => t + m.core, 0) / six.length;

  const sg = serviceGaps(PR), st = storageGaps(PR);
  const price = ([...sg.values()].reduce((t, a) => t + a.worth, 0) + st.rows.reduce((t, r) => t + r.worth, 0)) / 2;

  // rate rounds only where the account is not already counted in a price gap, so no dollar is counted twice
  const rounds = CA.filter(c => c.not_raised_2y && c.level1 !== CITADEL && !sg.has(c.level1));
  const roundsV = rounds.reduce((t, c) => t + c.service, 0) * TYPICAL_RISE / 12;

  const slip = P.downTwoMonths.filter(d => d.level1 !== CITADEL && d.trailing6_mean > d.revenue);
  const slipV = slip.reduce((t, d) => t + d.trailing6_mean - d.revenue, 0);

  const ws = buildWhitespace(M, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
  const pace = crossSellPace(M.history);

  const steps = [
    { key: 'cross', t: 'Sell what they don\'t buy yet', v: ws.total / 12, href: '#customers?view=whitespace', who: 'Anne',
      s: pace ? `the ceiling at what comparable accounts spend; R4's own pace is ${pace.count} added lines a year, about $${Math.round(pace.value / 12 / 1000)}K a month` : `${ws.rows.filter(r => r.opp > 0).length} of the largest ${CROSS_SELL_DEPTH} accounts, at what comparable accounts spend`, note: 'if all took it up', modelled: true },
    { key: 'price', t: 'Bring prices halfway to the median', v: price, href: '#customers?view=gaps', who: 'Anne',
      s: `${new Set([...sg.keys(), ...st.rows.map(r => r.level1)]).size} accounts pay under the book's median for storage or a service`, note: 'halfway' },
    { key: 'slip', t: 'Win back the slipping accounts', v: slipV, href: '#customers?view=slipping', who: 'Anne and Trisha',
      s: `${slip.length} accounts below their own six-month level for a second month` },
    { key: 'rounds', t: 'Raise the accounts that missed every rate round', v: roundsV, href: '#customers?view=rounds', who: 'Anne',
      s: `${rounds.length} accounts with no rate moved in two years, at the typical 8% rise` },
  ].filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  // a step under $1,000 a month is not a lever worth a row; it is named in the footnote instead
  const minor = steps.filter(x => x.v < 1000);
  steps.splice(0, steps.length, ...steps.filter(x => x.v >= 1000));

  const levers = steps.reduce((t, x) => t + x.v, 0);
  const ob = overdueBoxes(CA, PR);
  return {
    today, sixFrom: six[0].month, sixTo: six[six.length - 1].month,
    steps, minor, levers, newBusiness: Math.max(0, TARGET - today - levers),
    overdue: ob,
    whitespace: ws, serviceGaps: sg, storageGaps: st, pace,
  };
}
