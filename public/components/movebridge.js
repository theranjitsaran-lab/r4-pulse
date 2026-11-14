// Why an account moved (Theran, 14 November 2026). One function for the drawer on Who moved, Today and Accounts, and
// for Ask, so they say the same thing. No DOM.
//
//   The comparison is named every time. The default is the last three months against the account's own average of the
//   twelve before them (the rule series.js has always used); the drawer can switch to the three months before, or the
//   same three months a year ago.
//
//   Each line's move is split into what came from one-off work and what came from its regular work, and the regular
//   part into volume and price where the line has units:
//     volume = (units now − units then) × price then;  price = (price now − price then) × units now.
//   The parts add to the move exactly. One-off is decided per customer and line from the last twelve months
//   (classifyWork): regular when bought in 6 or more of them, one-off when in 3 or fewer, occasional in between, new
//   when first bought in the last 3; a month more than 3× the line's usual counts its excess over usual as one-off.
//   The thresholds are on Settings. Figures are never changed, only split.

const sum = a => a.reduce((t, v) => t + (Number(v) || 0), 0);
const avg = a => a.length ? sum(a) / a.length : 0;
const median = a => { const s = a.filter(v => v > 0).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

export const BASES = {
  avg12: { key: 'avg12', label: 'its own 12-month average', short: 'vs 12-month average' },
  prev3: { key: 'prev3', label: 'the 3 months before', short: 'vs 3 months before' },
  ly3:   { key: 'ly3',   label: 'the same 3 months last year', short: 'vs same months last year' },
};
export const ONE_OFF = { regular: 6, oneOff: 3, spike: 3 };

// The months compared, as indexes into a series of n months (latest last). null when the series is too short.
export function windows(n, base = 'avg12') {
  const now = [n - 3, n - 2, n - 1];
  const ref = base === 'prev3' ? [n - 6, n - 5, n - 4] : base === 'ly3' ? [n - 15, n - 14, n - 13] : Array.from({ length: 12 }, (_, i) => n - 15 + i);
  return ref[0] >= 0 && now[0] >= 0 ? { now, ref } : null;
}

// One line for one customer, over the last twelve months of a series.
//   → { kind: 'regular'|'occasional'|'oneoff'|'new'|'none', months, usual, extra: [per month one-off part] }
export function classifyWork(vals, T = ONE_OFF) {
  const n = vals.length, last12 = vals.slice(-12), off = n - last12.length;
  const months = last12.filter(v => v > 0).length, extra = vals.map(() => 0);
  if (!months) return { kind: 'none', months: 0, usual: 0, extra };
  const first = vals.findIndex(v => v > 0);
  if (first >= n - 3 && first > 0) return { kind: 'new', months, usual: median(last12), extra };
  if (months <= T.oneOff) { vals.forEach((v, i) => { if (v > 0) extra[i] = v; }); return { kind: 'oneoff', months, usual: 0, extra }; }
  const usual = median(last12);
  // a spike: a month over spike × usual; only its excess is one-off
  vals.forEach((v, i) => { if (usual > 0 && v > T.spike * usual) extra[i] = v - usual; });
  return { kind: months >= T.regular ? 'regular' : 'occasional', months, usual, extra };
}

// lines: { [key]: { name, r: [revenue a month], u: [units a month] | null } }, all the same months (latest last)
//   → { base, label, now, ref, d, nowAvg, refAvg, byLine: [...], oneOffs: [...], parts, chart } | null
export function explainMove({ months, lines, base = 'avg12', T = ONE_OFF }) {
  const W = windows(months.length, base);
  if (!W) return null;
  const at = idx => idx.map(i => months[i]);
  const byLine = [];
  for (const [key, l] of Object.entries(lines)) {
    const r = l.r.map(v => Number(v) || 0);
    if (!r.some(Boolean)) continue;
    const c = classifyWork(r, T);
    const nowR = avg(W.now.map(i => r[i])), refR = avg(W.ref.map(i => r[i]));
    const nowX = avg(W.now.map(i => c.extra[i])), refX = avg(W.ref.map(i => c.extra[i]));
    const d = nowR - refR, oneOff = nowX - refX, regular = d - oneOff;
    let volume = null, price = null, unitsNow = null, unitsRef = null;
    if (l.u) {
      // units of the regular part: each month's units in the share its regular revenue is of the month
      const regU = i => r[i] > 0 ? (Number(l.u[i]) || 0) * Math.max(0, (r[i] - c.extra[i]) / r[i]) : 0;
      const regR = i => r[i] - c.extra[i];
      unitsNow = avg(W.now.map(regU)); unitsRef = avg(W.ref.map(regU));
      const rn = avg(W.now.map(regR)), rr = avg(W.ref.map(regR));
      if (unitsNow > 0 && unitsRef > 0) {
        const pn = rn / unitsNow, pr = rr / unitsRef;
        volume = (unitsNow - unitsRef) * pr; price = (pn - pr) * unitsNow;
      }
    }
    byLine.push({ key, name: l.name || key, kind: c.kind, monthsBought: c.months, usual: c.usual, nowAvg: nowR, refAvg: refR, d, oneOff, regular, volume, price, unitsNow, unitsRef,
      oneOffMonths: months.filter((_, i) => c.extra[i] > 0).map((m, j) => ({ month: m, value: c.extra[months.indexOf(m)] })) });
  }
  byLine.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const d = sum(byLine.map(l => l.d)), oneOff = sum(byLine.map(l => l.oneOff));
  const total = months.map((_, i) => sum(Object.values(lines).map(l => Number(l.r[i]) || 0)));
  const extraTotal = months.map((_, i) => sum(byLine.map(l => { const x = l.oneOffMonths.find(o => o.month === months[i]); return x ? x.value : 0; })));
  const oneOffs = byLine.flatMap(l => l.oneOffMonths.filter(o => W.now.concat(W.ref).includes(months.indexOf(o.month))).map(o => ({ line: l.key, name: l.name, kind: l.kind, ...o })))
    .sort((a, b) => b.value - a.value);
  return {
    base, label: BASES[base].label, now: at(W.now), ref: at(W.ref),
    nowAvg: avg(W.now.map(i => total[i])), refAvg: avg(W.ref.map(i => total[i])), d,
    parts: { oneOff, regular: d - oneOff, volume: sum(byLine.map(l => l.volume || 0)), price: sum(byLine.map(l => l.price || 0)), noUnits: sum(byLine.filter(l => l.volume == null).map(l => l.regular)) },
    byLine, oneOffs,
    chart: months.map((m, i) => ({ m, v: total[i], oneOff: extraTotal[i], now: W.now.includes(i), ref: W.ref.includes(i) })).slice(-15),
  };
}

// The sentence the drawer leads with, from computed fields only
export function moveSentence(x, fmt) {
  if (!x) return '';
  const word = v => v < 0 ? 'down' : 'up';
  const main = x.byLine[0];
  const off = Math.abs(x.parts.oneOff) >= 0.25 * Math.abs(x.d) && Math.abs(x.parts.oneOff) >= 250;
  const why = !main ? '' : off
    ? ` ${fmt(Math.abs(x.parts.oneOff))} of it is one-off work ${x.parts.oneOff < 0 ? 'not repeated' : 'on top'}${x.oneOffs[0] ? ` (largest: ${x.oneOffs[0].name.toLowerCase()} in ${new Date(x.oneOffs[0].month + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })})` : ''}; regular work is ${word(x.parts.regular)} ${fmt(Math.abs(x.parts.regular))}.`
    : ` Mostly ${main.name.toLowerCase()}, ${word(main.d)} ${fmt(Math.abs(main.d))}${main.volume != null && Math.abs(main.volume) >= Math.abs(main.price || 0) ? ' on volume' : main.price != null ? ' on price' : ''}.`;
  return `${word(x.d)[0].toUpperCase() + word(x.d).slice(1)} ${fmt(Math.abs(x.d))} a month: the last three months averaged ${fmt(x.nowAvg)} against ${x.label}, ${fmt(x.refAvg)}.${why}`;
}
