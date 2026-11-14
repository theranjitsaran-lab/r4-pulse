// Each account's monthly series from the customers fixture, and its one measure of movement.
// Leading months empty for every account fall before the data begins, so they are dropped rather
// than drawn as a climb from zero.
//
// Movement is the same everywhere in the app (Home, Slipping, This week, the month grid, the
// customer page): the last three months' average against the account's own average of the twelve
// months before them, in dollars a month and as a share, split into storage and service so a row can
// say which moved.
import * as Fmt from './format.js';
import { windows } from './movebridge.js';
const sum = a => a.reduce((t, v) => t + v, 0);
const avg = a => a.length ? sum(a) / a.length : 0;

// base: what the last three months are compared with (movebridge.js BASES): 'avg12' (default, the twelve months
// before them), 'prev3' (the three before), 'ly3' (the same three a year ago).
const memo = new WeakMap();
export function seriesOf(C, base = 'avg12') {
  const hit = memo.get(C); if (hit && hit[base]) return hit[base];
  const out = build(C, base);
  memo.set(C, { ...(memo.get(C) || {}), [base]: out });
  return out;
}
function build(C, base) {
  let start = 0;
  while (start < C.months.length - 1 && C.accounts.every(a => !a.storage[start] && !a.service[start])) start++;
  const months = C.months.slice(start);
  const map = new Map();
  for (const a of C.accounts) {
    const storage = a.storage.slice(start), service = a.service.slice(start);
    const total = storage.map((v, i) => v + service[i]);
    const ltm = sum(total.slice(-12));
    let move = null;
    const W = windows(total.length, base);
    if (W) {
      const pick = (a, idx) => avg(idx.map(i => a[i]));
      const last3 = pick(total, W.now), run = pick(total, W.ref);
      move = { last3, run, d: last3 - run, pct: run > 0 ? last3 / run - 1 : null, dStorage: pick(storage, W.now) - pick(storage, W.ref), dService: pick(service, W.now) - pick(service, W.ref), base };
    }
    map.set(a.level1, { ...a, months, storage, service, total, ltm, move });
  }
  return map;
}

export function deltaText(c) { return c == null ? 'new' : Fmt.change(c); }
// colour for a move of a fifth or more only; a smaller one keeps its arrow in ink (status marks exceptions)
export function deltaCls(c) { return c == null ? 'flat' : c >= 0.2 ? 'up' : c <= -0.2 ? 'down' : 'flat'; }

// A move, always as the total first, then the part that moved: "down $35K a month in total (service down $33K)".
export function moveReason(m, fmt) {
  if (!m) return '';
  const part = Math.abs(m.dService) >= Math.abs(m.dStorage) ? ['service', m.dService] : ['storage', m.dStorage];
  const other = part[0] === 'service' ? ['storage', m.dStorage] : ['service', m.dService];
  const word = v => v < 0 ? 'down' : 'up';
  const total = m.d != null ? m.d : part[1] + other[1];
  const main = `${part[0]} ${word(part[1])} ${fmt(Math.abs(part[1]))}`;
  const both = Math.abs(other[1]) > 0.25 * Math.abs(part[1]) && Math.abs(other[1]) >= 250 ? `${main}, ${other[0]} ${word(other[1])} ${fmt(Math.abs(other[1]))}` : main;
  return `${word(total)} ${fmt(Math.abs(total))} a month in total (${both})`;
}
