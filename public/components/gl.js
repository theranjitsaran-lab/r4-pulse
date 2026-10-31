// The company's P&L by month, from the QuickBooks Profit and Loss by Month export loaded into
// model.gl_month (scripts/load_gl.js), sorted into the lines of the EBITDA bridge:
//   revenue        the Income section
//   cost_to_serve  the pools the cost model allocates (sql/model_schema.sql model.gl_pool, allocated):
//                  buildings and maintenance, warehouse, temporary labour, supplies, equipment, shred
//                  plant, drivers, vehicles, route software, uniforms, scanning, aviation and badging
//   sales          7335200 Sales payroll
//   management     7335100 Management payroll
//   overhead       every other operating expense
//   discretionary  owner-related and discretionary (docs/R4_GL_Allocation_Analysis.md §4): meals and
//                  entertainment, charitable contributions, owner health, personal expenses. Shown apart,
//                  never hidden: EBITDA is given before and after it
//   below          below EBITDA: interest, depreciation, amortisation, the Illinois PTE tax, Citadel
//                  pass-through (8700) and Other Income / Other Expense
// A line is sorted by its own account code, else by the nearest parent's (QuickBooks sub-accounts
// often carry unrelated codes), else by its name; anything unmatched is overhead and listed.
//   classify(code, name, parents, section) → bridge line
//   bridge(rows) → { months: [{ month, revenue, cost_to_serve, contribution, sales, management, overhead,
//                     ebitda, discretionary, ebitda_after, below }], unmatched }
export const LINES = ['revenue', 'cost_to_serve', 'sales', 'management', 'overhead', 'discretionary', 'below'];
export const NAMES = {
  revenue: 'Revenue', cost_to_serve: 'Cost to serve', contribution: 'Contribution', sales: 'Sales team',
  management: 'Management', overhead: 'Overheads', ebitda: 'EBITDA before discretionary', discretionary: 'Owner-related and discretionary',
  ebitda_after: 'EBITDA', below: 'Below EBITDA',
};

// account-code prefixes, longest first wins
const RULES = [
  ['7335200', 'sales'], ['7335100', 'management'],
  ['7335660', 'cost_to_serve'], ['7335650', 'cost_to_serve'], ['73356', 'cost_to_serve'], ['73357', 'cost_to_serve'],
  ['7335450', 'cost_to_serve'], ['7335440', 'cost_to_serve'],
  ['7028', 'cost_to_serve'], ['7030', 'cost_to_serve'], ['7031', 'cost_to_serve'], ['7032', 'cost_to_serve'], ['7033', 'cost_to_serve'],
  ['7385', 'cost_to_serve'], ['7435', 'cost_to_serve'], ['7095', 'cost_to_serve'], ['7098', 'cost_to_serve'],
  ['7011', 'cost_to_serve'], ['7064', 'cost_to_serve'], ['7410', 'cost_to_serve'],
  ['7337-1', 'discretionary'], ['7337-2', 'discretionary'], ['7195', 'discretionary'], ['7050', 'discretionary'],
  ['7360', 'below'], ['8700', 'below'],
].sort((a, b) => b[0].length - a[0].length);
const NAME_RULES = [
  [/trisha|personal exp/i, 'discretionary'],
  [/interest|depreciation|amorti[sz]ation/i, 'below'],
];

export const codeOf = s => { const m = String(s || '').trim().match(/^([0-9][0-9A-Za-z-]*)/); return m ? m[1] : null; };
function byCode(code) { if (!code) return null; const r = RULES.find(([p]) => code.startsWith(p)); return r ? r[1] : null; }

export function classify(code, name, parents = [], section = 'expense') {
  if (section === 'income') return 'revenue';
  if (section === 'other') return 'below';
  for (const [re, line] of NAME_RULES) if (re.test(name || '')) return line;
  const own = byCode(code);
  if (own) return own;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    for (const [re, line] of NAME_RULES) if (re.test(p.name || '')) return line;
    const l = byCode(p.code); if (l) return l;
  }
  return 'overhead';
}

// rows: [{ month: 'YYYY-MM-01', account, name, line, amount }] (amount: income positive, expense positive)
export function bridge(rows) {
  const by = new Map(), unmatched = new Map();
  for (const r of rows) {
    const m = String(r.month).slice(0, 10);
    const x = by.get(m) || Object.fromEntries([['month', m], ...LINES.map(l => [l, 0])]);
    x[r.line] = (x[r.line] || 0) + Number(r.amount || 0);
    by.set(m, x);
    if (r.line === 'overhead') { const k = r.name || r.account; unmatched.set(k, (unmatched.get(k) || 0) + Number(r.amount || 0)); }
  }
  const months = [...by.values()].sort((a, b) => a.month < b.month ? -1 : 1).map(x => {
    const contribution = x.revenue - x.cost_to_serve;
    const ebitda = contribution - x.sales - x.management - x.overhead;
    return { ...x, contribution, ebitda, ebitda_after: ebitda - x.discretionary };
  });
  return { months, overheadLines: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ account: k, amount: v })) };
}

// the last n months summed, for the bridge chart
export function sumMonths(months, n = 12) {
  const xs = months.slice(-n), keys = [...LINES, 'contribution', 'ebitda', 'ebitda_after'];
  return { from: xs.length ? xs[0].month : null, to: xs.length ? xs[xs.length - 1].month : null, n: xs.length,
    ...Object.fromEntries(keys.map(k => [k, xs.reduce((t, x) => t + x[k], 0)])) };
}
