// node scripts/tokenize.js <file.css> [--write]
// Puts a stylesheet on tokens.css: every font size onto the type scale, every space and size onto
// the 4px unit, radii onto the radius tokens, hairlines onto --hair. Media queries keep their
// breakpoints (CSS cannot read a variable there). Prints what is left that it could not place.
// Sizes off the 4px grid move to the nearest step: that is the point, not a side effect.
'use strict';
const fs = require('fs');

const FS = [[11.75, '--fs-tiny'], [12.75, '--fs-source'], [13.75, '--fs-label'], [14.75, '--fs-sm'], [15.5, '--fs-body'],
  [16.5, '--fs-body-lg'], [18.5, '--fs-head'], [21, '--fs-lead'], [23, '--fs-title'], [26, '--fs-num'], [30, '--fs-display-ph'],
  [33, '--fs-num-lg'], [43, '--fs-display'], [Infinity, '--fs-hero']];
const SP = { 4: '--sp-1', 8: '--sp-2', 12: '--sp-3', 16: '--sp-4', 20: '--sp-5', 24: '--sp-6', 32: '--sp-8', 40: '--sp-10', 48: '--sp-12' };
const RADIUS = v => v <= 3 ? '--r-xs' : v <= 8 ? '--r-sm' : v <= 12 ? '--r' : v < 100 ? '--r-lg' : '--r-pill';

const fontVar = v => FS.find(([max]) => v <= max)[1];
function lengthVar(v, prop) {
  if (v === 0) return '0';
  const neg = v < 0, a = Math.abs(v);
  let out;
  if (/radius/.test(prop)) out = `var(${RADIUS(a)})`;
  else if (a <= 1.5) out = 'var(--hair)';
  else if (a <= 2.5) out = 'var(--hair-2)';
  else if (a === 3) out = 'var(--hatch)';
  else {
    const k = Math.max(1, Math.round(a / 4));
    out = SP[k * 4] ? `var(${SP[k * 4]})` : `calc(var(--u) * ${k})`;
  }
  return neg ? `calc(${out} * -1)` : out;
}

function convert(css) {
  const left = [];
  // walk declarations; leave @media preludes alone
  const out = css.replace(/(^|[{;]\s*)([a-z-]+)\s*:\s*([^;{}]+)/gm, (m, pre, prop, val) => {
    if (prop === 'content') return m;
    // the two shadows first, before their lengths are rewritten
    let v = val.replace(/0 1px 2px rgba\(0, ?0, ?0, ?\.08\)/g, 'var(--shadow-sm)')
               .replace(/0 4px 20px rgba\(0, ?0, ?0, ?\.14\)/g, 'var(--shadow-pop)');
    if (prop === 'font-size') v = v.replace(/(\d*\.?\d+)px/g, (_, n) => `var(${fontVar(+n)})`);
    else if (prop === 'font') v = v.replace(/(\d*\.?\d+)px/g, (_, n) => `var(${fontVar(+n)})`);
    else v = v.replace(/(-?\d*\.?\d+)px/g, (_, n) => lengthVar(+n, prop));
    if (v === val) return m;           // a selector such as a:hover, or nothing to change
    if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(v)) left.push(`${prop}: ${v.trim()}`);
    return pre + prop + ': ' + v.trim();
  });
  return { out, left };
}

module.exports = { convert };
if (require.main === module) {
  const f = process.argv[2];
  const { out, left } = convert(fs.readFileSync(f, 'utf8'));
  if (process.argv.includes('--write')) fs.writeFileSync(f, out); else process.stdout.write(out);
  if (left.length) console.error('colours left for a token:\n  ' + left.join('\n  '));
}
