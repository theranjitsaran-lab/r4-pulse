// Who an account is, for its customer page: two or three lines from the company's own public website, with the source
// and the date, and any inference labelled as Pulse's reading. Researched once and cached in fixtures/who.json, which is
// committed so the researched accounts survive a deploy; a new one is also held in memory, as the deploy disk is not kept.
//   GET  /api/customer/:id/who   what is cached, or { status: 'none' }
//   POST /api/customer/:id/who   research it now (admins, with an API key; each call costs a web search)
// Nothing is stored unless Claude names a source it really saw in its search results.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');

const FILE = path.join(__dirname, '..', 'fixtures', 'who.json');
const MODEL = 'claude-opus-5-5';
const router = express.Router();
let cache = null;
const read = () => { if (!cache) { try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; } } return cache; };
const keep = () => { try { fs.writeFileSync(FILE, JSON.stringify(cache, null, 1)); } catch (e) { console.warn('who: not written to disk:', e.message); } };

const SYSTEM = `You find out who a company or public body is, from its own public website, for a records-storage firm's account page.

Use web search to find the organisation's own website. Reply with one JSON object and nothing else:
{"lines": ["..."], "reading": "..." or null, "source": "https://..."}

lines: two short plain sentences of fact, taken from that website: what it does and where it is based. British spelling.
reading: at most one sentence on why its records might matter to a records-storage firm, which is your inference, or null.
source: the page you took the facts from.

Only state what the page says. If you cannot be sure which organisation this is, or cannot find its own website, reply {"lines": [], "reading": null, "source": null}. Never guess.`;

// the URLs the search really returned
const seen = content => { const out = new Set(); for (const b of content) if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) out.add(r.url); return out; };
const sameHost = (a, list) => { try { const h = new URL(a).hostname.replace(/^www\./, ''); return [...list].some(u => { try { return new URL(u).hostname.replace(/^www\./, '') === h; } catch { return false; } }); } catch { return false; } };

async function research(name) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)();
  const messages = [{ role: 'user', content: `The account is named "${name}", a customer in the Chicago area.` }];
  const urls = new Set();
  let res = null;
  // a long search can pause the turn: send it back to carry on
  for (let i = 0; i < 4; i++) {
    res = await client.beta.messages.create({ model: MODEL, max_tokens: 16000, output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: SYSTEM, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }], messages });
    for (const u of seen(res.content)) urls.add(u);
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  if (!res || res.stop_reason === 'refusal') return null;
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  if (!Array.isArray(j.lines) || !j.lines.length || !j.source || !sameHost(j.source, urls)) return null;
  return { lines: j.lines.slice(0, 3).map(String), reading: j.reading ? String(j.reading) : null, source: String(j.source), at: new Date().toISOString().slice(0, 10) };
}

router.get('/:id/who', (req, res) => {
  const w = read()[req.params.id];
  res.json(w ? { status: 'ok', ...w } : { status: 'none', canResearch: !!process.env.ANTHROPIC_API_KEY && !!(req.session && req.session.user && req.session.user.role === 'admin') });
});

router.post('/:id/who', async (req, res) => {
  if (!(req.session && req.session.user && req.session.user.role === 'admin')) return res.status(403).json({ error: 'Admins only.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Research needs an API key.' });
  const name = String((req.body && req.body.name) || '').slice(0, 120);
  if (!name) return res.status(400).json({ error: 'name' });
  try {
    const w = await research(name);
    if (!w) return res.json({ status: 'none', note: 'Could not confirm its own website.' });
    read()[req.params.id] = w; keep();
    res.json({ status: 'ok', ...w });
  } catch (e) { console.warn('who:', e.message); res.status(502).json({ error: 'Research did not finish.' }); }
});

module.exports = router;
