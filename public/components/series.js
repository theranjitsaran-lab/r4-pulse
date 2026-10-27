// Each account's monthly series from the customers fixture, and its one measure of movement.
// Leading months empty for every account fall before the data begins, so they are dropped rather
// than drawn as a climb from zero.
//
// Movement is the same everywhere in the app (Home, Slipping, This week, the month grid, the
// customer page): the last three months' average against the account's own average of the twelve
// months before them, in dollars a month and as a share, split into storage and service so a row can
// say which moved.
const sum = a => a.reduce((t, v) => t + v, 0);
const avg = a => a.length ? sum(a) / a.length : 0;

export function seriesOf(C) {
  let start = 0;
  while (start < C.months.length - 1 && C.accounts.every(a => !a.storage[start] && !a.service[start])) start++;
  const months = C.months.slice(start);
  const map = new Map();
  for (const a of C.accounts) {
    const storage = a.storage.slice(start), service = a.service.slice(start);
    const total = storage.map((v, i) => v + service[i]);
    const ltm = sum(total.slice(-12));
    let move = null;
    if (total.length >= 15) {
      const last3 = avg(total.slice(-3)), run = avg(total.slice(-15, -3));
      const dSt = avg(storage.slice(-3)) - avg(storage.slice(-15, -3));
      const dSv = avg(service.slice(-3)) - avg(service.slice(-15, -3));
      move = { last3, run, d: last3 - run, pct: run > 0 ? last3 / run - 1 : null, dStorage: dSt, dService: dSv };
    }
    map.set(a.level1, { ...a, months, storage, service, total, ltm, move });
  }
  return map;
}

export function deltaText(c) { return c == null ? 'new' : (c > 0 ? '▲ ' : c < 0 ? '▼ ' : '') + Math.abs(Math.round(c * 100)) + '%'; }
// colour for a move of a fifth or more only; a smaller one keeps its arrow in ink (status marks exceptions)
export function deltaCls(c) { return c == null ? 'flat' : c >= 0.2 ? 'up' : c <= -0.2 ? 'down' : 'flat'; }

// Which part moved, in a few words: "service down $12K a month".
export function moveReason(m, fmt) {
  if (!m) return '';
  const part = Math.abs(m.dService) >= Math.abs(m.dStorage) ? ['service', m.dService] : ['storage', m.dStorage];
  const other = part[0] === 'service' ? ['storage', m.dStorage] : ['service', m.dService];
  const word = v => v < 0 ? 'down' : 'up';
  const main = `${part[0]} ${word(part[1])} ${fmt(Math.abs(part[1]))} a month`;
  return Math.abs(other[1]) > 0.25 * Math.abs(part[1]) && Math.abs(other[1]) >= 250 ? `${main}, ${other[0]} ${word(other[1])} ${fmt(Math.abs(other[1]))}` : main;
}
