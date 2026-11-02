// Every number on screen goes through here: money(), pct() and the plain-number helpers. No DOM.
// Written to reproduce what each screen already showed, character for character, so some options exist
// only to keep an old inconsistency (a hyphen minus, a lower-case m). Standardising them changes what is
// on screen, so it is a decision, not a tidy-up. model/format.test.js holds the exact outputs.
//
//   money(v)                   $1,234, −$1,234: whole dollars
//   money(v, { short: true })  $607K, $1.5M, $12M: −$ when negative
//   money(v, { dp: 2 })        $0.14: a rate, to that many places
//   money(v, { hyphen: true }) $1,234, $-1,234: whole dollars, the older negative
//   pct(v)                     12%, -12%: v is a share, 0.12
//   pct(v, { abs: true })      12% whichever way it moved
//   pct(v, { minus: true })    −12%
//   pct(v, { dp: 1 })          12.3%
//   change(v)                  ▲ 12%, ▼ 12%, 0%, new, stopped
//   num, count, grouped, fixed, thousands: plain numbers
'use strict';

export const grouped = v => v.toLocaleString('en-US');
export const num = v => grouped(Math.round(v));
export const count = v => num(v || 0);
export const fixed = (v, dp) => v.toFixed(dp);
// thousands with no unit, for a table that says so in its heading
export const thousands = v => { const r = Math.round((v || 0) / 1000); return (r < 0 ? '−' : '') + grouped(Math.abs(r)); };

export function money(v, o = {}) {
  if (o.dp != null) return '$' + fixed(v, o.dp);
  if (o.hyphen) return '$' + num(v);
  if (o.millions) return '$' + fixed(v / 1e6, 1) + 'm';
  const a = Math.abs(v);
  if (o.short === 'abs') return '$' + (a >= 1e6 ? fixed(a / 1e6, 1) + 'M' : a >= 1000 ? Math.round(a / 1000) + 'K' : String(Math.round(a)));
  if (o.short === 'hyphen') return '$' + (a >= 1e6 ? fixed(v / 1e6, 1) + 'M' : a >= 1e3 ? Math.round(v / 1e3) + 'K' : Math.round(v));
  if (o.short) return (v < 0 ? '−$' : '$') + (a >= 1e6 ? fixed(a / 1e6, a >= 1e7 ? 0 : 1) + 'M' : a >= 1000 ? Math.round(a / 1000) + 'K' : String(Math.round(a)));
  return (v < 0 ? '−$' : '$') + grouped(Math.round(a));
}

export function pct(v, o = {}) {
  if (o.dp != null) return fixed(v * 100, o.dp) + '%';
  const r = Math.round(v * 100);
  if (o.abs) return Math.abs(r) + '%';
  if (o.minus) return (v < 0 ? '−' : '') + Math.abs(r) + '%';
  return r + '%';
}

// A move, as Today and the lists show it: no arrow under 1%, words past 300%. arrows: every move wears one.
export function change(v, o = {}) {
  if (o.arrows) return (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + pct(v, { abs: true });
  if (v >= 3) return 'new';
  if (v <= -1) return 'stopped';
  return (v >= 0.01 ? '▲ ' : v <= -0.01 ? '▼ ' : '') + pct(v, { abs: true });
}
