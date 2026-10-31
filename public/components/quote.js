// One priced line's cost to serve, for Pricing and the quote builder (views/pricing.js) and Ask's quote
// tool (server/ask.js): the same function, so a quote in Ask matches the screen to the cent.
//   SERVICES: the service codes the cost model prices, with their family and unit
//   lineCost(R, { code, units, visits, miles, level1, postcode }, { acct, lines, Z })
//     acct: the account's margin record (fixtures/margin.json accounts), lines: its priced lines
//     returns costToServe's result with perUnit, and routeBasis for bins: 'account' (its own route
//     days), 'postcode' (route days in and around the quote's postcode) or 'average' (the average visit)
import { postcodeCost, quoteRoute } from './routecost.js';

export const SERVICES = {
  B2: { fam: 'bin', unit: 'bin service', size: 'B2' }, B3: { fam: 'bin', unit: 'bin service', size: 'B3' },
  B4: { fam: 'bin', unit: 'bin service', size: 'B4' }, B5: { fam: 'bin', unit: 'bin service', size: null },
  B6: { fam: 'bin', unit: 'bin service', size: 'B6' },
  R3: { fam: 'shredbox', unit: 'box' }, R4: { fam: 'shredbox', unit: 'box' }, R5: { fam: 'shredbox', unit: 'box' },
  S3: { fam: 'shredlb', unit: 'lb' },
  S4: { fam: 'itad', unit: 'device' }, S6: { fam: 'itad', unit: 'device' }, SR: { fam: 'itad', unit: 'device' },
  '01': { fam: 'trip', unit: 'trip' }, '02': { fam: 'handling', unit: 'box' }, '90': { fam: 'handling', unit: 'box' },
  '20': { fam: 'handling', unit: 'box' }, '25': { fam: 'handling', unit: 'box' }, '30': { fam: 'handling', unit: 'box' }, '33': { fam: 'handling', unit: 'box' },
  '55': { fam: 'driver', unit: 'hour' }, S0: { fam: 'driver', unit: 'hour' }, '54': { fam: 'centre', unit: 'hour' },
  STO: { fam: 'storage', unit: 'box a month' },
};

export function lineCost(R, st, { acct = null, lines = [], Z = {} } = {}) {
  const svc = SERVICES[st.code];
  if (!svc) return null;
  const u = Math.max(1, st.units || 1), v = st.visits || null, mi = st.miles || R.RATES.avgMiles.v;
  let c;
  if (svc.fam === 'bin') {
    const a = acct;
    const lb = a && a.main_bin === st.code ? lines.filter(l => l.servcode === 'S5B').reduce((t, l) => t + l.units, 0) : 0;
    const share = a && a.bins ? Math.min(1, u / a.bins) : 1;
    // the route: the account's own route days, else what route days in the quote's postcode cost, else the average visit
    const own = R.routeFor && R.routeFor(st.level1);
    const route = own || (st.postcode && quoteRoute(postcodeCost(R.routeCostsNow(), st.postcode, Z), u, v, R.SETTINGS)) || null;
    c = R.costToServe('bin', u, Object.assign({ visits: v, miles: mi, route }, lb > 0 ? { pounds: lb * share } : { binCode: svc.size }));
    c.routeBasis = own ? 'account' : route ? 'postcode' : 'average';
  } else if (svc.fam === 'handling') c = R.costToServe('handling', u);
  else if (svc.fam === 'trip') c = R.costToServe('movement', 0, { visits: v || u, miles: mi });
  else if (svc.fam === 'itad') c = R.costToServe('itad', u, { visits: v, miles: mi });
  else if (svc.fam === 'shredlb') c = R.costToServe('shred', u);
  else if (svc.fam === 'shredbox') c = R.costToServe('shred', u, { unit: 'box' });
  else if (svc.fam === 'driver') c = R.costToServe('labour', u);
  else if (svc.fam === 'centre') c = R.costToServe('labour', u, { isCentre: true });
  else if (svc.fam === 'storage') c = R.costToServe('storage', u / 12);
  if (svc.fam === 'trip' || svc.fam === 'storage') c.perUnit = c.total / u;
  return c;
}
