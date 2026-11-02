// node scripts/hallmark_compare.js [--before=baseline] [--after=after]
// Compares two runs of scripts/hallmark_pages.js: every screen's visible text, links, controls and URL must be
// identical, character for character. Prints each difference and exits 1 on any.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '.hallmark');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const BEFORE = path.join(ROOT, arg('before', 'baseline')), AFTER = path.join(ROOT, arg('after', 'after'));

// what is in one list and not the other, repeats counted
function difference(a, b) {
  const count = new Map(); for (const x of b) count.set(x, (count.get(x) || 0) + 1);
  const gone = []; for (const x of a) { const n = count.get(x) || 0; if (n) count.set(x, n - 1); else gone.push(x); }
  return gone;
}

let diffs = 0, screens = 0, lines = 0;
const say = (where, what, x) => { diffs++; if (diffs <= 200) console.log(`${where} ${what}: ${x}`); };
for (const f of fs.readdirSync(BEFORE).filter(x => x.endsWith('.json'))) {
  const a = JSON.parse(fs.readFileSync(path.join(BEFORE, f), 'utf8')), file = path.join(AFTER, f);
  if (!fs.existsSync(file)) { say(f, 'missing run', ''); continue; }
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, was] of Object.entries(a)) {
    const now = b[key], where = `${f.replace('.json', '')} ${key}`;
    if (!now) { say(where, 'missing screen', ''); continue; }
    screens++; lines += was.text.length;
    if (was.url !== now.url) say(where, 'url', `${was.url} → ${now.url}`);
    for (const k of ['text', 'links', 'controls']) {
      for (const x of difference(was[k], now[k])) say(where, `${k} gone`, x);
      for (const x of difference(now[k], was[k])) say(where, `${k} new`, x);
    }
    if (was.text.join('\n') !== now.text.join('\n') && !difference(was.text, now.text).length && !difference(now.text, was.text).length) say(where, 'text', 'same lines in a different order');
    for (const e of now.errors || []) say(where, 'page error', e);
  }
}
console.log(`${screens} screens, ${lines.toLocaleString('en-US')} lines of text, ${diffs} differences`);
process.exit(diffs ? 1 : 0);
