// Shared data access for every screen: each /api endpoint fetched once per page load, and
// model/rates.js (a classic script) added once. Screens never fetch directly.
const cache = new Map();

export function getJson(name, opts = {}) {
  if (!cache.has(name)) {
    cache.set(name, fetch('/api/' + name).then(async r => {
      if (!r.ok) { cache.delete(name); const e = new Error(`${name}: ${r.status}`); e.status = r.status; throw e; }
      return r.json();
    }));
  }
  return cache.get(name).then(j => opts.envelope ? j : j.data);
}

let ratesLoading = null;
export function loadRates() {
  if (window.R4RATES) return Promise.resolve(window.R4RATES);
  return ratesLoading || (ratesLoading = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = '/model/rates.js';
    s.onload = () => ok(window.R4RATES);
    s.onerror = () => { ratesLoading = null; fail(new Error('model/rates.js did not load')); };
    document.head.appendChild(s);
  }));
}

// VCK names are in capitals: title case, small words lower, acronyms and firm suffixes upper.
// Words with no vowel (SG, KPMG) and known acronyms stay in capitals; an s after an apostrophe stays low.
export const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())
  .replace(/'S\b/g, "'s")
  .replace(/(?!^)\b(Of|And|The|For|In|At|On|To)\b/g, m => m.toLowerCase())
  .replace(/\b(Llp|Pc|Inc|Llc|It|Icu|Cboe|Aha|Ups|Nfa|Usa|Ii|Iii|Itad)\b/g, m => m.toUpperCase())
  .replace(/\b(?!(?:Dr|Mr|Mrs|Ms|St|Mt)\b)[B-DF-HJ-NP-TV-XZ][b-df-hj-np-tv-xz]{1,3}\b/g, m => m.toUpperCase());

export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The calls log (server/log.js): what the team says about a flag and what they did.
export async function getLog(level1) {
  const r = await fetch('/api/log' + (level1 ? '?level1=' + level1 : ''));
  if (!r.ok) throw new Error('log: ' + r.status);
  return (await r.json()).data;
}
export async function postLog(entry) {
  const r = await fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'log: ' + r.status);
  return j.data;
}
