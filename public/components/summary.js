// Home's opening paragraph. The figures are computed in the app and written into a sheet, one fact
// a line; the words are Claude's (server/summary.js), or the template below when Claude is not
// available. Whatever writes it, every number in the paragraph must be one the sheet holds, written
// the same way: a paragraph with any other number is thrown away and the template is shown.
// Used by Home and by the server, so both check the same way.

// numbers as they appear in prose: $632K, $1.0M, 63%, 1,167, 24, −$34K
const NUM = /[−-]?\$?\d[\d,]*(?:\.\d+)?\s?[KM%]?/g;
const norm = s => s.replace(/\s/g, '').replace(/^-/, '−').replace(/,$/, '');
export const numbersIn = text => (String(text).match(NUM) || []).map(norm).filter(n => /\d/.test(n));

// the sheet: [{ key, line }] where each line is a plain sentence fragment with its figures
export function sheetText(sheet) { return sheet.map(f => `- ${f.line}`).join('\n'); }

// every number in the text appears in the sheet (a figure may also appear without its minus sign,
// as in "down $34K")
export function checkNumbers(text, sheet) {
  const allowed = new Set();
  for (const n of numbersIn(sheetText(sheet))) { allowed.add(n); allowed.add(n.replace(/^−/, '')); }
  const bad = numbersIn(text).filter(n => !allowed.has(n) && !allowed.has(n.replace(/^−/, '')));
  return { ok: bad.length === 0, bad };
}

// the template: the sheet's lines that make the case, joined as sentences
export function templateSummary(sheet) {
  const pick = k => (sheet.find(f => f.key === k) || {}).say;
  return ['bill', 'next', 'levers', 'slipping'].map(pick).filter(Boolean).join(' ');
}

export const SYSTEM = `You write the opening paragraph of R4 Pulse, a management tool for R4 Services, a Chicago records-management and shredding firm. The reader is Trisha, the CEO, on her phone, once a week. Her number is core monthly revenue (storage plus service, the Citadel account held apart) against a target of $1.0M a month.

From the facts you are given, write three to five plain sentences: where this month's bill stands, where next month's is heading, the two levers that matter most, and the one account to worry about. Lead with what changed or matters most, not with a greeting.

Use only numbers that appear in the facts, written exactly as they appear there ($632K, 63%, 24). Do not calculate new figures, round differently or write numbers as words. Keep the ◇ mark after a modelled figure. British spelling, US dollars, no bullet points, no headings, no markdown. If the data is stale, say so in the first sentence.`;

// The morning email's opening: yesterday, not the month. Same rules on numbers.
export const BRIEF_SYSTEM = `You write the first lines of a morning email for R4 Services, a Chicago records-management and shredding firm. The reader is busy and has run the business for thirty years: never tell them what they already know.

From the facts you are given, write two or three plain sentences about yesterday: what was not normal, and the one thing worth doing about it today. If the facts say nothing was unusual, say so in one sentence and stop.

Use only numbers that appear in the facts, written exactly as they appear there. Do not calculate new figures or write numbers as words. Keep the ◇ mark after a modelled figure. British spelling, US dollars, no bullet points, no headings, no markdown.`;

// The new Home's summary (views/home2.js): one headline and three bullets, each bullet naming the
// fact it comes from, so a tap opens that fact's list. Claude's reply, one item a line:
//   the headline
//   [key] a bullet
// parseHome2 keeps only bullets whose key is on the sheet; the template takes the sheet's first
// lines marked lead and bullet.
export const HOME2_SYSTEM = `You write the top of R4 Pulse's Home screen for Trisha, the CEO of R4 Services, a Chicago records-management and shredding firm, read on her phone each morning. Her number is core monthly revenue (storage plus service, the Citadel account held apart) against a target of $1.0M a month.

From the facts you are given (each starts with its key in square brackets), write exactly four lines and nothing else:
line 1: one headline sentence of at most 18 words: is the month on track, and by how much.
lines 2 to 4: the three facts that most need her attention today, each a short sentence of at most 16 words, starting with that fact's key in square brackets, e.g. [slipping] City of Chicago is down $35K a month on its own run.

Use only numbers that appear in the facts, written exactly as they appear there. Do not calculate new figures, round differently or write numbers as words. Keep the ◇ mark after a modelled figure. If the data is stale, say so in the headline. British spelling, US dollars, no markdown, no bullet characters.`;

export function home2SheetText(sheet) { return sheet.map(f => `- [${f.key}] ${f.line}`).join('\n'); }

export function parseHome2(text, sheet) {
  const keys = new Set(sheet.map(f => f.key));
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length < 2 || /^\[/.test(lines[0])) return null;
  const bullets = lines.slice(1).map(l => l.match(/^\[([\w-]+)\]\s*(.+)$/)).filter(m => m && keys.has(m[1])).map(m => ({ key: m[1], text: m[2] }));
  return bullets.length >= 2 ? { headline: lines[0], bullets: bullets.slice(0, 3) } : null;
}

export function templateHome2(sheet) {
  const lead = sheet.find(f => f.lead) || sheet[0];
  return [lead.say || lead.line, ...sheet.filter(f => f.bullet).slice(0, 3).map(f => `[${f.key}] ${f.say || f.line}`)].join('\n');
}
