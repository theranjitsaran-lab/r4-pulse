// POST /api/summary { sheet } → { text, source: 'claude' | 'template', bad? }
// Home sends the figures it computed; Claude turns them into three to five sentences. The reply is
// kept only if every number in it is one the sheet holds (public/components/summary.js); otherwise,
// or with no ANTHROPIC_API_KEY, the template is used. One call per distinct sheet: the sheet only
// changes when the data does, so in practice Claude is called once a day.
'use strict';
const crypto = require('crypto');
const express = require('express');

const router = express.Router();
const cache = new Map();
const MODEL = 'claude-opus-5-5';
let lib;
const shared = () => lib || (lib = import('../public/components/summary.js'));

async function write(sheet, S, system, text) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)();
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    // on a safety decline, the API re-runs the request on a fallback model it chooses
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: system || S.SYSTEM,
    messages: [{ role: 'user', content: `The facts:\n${S.sheetText(sheet)}` }],
  });
  if (res.stop_reason === 'refusal') return null;
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() || null;
}

router.post('/', async (req, res) => {
  const sheet = req.body && Array.isArray(req.body.sheet) ? req.body.sheet.slice(0, 30) : null;
  if (!sheet || !sheet.every(f => f && typeof f.line === 'string' && f.line.length < 400)) return res.status(400).json({ error: 'sheet must be a list of { key, line }' });
  const S = await shared();
  // form 'home2': a headline and three keyed bullets (views/home2.js); otherwise the paragraph
  const home2 = req.body.form === 'home2';
  const template = { text: home2 ? S.templateHome2(sheet) : S.templateSummary(sheet), source: 'template' };
  if (!process.env.ANTHROPIC_API_KEY) return res.json(template);
  const key = crypto.createHash('sha256').update((home2 ? 'home2' : '') + JSON.stringify(sheet)).digest('hex');
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const text = home2 ? await write(sheet, S, S.HOME2_SYSTEM, S.home2SheetText(sheet)) : await write(sheet, S);
        if (!text) return template;
        const check = S.checkNumbers(text, sheet);
        if (home2 && !S.parseHome2(text, sheet)) { console.warn('summary: home2 reply not in four lines, template used'); return template; }
        if (!check.ok) { console.warn('summary: numbers not on the sheet, template used:', check.bad.join(' ')); return { ...template, bad: check.bad }; }
        return { text, source: 'claude' };
      } catch (e) {
        console.warn('summary: Claude call failed, template used:', e.message);
        cache.delete(key);   // try again on the next view
        return template;
      }
    })());
    if (cache.size > 50) cache.delete(cache.keys().next().value);
  }
  res.json(await cache.get(key));
});

// For the morning email (scripts/send_brief.js): Claude's sentences, kept only if every number in them
// is on the sheet; otherwise null, and the email uses its own plain lines.
async function writeChecked(sheet, { brief = false } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const S = await shared();
  try {
    const text = await write(sheet, S, brief ? S.BRIEF_SYSTEM : null);
    return text && S.checkNumbers(text, sheet).ok ? text : null;
  } catch (e) { console.warn('brief: Claude call failed:', e.message); return null; }
}

module.exports = router;
module.exports.writeChecked = writeChecked;
