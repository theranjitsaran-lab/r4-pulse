// POST /api/ask { question, history? } → { answer, source: 'claude' | 'template', tools: [names] }
// Ask R4 Pulse: Claude answers from the app's own figures only. Its tools are thin wrappers over the
// functions the screens use (components/home2data.js, levers.js, margin.js, whitespace.js), so an
// answer can never disagree with a tile. A question outside the tools gets "not in the app yet" and
// where the figure would come from, never an invented number. Every number in the answer must appear
// in what the tools returned; if not, Claude is asked once to fix it, and then the answer is refused.
// With no ANTHROPIC_API_KEY (fixtures, the screenshots), the suggested questions get a template.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { cached, USE_FIXTURES } = require('./db');
const queries = require('./queries');
const R = require('../model/rates');

const router = express.Router();
const MODEL = 'claude-opus-5-5';
const ROOT = path.join(__dirname, '..');
let libs;
const load = () => libs || (libs = Promise.all(['home2data', 'levers', 'margin', 'chart', 'series'].map(n => import('../public/components/' + n + '.js').then(m => [n, m])))
  .then(Object.fromEntries));

// the data, as the screens read it (server/screendata.js)
const { data } = require('./screendata');

const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/(?!^)\b(Of|And|The|For|In|At|On|To)\b/g, w => w.toLowerCase()).replace(/\b(Llp|Llc|Pc|Inc|Icu|Itad)\b/g, w => w.toUpperCase());
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// ── the tools: each returns plain facts with its figures already written as the screens write them ──
function tools(L, D) {
  const { moneyK, money0 } = L.chart;
  const pc = v => v == null ? 'no comparison' : Math.abs(v) < 0.005 ? 'level' : (v > 0 ? 'up ' : 'down ') + Math.abs(Math.round(v * 100)) + '%';
  const signed = v => (v < 0 ? '−' : '+') + moneyK(Math.abs(v)).replace('−', '');
  const ser = L.series.seriesOf(D.C);
  const book = L.margin.buildMargins(D.R, D.M, { exclude: [] });
  const marginOf = new Map(book.accounts.map(a => [a.level1, a]));
  const names = new Map([...D.M.accounts.map(a => [a.level1, a.customer]), ...D.C.accounts.map(a => [a.level1, a.customer])]);

  const T = {
    overview: {
      description: "Trisha's number: this month's bill, next month's building ◇, the gap to $1.0M a month, this month's work against last month's at the same working day, last week's work, and the levers to $1.0M.",
      input: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: () => {
        const m = L.home2data.monthView(D), w = L.home2data.weekView(D), B = L.levers.bridge(D);
        return {
          latest_work_done: m.latestDone,
          last_posted_bill: `${mon(m.bill.lastMonth)}: ${moneyK(m.bill.lastCore)} core (storage plus service, Citadel apart)`,
          next_bill_building: m.next ? `${mon(m.next.month)}: about ${moneyK(m.next.central)} ◇, likely ${moneyK(m.next.lo)} to ${moneyK(m.next.hi)}, day ${m.next.day} of ${m.next.workdays}` : 'not yet priced',
          gap_to_target: `${moneyK(m.gap)} a month short of $1.0M`,
          work_this_month: m.vsLast != null ? `${mon(m.workMonth)}'s work at working day ${m.day}: ${moneyK(m.now)} ◇, ${pc(m.vsLast)} on ${mon(m.prevMonth)} at the same day` : 'not enough days yet',
          last_full_week: w.lastFull ? `week of ${w.lastFull.week}: ${moneyK(w.lastFull.value)} of work ◇ (${w.lastFull.done} services), ${pc(w.vsAvg)} on the average of the weeks before` : null,
          six_month_average: `${moneyK(B.today)} a month, ${mon(B.sixFrom)} to ${mon(B.sixTo)}`,
          levers: B.steps.map(s => `${s.t}: ${s.modelled ? 'up to ' : ''}${moneyK(s.v)} a month${s.modelled ? ' ◇ (a ceiling)' : ''} (${s.brief})`),
          new_business_needed: `${moneyK(B.newBusiness)} a month`,
        };
      },
    },
    segments: {
      description: 'Revenue by line of business (storage, shred bins, destruction, ITAD, retrieval, labour, delivery, fees): last month, the last three months and the year to date, each against the period before. Citadel apart.',
      input: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: () => {
        const s = L.home2data.segmentView(D);
        if (!s) return { note: 'segments are not in this snapshot' };
        return { month: mon(s.month), basis: s.basis, rows: s.rows.map(r => ({ line: r.name, last_month: moneyK(r.lm), vs_month_before: pc(r.lmPct), last_3_months: moneyK(r.l3m), vs_3_before: pc(r.l3mPct), year_to_date: moneyK(r.ytd), vs_last_year: pc(r.ytdPct) })) };
      },
    },
    customers_moving: {
      description: 'The largest customers, or those rising or slipping most: the last three months against the account\'s own twelve before them, in dollars a month. Citadel apart.',
      input: { type: 'object', properties: { kind: { type: 'string', enum: ['largest', 'rising', 'slipping'] } }, required: ['kind'], additionalProperties: false },
      run: ({ kind }) => {
        const c = L.home2data.customerView(D);
        const rows = { largest: c.top, rising: c.rising, slipping: c.falling }[kind] || [];
        return { kind, slipping_accounts: c.slipping, rows: rows.map(r => ({ level1: r.level1, customer: title(r.customer), last_3_months: `${moneyK(r.last3)} a month`, against_own_run: `${signed(r.d)} a month (${pc(r.pct)})`, storage_part: signed(r.storageMove), service_part: signed(r.serviceMove) })) };
      },
    },
    find_customer: {
      description: 'Find accounts by name. Returns account ids (level1) to pass to the customer tool.',
      input: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
      run: ({ name }) => {
        const q = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
        const hits = [...names].filter(([, n]) => q.every(w => n.toUpperCase().includes(w))).slice(0, 8);
        return { matches: hits.map(([level1, n]) => ({ level1, customer: title(n), last_12_months: ser.has(level1) ? moneyK(ser.get(level1).ltm) : 'not in the customer list' })) };
      },
    },
    customer: {
      description: "One account: its last 13 months, its movement against its own run, its margin by line ◇, what it doesn't buy yet and what comparable accounts spend on it ◇, and its prices against the book's median.",
      input: { type: 'object', properties: { level1: { type: 'integer' } }, required: ['level1'], additionalProperties: false },
      run: ({ level1 }) => {
        const s = ser.get(level1), m = marginOf.get(level1);
        if (!s && !m) return { error: `no account ${level1}` };
        const ws = L.home2data.crossSellView(D, 400).rows.find(r => r.level1 === level1);
        const meds = new Map();
        for (const r of D.PR.rates) if (r.modal_rate > 0) (meds.get(r.servcode) || meds.set(r.servcode, []).get(r.servcode)).push(r.modal_rate);
        const med = c => { const v = (meds.get(c) || []).sort((a, b) => a - b); return v.length >= 10 ? v[v.length >> 1] : null; };
        return {
          customer: title((s || m).customer), level1,
          months: s ? s.months.slice(-13).map((mm, i, a) => `${mm.slice(0, 7)}: ${moneyK(s.total[s.total.length - a.length + i])}`) : [],
          movement: s && s.move ? `last three months ${moneyK(s.move.last3)} a month against its own run of ${moneyK(s.move.run)}: ${signed(s.move.d)} a month` : null,
          margin_last_12_months: m ? { revenue: money0(m.revenue), cost: `${money0(m.cost)} ◇`, margin: `${m.margin < 0 ? '−' : '+'}${money0(Math.abs(m.margin)).replace('−', '')} ◇`,
            by_line: Object.entries(m.fam).map(([f, v]) => `${f}: revenue ${money0(v.revenue)}, cost ${money0(v.cost)} ◇`) } : null,
          not_bought_yet: ws ? ws.lines.filter(l => !l.have && l.opp > 0).map(l => `${l.name}: about ${moneyK(l.opp)} a year ◇ at what comparable accounts spend`) : [],
          prices: D.PR.rates.filter(r => r.level1 === level1 && r.modal_rate > 0).slice(0, 12).map(r => `${r.servcode} ${String(r.service).trim()}: $${r.modal_rate.toFixed(2)}${med(r.servcode) ? `, book median $${med(r.servcode).toFixed(2)}` : ''}${r.last_changed ? `, last changed ${r.last_changed}` : ''}`),
        };
      },
    },
    cross_sell: {
      description: "Cross-sell: the accounts with most to buy and which lines they don't buy yet ◇, and which line is missed most across the book.",
      input: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: () => {
        const c = L.home2data.crossSellView(D, 10);
        return { ceiling: `${moneyK(c.totalMonth)} a month ◇ if every account bought like its peers`, accounts: c.accounts,
          by_line: c.byLine.map(l => `${l.name}: ${moneyK(l.opp)} a year ◇ across ${l.accounts} accounts`),
          rows: c.rows.map(r => ({ level1: r.level1, customer: title(r.customer), spends: `${moneyK(r.total)} a year`, could_add: `${moneyK(r.opp)} a year ◇`, lines: r.lines.filter(l => !l.have && l.opp > 0).map(l => l.name) })) };
      },
    },
    destruction: {
      description: "Boxes eligible to shred (retention review overdue, not on hold or permanent): the one-off destruction fee, the storage revenue lost each month after, and the months the fee covers.",
      input: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: () => {
        const x = L.home2data.destructionView(D);
        return { boxes_held: x.boxes.toLocaleString('en-US'), eligible: x.eligible.toLocaleString('en-US'), share: Math.round(x.share * 100) + '%',
          fee_once: `${moneyK(x.fee)} at the book's median $${x.perBox.toFixed(2)} a box ◇`, storage_lost: `${moneyK(x.lostYear / 12)} a month, ${moneyK(x.lostYear)} a year`,
          fee_covers: `${Math.round(x.fee / (x.lostYear / 12))} months of the lost storage`,
          largest: x.rows.map(r => `${title(r.customer)}: ${r.eligible.toLocaleString('en-US')} boxes, ${moneyK(r.fee)} once, ${moneyK(r.lostYear)} a year of storage`) };
      },
    },
    route_density: {
      description: 'Where one more customer on the route visits R4 already makes would save most travel cost ◇, by postcode.',
      input: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: () => {
        const x = L.home2data.densityView(D);
        if (!x) return { note: 'postcode centres are not loaded' };
        return { postcodes_visited: x.points.length, with_one_customer: x.single, saving_top: `${moneyK(x.saving)} a year ◇ across the postcodes below`,
          postcodes: x.save.map(r => `${r.postcode}: ${Math.round(r.visitsYear)} visits a year, ${Math.round(r.miles)} miles out, one more customer saves about ${moneyK(r.saving)} a year ◇ (${title(r.names)})`) };
      },
    },
  };
  return T;
}

const SYSTEM = `You answer questions about R4 Services, a Chicago records-management and shredding firm, for its CEO and managers, from the R4 Pulse app's own figures. Use the tools; never answer a figure from memory or arithmetic of your own. If no tool covers the question, say in one sentence that the app does not hold that yet and where it would come from (VCK billing, Veri-Shred operations, the GL).

Write two to five short plain sentences, or a short list when comparing several things. Quote every figure exactly as a tool wrote it ($38K, 14%, −$35K): do not recompute, round differently or write numbers as words. Keep the ◇ mark after modelled figures. Citadel is held apart from every total. British spelling, US dollars, no headings, no markdown other than a dash list.`;

// numbers that must come from the tools: anything with $, %, K or M, and any figure over 31
const NUM = /[−-]?\$?\d[\d,]*(?:\.\d+)?\s?[KM%]?/g;
const norm = s => s.replace(/\s/g, '').replace(/^-/, '−').replace(/,$/, '');
function unchecked(text, facts) {
  const allowed = new Set();
  for (const n of (facts.match(NUM) || []).map(norm)) { allowed.add(n); allowed.add(n.replace(/^−/, '')); allowed.add(n.replace(/^\+/, '')); }
  return (String(text).match(NUM) || []).map(norm).filter(n => /\d/.test(n))
    .filter(n => /[$%KM]/.test(n) || Number(n.replace(/[^\d.]/g, '')) > 31)
    .filter(n => !/^(19|20)\d\d$/.test(n))          // a year
    .filter(n => !allowed.has(n) && !allowed.has(n.replace(/^[−+]/, '')));
}

async function claude(question, history, T) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)();
  const toolDefs = Object.entries(T).map(([name, t]) => ({ name, description: t.description, input_schema: t.input, strict: true }));
  const messages = [...history.slice(-6), { role: 'user', content: question }];
  let facts = '';
  const used = [];
  for (let turn = 0, fixed = false; turn < 8; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 4000, output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: SYSTEM, tools: toolDefs, messages,
    });
    if (res.stop_reason === 'refusal') return { answer: 'I can’t answer that one.', source: 'claude', tools: used };
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'tool_use') {
      const results = [];
      for (const b of res.content.filter(x => x.type === 'tool_use')) {
        used.push(b.name);
        let out;
        try { out = T[b.name] ? T[b.name].run(b.input || {}) : { error: 'no such tool' }; } catch (e) { out = { error: e.message }; }
        const text = JSON.stringify(out);
        facts += '\n' + text;
        results.push({ type: 'tool_result', tool_use_id: b.id, content: text });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    const answer = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const bad = unchecked(answer, facts + '\n' + question);
    if (!bad.length) return { answer, source: 'claude', tools: used };
    if (fixed) return { answer: 'I could not answer that with every figure checked against the app. Try asking about one customer or one line of business.', source: 'claude', tools: used, bad };
    fixed = true;
    messages.push({ role: 'user', content: `These figures are not in what the tools returned: ${bad.join(', ')}. Answer again using only figures exactly as the tools wrote them.` });
  }
  return { answer: 'That took too many steps. Try a narrower question.', source: 'claude', tools: used };
}

// the template: the suggested questions, answered straight from the tools
function template(question, T) {
  const q = question.toLowerCase();
  const lines = o => Object.values(o).flat().filter(v => typeof v === 'string');
  if (/track|month|target|1\.0m|gap/.test(q)) { const o = T.overview.run(); return [o.next_bill_building, o.gap_to_target, o.work_this_month, o.last_full_week].filter(Boolean).join('. ') + '.'; }
  if (/slip|losing|down|falling|call/.test(q)) { const o = T.customers_moving.run({ kind: 'slipping' }); return o.rows.slice(0, 3).map(r => `${r.customer}: ${r.against_own_run}`).join('. ') + `. ${o.slipping_accounts} accounts are slipping in all.`; }
  if (/cross|sell|upsell|buy/.test(q)) { const o = T.cross_sell.run(); return `Ceiling ${o.ceiling}. Most missed: ${o.by_line.slice(0, 2).join('; ')}. Largest: ${o.rows.slice(0, 3).map(r => `${r.customer} (${r.lines.join(', ')}, ${r.could_add})`).join('; ')}.`; }
  if (/shred|destr|retention|boxes/.test(q)) { const o = T.destruction.run(); return `${o.eligible} boxes (${o.share}) are eligible to shred: ${o.fee_once} once, then ${o.storage_lost} of storage lost. The fee covers ${o.fee_covers}.`; }
  if (/segment|line|itad|bins/.test(q)) { const o = T.segments.run(); return o.rows ? o.rows.slice(0, 4).map(r => `${r.line} ${r.last_month} in ${o.month}, ${r.vs_month_before}`).join('. ') + '.' : o.note; }
  return lines(T.overview.run()).slice(0, 3).join('. ') + '. Free questions need the Claude key on this server.';
}

router.post('/', async (req, res) => {
  const question = String((req.body || {}).question || '').trim().slice(0, 500);
  if (!question) return res.status(400).json({ error: 'ask a question' });
  const history = Array.isArray(req.body.history) ? req.body.history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content.slice(0, 2000) })) : [];
  try {
    const [L, D] = await Promise.all([load(), data()]);
    const T = tools(L, D);
    if (!process.env.ANTHROPIC_API_KEY) return res.json({ answer: template(question, T), source: 'template', tools: [] });
    res.json(await claude(question, history, T));
  } catch (e) {
    console.warn('ask:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
