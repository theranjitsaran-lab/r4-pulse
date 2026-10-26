// node scripts/contrast.js
// Every text colour in tokens.css against the grounds it sits on, light and dark, by the WCAG
// contrast ratio. Text needs 4.5:1 (3:1 at 24px and over). Exits 1 if a text pair fails.
'use strict';
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'tokens.css'), 'utf8');
const block = re => { const m = css.match(re); if (!m) throw new Error('no block ' + re); return m[1]; };
const vars = text => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(m => [m[1], m[2]]));
const light = vars(block(/:root \{([\s\S]*?)\n\}/));
const dark = { ...light, ...vars(block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)) };

const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

// [text token, ground token, minimum]: what the screens actually set as text
const PAIRS = [
  ...['ink', 'ink-2', 'ink-3', 'ink-4'].flatMap(t => ['surface', 'ground', 'well'].map(g => [t, g, 4.5])),
  ['brand', 'surface', 4.5], ['brand', 'ground', 4.5],
  ['good', 'surface', 4.5], ['warn', 'surface', 4.5], ['bad', 'surface', 4.5],
  ['warn', 'warn-bg', 4.5], ['bad', 'bad-bg', 4.5],
  ['hero-ink', 'hero-bg', 4.5], ['hero-accent', 'hero-bg', 4.5], ['hero-accent', 'hero-bg-2', 4.5],
  ['hero-ink', 'lever-1', 4.5], ['hero-ink', 'lever-2', 4.5], ['ink-on-light', 'lever-3', 4.5], ['ink-on-light', 'lever-4', 4.5],
  ['ink-on-logo', 'logo-ground', 4.5], ['hero-ink', 'hero-bg-2', 4.5],   // the sign-in button
];

let failed = 0;
for (const [name, T] of [['light', light], ['dark', dark]]) {
  console.log(`\n${name}`);
  for (const [t, g, min] of PAIRS) {
    if (!T[t] || !T[g]) continue;
    const r = ratio(T[t], T[g]), ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${(`--${t} on --${g}`).padEnd(36)} ${r.toFixed(2)}:1`);
  }
}
console.log(failed ? `\n${failed} text pairs under 4.5:1` : '\nevery text pair passes');
process.exit(failed ? 1 : 0);
