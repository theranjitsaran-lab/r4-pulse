// Sizes the five growth levers and bridges core revenue, for the decision ledger on Pulse.
//
//   node scripts/levers.js > levers_output.txt
//
// Read-only: the session is set read-only before the first query. Run it where DATABASE_URL
// reaches the database. Each section prints its own check so the figures can be reconciled;
// a section that fails prints its error and the rest still run.
//
// Windows: the bridge compares core January–June 2025 with March–August 2026 (the two six-month
// averages in DECISIONS.md). Everything else is the last twelve months, September 2025 to
// August 2026, with the rate history over the 24 months to August 2026.
'use strict';
require('dotenv').config();
const { Client } = require('pg');
const R = require('../model/rates');

const LTM = ['2025-09-01', '2026-09-01'];
const H24 = ['2024-09-01', '2026-09-01'];
const CITADEL = 6714;

const money = n => n == null ? '—' : (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
const num = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const pc = n => n == null ? '—' : (n * 100).toFixed(1) + '%';

function table(rows, cols) {
  if (!rows.length) { console.log('  (no rows)'); return; }
  const w = cols.map(([h, f]) => Math.max(h.length, ...rows.map(r => String(f(r)).length)));
  console.log('  ' + cols.map(([h], i) => h.padEnd(w[i])).join('  '));
  for (const r of rows) console.log('  ' + cols.map(([, f], i) => { const s = String(f(r)); return /^[−$\d.,%-]+$/.test(s) ? s.padStart(w[i]) : s.padEnd(w[i]); }).join('  '));
}

// Priced lines from both tables, a line present in both counted once.
const PL = `
  pl AS (
    SELECT level1, woid, woservid, servcodeid, units, totamt, wodate FROM priced_lines
    UNION ALL
    SELECT c.level1, c.woid, c.woservid, c.servcodeid, c.units, c.totamt, c.wodate FROM priced_lines_current c
    WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.woservid = c.woservid
                        AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)
  ),
  l AS (SELECT pl.*, s.servcode FROM pl JOIN servcode s USING (servcodeid)
        WHERE pl.wodate >= '${LTM[0]}' AND pl.wodate < '${LTM[1]}')`;

const sections = [];
const section = (title, fn) => sections.push([title, fn]);

// ── 1. Bridge ────────────────────────────────────────────────────────────────────────────
section('1. CORE BRIDGE — Jan–Jun 2025 average to Mar–Aug 2026 average, by account', async (q) => {
  const [k] = await q(`
    SELECT avg(core) FILTER (WHERE month BETWEEN '2025-01-01' AND '2025-06-01')::float AS c0,
           avg(core) FILTER (WHERE month BETWEEN '2026-03-01' AND '2026-08-01')::float AS c1
    FROM kpi.monthly`);
  const rows = await q(`
    WITH m AS (
      SELECT level1, max(customer) AS customer,
             coalesce(sum(storage) FILTER (WHERE month BETWEEN '2025-01-01' AND '2025-06-01'), 0) / 6 AS s0,
             coalesce(sum(service) FILTER (WHERE month BETWEEN '2025-01-01' AND '2025-06-01'), 0) / 6 AS v0,
             coalesce(sum(storage) FILTER (WHERE month BETWEEN '2026-03-01' AND '2026-08-01'), 0) / 6 AS s1,
             coalesce(sum(service) FILTER (WHERE month BETWEEN '2026-03-01' AND '2026-08-01'), 0) / 6 AS v1
      FROM kpi.customer_monthly WHERE level1 <> ${CITADEL} GROUP BY level1
    ),
    h AS (
      SELECT level1,
             avg(boxes) FILTER (WHERE to_date(mth, 'YYYY-MM') BETWEEN '2025-01-01' AND '2025-06-01') AS b0,
             avg(boxes) FILTER (WHERE to_date(mth, 'YYYY-MM') BETWEEN '2026-03-01' AND '2026-08-01') AS b1,
             sum(storage_billed) FILTER (WHERE to_date(mth, 'YYYY-MM') BETWEEN '2025-01-01' AND '2025-06-01')
               / nullif(sum(boxes) FILTER (WHERE to_date(mth, 'YYYY-MM') BETWEEN '2025-01-01' AND '2025-06-01'), 0) AS r0,
             sum(storage_billed) FILTER (WHERE to_date(mth, 'YYYY-MM') BETWEEN '2026-03-01' AND '2026-08-01')
               / nullif(sum(boxes) FILTER (WHERE to_date(mth, 'YYYY-MM') BETWEEN '2026-03-01' AND '2026-08-01'), 0) AS r1
      FROM storage_rate_hist GROUP BY level1
    )
    SELECT m.level1, m.customer, m.s0::float, m.v0::float, m.s1::float, m.v1::float,
           h.b0::float, h.b1::float, h.r0::float, h.r1::float
    FROM m LEFT JOIN h USING (level1)`);
  for (const r of rows) {
    r.ds = r.s1 - r.s0; r.dv = r.v1 - r.v0; r.d = r.ds + r.dv;
    // storage split: price at today's boxes, volume at the old rate, the rest is timing and mix
    r.price = (r.r1 != null && r.r0 != null && r.b1 != null) ? (r.r1 - r.r0) * r.b1 : 0;
    r.volume = (r.b1 != null && r.b0 != null && r.r0 != null) ? (r.b1 - r.b0) * r.r0 : (r.b1 == null ? -r.s0 : r.s1);
    r.other = r.ds - r.price - r.volume;
  }
  const sum = f => rows.reduce((t, r) => t + (r[f] || 0), 0);
  console.log(`  kpi.monthly core: ${money(k.c0)} → ${money(k.c1)}, change ${money(k.c1 - k.c0)}`);
  console.log(`  Sum over accounts:  storage ${money(sum('ds'))} + service ${money(sum('dv'))} = ${money(sum('d'))}   (must equal the change above)`);
  console.log(`  Storage split: price ${money(sum('price'))} · boxes ${money(sum('volume'))} · timing/mix ${money(sum('other'))}`);
  const lost = rows.filter(r => r.s0 + r.v0 > 0 && r.s1 + r.v1 <= 0);
  const won = rows.filter(r => r.s0 + r.v0 <= 0 && r.s1 + r.v1 > 0);
  console.log(`  Accounts gone to zero: ${lost.length}, ${money(lost.reduce((t, r) => t + r.d, 0))} · new accounts: ${won.length}, ${money(won.reduce((t, r) => t + r.d, 0))}`);
  rows.sort((a, b) => a.d - b.d);
  console.log('\n  20 largest falls:');
  table(rows.slice(0, 20), [['level1', r => r.level1], ['customer', r => (r.customer || '').slice(0, 34)], ['change/mo', r => money(r.d)],
    ['storage', r => money(r.ds)], ['  of which price', r => money(r.price)], ['  boxes', r => money(r.volume)], ['service', r => money(r.dv)]]);
  console.log('\n  10 largest rises:');
  table(rows.slice(-10).reverse(), [['level1', r => r.level1], ['customer', r => (r.customer || '').slice(0, 34)], ['change/mo', r => money(r.d)],
    ['storage', r => money(r.ds)], ['service', r => money(r.dv)]]);
  const top20 = rows.slice(0, 20).reduce((t, r) => t + r.d, 0);
  console.log(`\n  The 20 largest falls are ${money(top20)} of the ${money(sum('d'))}.`);
});

// ── 2. Pricing: rounds, never-raised accounts, storage escalator, contract dates ─────────
section('2. PRICING — what a rate round is worth, who it missed, and when contracts renew', async (q) => {
  const ups = await q(`
    SELECT servtype, count(*)::int AS changes,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY modal_rate / prev - 1)::float AS median_rise
    FROM (SELECT servtype, modal_rate, lag(modal_rate) OVER (PARTITION BY level1, servcodeid ORDER BY month) AS prev, month
          FROM v_rate_by_customer_service) x
    WHERE month >= '${H24[0]}' AND prev > 0 AND modal_rate > prev
    GROUP BY 1 ORDER BY changes DESC`);
  console.log('  Service rate rises, 24 months: median rise when a rate moved up, by service type');
  table(ups, [['servtype', r => r.servtype || '—'], ['rises', r => num(r.changes)], ['median rise', r => pc(r.median_rise)]]);

  const st = await q(`
    WITH h AS (SELECT level1, to_date(mth, 'YYYY-MM') AS m, storage_billed / nullif(boxes, 0) AS rate, storage_billed
               FROM storage_rate_hist WHERE to_date(mth, 'YYYY-MM') >= '${H24[0]}' AND to_date(mth, 'YYYY-MM') < '${H24[1]}'),
         a AS (SELECT level1,
                      round((array_agg(rate ORDER BY m))[1]::numeric, 3) AS first_rate,
                      round((array_agg(rate ORDER BY m DESC))[1]::numeric, 3) AS last_rate,
                      sum(storage_billed) FILTER (WHERE m >= '${LTM[0]}') AS ltm_storage
               FROM h GROUP BY level1)
    SELECT count(*)::int AS accounts,
           count(*) FILTER (WHERE last_rate > first_rate)::int AS raised,
           count(*) FILTER (WHERE last_rate = first_rate)::int AS flat,
           count(*) FILTER (WHERE last_rate < first_rate)::int AS cut,
           sum(ltm_storage)::float AS ltm_storage,
           sum(ltm_storage) FILTER (WHERE last_rate = first_rate)::float AS ltm_storage_flat,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY last_rate / nullif(first_rate, 0) - 1) FILTER (WHERE last_rate > first_rate)::float AS median_2yr_rise
    FROM a WHERE ltm_storage > 0`);
  const s = st[0];
  console.log(`\n  Storage rate per box, Sep 2024 vs Aug 2026, accounts billing storage in the last 12 months: ${num(s.accounts)}`);
  console.log(`    raised ${num(s.raised)} · flat ${num(s.flat)} · cut ${num(s.cut)} · median two-year rise where raised ${pc(s.median_2yr_rise)}`);
  console.log(`    LTM storage ${money(s.ltm_storage)}, of which on flat rates ${money(s.ltm_storage_flat)}`);
  console.log(`    A 3% / 5% yearly escalator on all storage: ${money(s.ltm_storage * 0.03 / 12)} / ${money(s.ltm_storage * 0.05 / 12)} a month in year one`);

  const never = await q(`
    WITH ${PL},
    rc AS (SELECT level1, max(last_changed) AS last_changed, count(DISTINCT servcodeid) AS codes
           FROM v_rate_by_customer_service WHERE month >= '${H24[0]}' GROUP BY level1),
    act AS (SELECT level1 FROM v_rate_by_customer_service GROUP BY level1
            HAVING min(month) < '${H24[0]}'::date + interval '3 months' AND max(month) >= '${LTM[1]}'::date - interval '3 months'),
    sh AS (SELECT level1, max(storage_billed / nullif(boxes, 0)) - min(storage_billed / nullif(boxes, 0)) AS spread
           FROM storage_rate_hist WHERE to_date(mth, 'YYYY-MM') >= '${H24[0]}' GROUP BY level1),
    rev AS (SELECT level1, sum(totamt) AS ltm_service, count(*) AS lines FROM l GROUP BY level1)
    SELECT rc.level1, (SELECT min(name) FROM customer c WHERE c.level1 = rc.level1) AS customer, rc.codes::int,
           rev.ltm_service::float, rev.lines::int, coalesce(sh.spread, 0)::float AS storage_spread
    FROM rc JOIN act USING (level1) LEFT JOIN rev USING (level1) LEFT JOIN sh USING (level1)
    WHERE (rc.last_changed IS NULL OR rc.last_changed < '${H24[0]}') AND rev.ltm_service > 0
    ORDER BY rev.ltm_service DESC`);
  const tot = never.reduce((t, r) => t + r.ltm_service, 0);
  console.log(`\n  Accounts with no service rate moved in 24 months (active at both ends): ${never.length}, LTM service ${money(tot)}`);
  table(never.slice(0, 20), [['level1', r => r.level1], ['customer', r => (r.customer || '').slice(0, 36)], ['codes', r => r.codes],
    ['LTM service', r => money(r.ltm_service)], ['lines', r => num(r.lines)], ['storage rate moved', r => r.storage_spread > 0.0005 ? 'yes' : 'no']]);

  const ce = await q(`
    WITH r AS (SELECT level1, sum(revenue) AS ltm FROM kpi.customer_monthly
               WHERE month >= '${LTM[0]}' AND month < '${LTM[1]}' GROUP BY level1)
    SELECT c.level1, min(c.name) AS customer, min(c.contractno) AS contractno, min(c.contexp) AS contexp, max(r.ltm)::float AS ltm
    FROM customer c JOIN r USING (level1) WHERE c.level = 1 OR c.level IS NULL
    GROUP BY c.level1 ORDER BY ltm DESC LIMIT 30`);
  const filled = ce.filter(r => r.contexp && r.contexp.trim()).length;
  console.log(`\n  Contract expiry on the 30 largest accounts: ${filled} of 30 have a contexp value`);
  table(ce, [['level1', r => r.level1], ['customer', r => (r.customer || '').slice(0, 36)], ['LTM revenue', r => money(r.ltm)],
    ['contractno', r => r.contractno || '—'], ['contexp (raw)', r => r.contexp || '—']]);
});

// ── 3. Bin contracts below cost ──────────────────────────────────────────────────────────
section('3. BIN WORK BELOW COST — bin revenue against the model\'s cost to serve, last 12 months', async (q) => {
  const rows = await q(`
    WITH ${PL},
    b AS (SELECT level1,
                 sum(totamt) FILTER (WHERE servcode IN ('B1','B2','B3','B4','B5','B6','B7','IR','IP','IB','IC'))::float AS bin_rev,
                 sum(totamt) FILTER (WHERE servcode IN ('IR','B7'))::float AS flat_fee_rev,
                 coalesce(sum(units) FILTER (WHERE servcode = 'S5'), 0)::float AS s5
          FROM l GROUP BY level1),
    so AS (SELECT NULLIF(level1, '')::int AS level1, NULLIF(date, '')::date AS date, NULLIF(route, '') AS route, NULLIF(cbtcode, '') AS bin
           FROM vs_service_orders WHERE billable = 'true'),
    v AS (SELECT level1, count(*)::int AS bins, count(DISTINCT (date, route))::int AS visits,
                 mode() WITHIN GROUP (ORDER BY bin) AS main_bin
          FROM so WHERE bin ~ '^B[1-6]$' AND date >= '${LTM[0]}' AND date < '${LTM[1]}' GROUP BY level1)
    SELECT v.level1, (SELECT min(name) FROM customer c WHERE c.level1 = v.level1) AS customer,
           v.bins, v.visits, v.main_bin, coalesce(b.bin_rev, 0) AS bin_rev, coalesce(b.flat_fee_rev, 0) AS flat_fee_rev, coalesce(b.s5, 0) AS s5
    FROM v LEFT JOIN b USING (level1)`);
  for (const r of rows) {
    const c = R.costToServe('bin', r.bins, Object.assign({ visits: r.visits || null }, r.s5 > 0 ? { pounds: r.s5 } : { binCode: r.main_bin }));
    r.cost = c.total; r.gap = r.bin_rev - r.cost; r.perBin = r.bins ? r.bin_rev / r.bins : 0; r.costBin = r.bins ? r.cost / r.bins : 0;
  }
  const below = rows.filter(r => r.gap < 0).sort((a, b) => a.gap - b.gap);
  const all = rows.reduce((t, r) => t + r.bin_rev, 0), cost = rows.reduce((t, r) => t + r.cost, 0);
  console.log(`  Bin accounts: ${rows.length}. Bin revenue ${money(all)} against modelled cost ${money(cost)} ◇ (split ${R.SETTINGS.split * 100}% travel)`);
  console.log(`  Below cost: ${below.length} accounts, ${money(below.reduce((t, r) => t + r.bin_rev, 0))} revenue, gap ${money(below.reduce((t, r) => t + r.gap, 0))} a year`);
  console.log(`    of which with a flat monthly fee (IR or B7): ${below.filter(r => r.flat_fee_rev > 0).length} accounts, gap ${money(below.filter(r => r.flat_fee_rev > 0).reduce((t, r) => t + r.gap, 0))}`);
  table(below.slice(0, 15), [['level1', r => r.level1], ['customer', r => (r.customer || '').slice(0, 34)], ['bins', r => num(r.bins)], ['visits', r => num(r.visits)],
    ['main', r => r.main_bin || '—'], ['revenue', r => money(r.bin_rev)], ['per bin', r => '$' + r.perBin.toFixed(2)], ['cost/bin', r => '$' + r.costBin.toFixed(2)],
    ['gap/yr', r => money(r.gap)], ['flat fee', r => r.flat_fee_rev > 0 ? 'yes' : 'no']]);
  for (const split of [0.3, 0.5]) {
    const was = R.SETTINGS.split; R.SETTINGS.split = split;
    const n = rows.filter(r => r.bin_rev < R.costToServe('bin', r.bins, Object.assign({ visits: r.visits || null }, r.s5 > 0 ? { pounds: r.s5 } : { binCode: r.main_bin })).total).length;
    R.SETTINGS.split = was;
    console.log(`  At a ${split * 100}% travel split, accounts below cost: ${n}`);
  }
});

// ── 4. Citadel ───────────────────────────────────────────────────────────────────────────
section('4. CITADEL — concentration and what it contributes', async (q) => {
  const [r] = await q(`
    WITH ${PL}
    SELECT (SELECT sum(ser_tot) FROM invoices WHERE custno = '00870' AND COALESCE(invdate, billdate) >= '${LTM[0]}' AND COALESCE(invdate, billdate) < '${LTM[1]}')::float AS ltm_service,
           (SELECT sum(ser_tot) FROM invoices WHERE COALESCE(invdate, billdate) >= '${LTM[0]}' AND COALESCE(invdate, billdate) < '${LTM[1]}')::float AS book_service,
           (SELECT sum(ret_tot + ser_tot) FROM invoices WHERE COALESCE(invdate, billdate) >= '${LTM[0]}' AND COALESCE(invdate, billdate) < '${LTM[1]}')::float AS book_total,
           (SELECT sum(units) FROM l WHERE level1 = ${CITADEL} AND servcode IN ('S4','S6','SR','SN','S9'))::float AS devices,
           (SELECT count(DISTINCT wodate::date) FROM l WHERE level1 = ${CITADEL} AND servcode IN ('S4','S6','SR','SN','S9'))::int AS collections,
           (SELECT sum(totamt) FROM l WHERE level1 = ${CITADEL} AND servcode = 'CC')::float AS rebate,
           (SELECT amount * 12 / months FROM model.gl_pool WHERE pool = 'citadel_direct')::float AS direct`);
  const months = await q(`SELECT to_char(month, 'Mon YY') AS m, citadel::float AS c FROM kpi.monthly WHERE month >= '${LTM[0]}' AND month < '${LTM[1]}' ORDER BY month`);
  const itad = R.costToServe('itad', r.devices || 0, { visits: r.collections || null }).total;
  const contrib = r.ltm_service - itad - (r.direct || 0);
  console.log(`  LTM Citadel service ${money(r.ltm_service)} = ${pc(r.ltm_service / r.book_service)} of service, ${pc(r.ltm_service / r.book_total)} of all revenue`);
  console.log(`  Devices ${num(r.devices)} in ${num(r.collections)} collection days; rebate (CC) ${money(r.rebate)} inside that service figure`);
  console.log(`  Modelled ITAD cost ${money(itad)} ◇ + direct temp labour ${money(r.direct)} → contribution ${money(contrib)} a year, ${money(contrib / 12)} a month`);
  console.log('  Monthly: ' + months.map(x => `${x.m} ${money(x.c)}`).join(' · '));
});

// ── 5. Scheduling ────────────────────────────────────────────────────────────────────────
section('5. SCHEDULING — the abandoned module and what route days carry', async (q) => {
  const pl = await q(`SELECT lplactive, count(*)::int AS n FROM vs_placement GROUP BY 1 ORDER BY 2 DESC`);
  console.log('  vs_placement by lplactive: ' + pl.map(x => `${x.lplactive || '(blank)'} ${num(x.n)}`).join(' · '));
  const [sv] = await q(`
    SELECT count(DISTINCT p.iplpk)::int AS placements,
           count(DISTINCT p.iplpk) FILTER (WHERE s.iplpk IS NOT NULL)::int AS serviced
    FROM vs_placement p
    LEFT JOIN (SELECT DISTINCT iplpk FROM vs_service_orders WHERE billable = 'true'
               AND NULLIF(date, '')::date >= '${LTM[0]}' AND NULLIF(date, '')::date < '${LTM[1]}') s USING (iplpk)
    WHERE lower(coalesce(p.lplactive, '')) IN ('true', 't', '1', '.t.')`);
  console.log(`  Active placements ${num(sv.placements)}, serviced at least once in the last 12 months ${num(sv.serviced)}, never ${num(sv.placements - sv.serviced)}`);
  const [sh] = await q(`SELECT count(*)::int AS n, max(NULLIF(tshupdate, '')) AS last_update, max(NULLIF(dshstart, '')) AS last_start FROM vs_schedule_hd`);
  const [sx] = await q(`SELECT count(*)::int AS n, max(NULLIF(tsxupdate, '')) AS last_update FROM vs_schedule_xref`);
  console.log(`  Schedule rules: ${num(sh.n)} headers, last updated ${sh.last_update || '—'}, latest start ${sh.last_start || '—'}; ${num(sx.n)} links to placements, last ${sx.last_update || '—'}`);
  const wd = await q(`
    SELECT to_char(date, 'Dy') AS day, extract(isodow FROM date)::int AS dow, count(*)::int AS route_days,
           avg(services_done)::float AS done, avg(stops_done)::float AS stops,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY services_done)::float AS p75
    FROM v_route_day WHERE services_done > 0 AND date >= '${LTM[0]}' AND date < '${LTM[1]}'
    GROUP BY 1, 2 ORDER BY 2`);
  console.log('  Route days by weekday, last 12 months (done work only):');
  table(wd, [['day', r => r.day], ['route days', r => num(r.route_days)], ['done services/day', r => r.done.toFixed(1)], ['done stops/day', r => r.stops.toFixed(1)], ['75th pct', r => num(r.p75)]]);
  const [t] = await q(`
    SELECT count(*)::int AS route_days, sum(services_done)::float AS done,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY services_done)::float AS p75
    FROM v_route_day WHERE services_done > 0 AND date >= '${LTM[0]}' AND date < '${LTM[1]}'`);
  const needed = Math.ceil(t.done / t.p75), saved = t.route_days - needed;
  console.log(`  If every route day carried today's 75th-percentile load (${num(t.p75)} done services): ${num(needed)} route days instead of ${num(t.route_days)},`);
  console.log(`  ${num(saved)} fewer, worth ${money(saved * R.RATES.routeDay.v)} a year at ${money(R.RATES.routeDay.v)} a route day ◇ — a ceiling, not a forecast`);
});

// ── 6. Storage annuity ───────────────────────────────────────────────────────────────────
section('6. STORAGE ANNUITY — boxes, erosion and the retention backlog', async (q) => {
  const m = await q(`SELECT to_char(to_date(mth, 'YYYY-MM'), 'Mon YY') AS m, to_date(mth, 'YYYY-MM') AS d, sum(boxes)::float AS boxes, sum(storage_billed)::float AS billed
                     FROM storage_rate_hist WHERE to_date(mth, 'YYYY-MM') >= '${H24[0]}' AND to_date(mth, 'YYYY-MM') < '${H24[1]}' GROUP BY 1, 2 ORDER BY 2`);
  if (m.length) {
    const a = m[0], b = m[m.length - 1], yrs = (m.length - 1) / 12;
    console.log(`  Boxes ${a.m} ${num(a.boxes)} → ${b.m} ${num(b.boxes)}: ${pc(b.boxes / a.boxes - 1)} over ${m.length - 1} months, ${pc(Math.pow(b.boxes / a.boxes, 1 / yrs) - 1)} a year`);
    console.log(`  Storage billed per box ${a.m} $${(a.billed / a.boxes).toFixed(4)} → ${b.m} $${(b.billed / b.boxes).toFixed(4)}; cost to house ${'$' + R.RATES.facilities.v.toFixed(4)} ◇`);
    console.log('  Monthly boxes: ' + m.map(x => `${x.m} ${num(x.boxes / 1000)}k`).join(' · '));
  }
  const [r] = await q(`SELECT sum(boxes)::float AS boxes, sum(review_overdue)::float AS overdue, sum(permanent)::float AS permanent,
                              sum(legal_hold)::float AS hold, sum(over_ten_years)::float AS ten FROM storage_retention`);
  console.log(`  storage_retention: ${num(r.boxes)} boxes · review overdue ${num(r.overdue)} · permanent ${num(r.permanent)} · legal hold ${num(r.hold)} · over ten years ${num(r.ten)}`);
  const top = await q(`
    WITH s AS (SELECT level1, sum(storage_billed) AS ltm FROM storage_rate_hist
               WHERE to_date(mth, 'YYYY-MM') >= '${LTM[0]}' AND to_date(mth, 'YYYY-MM') < '${LTM[1]}' GROUP BY level1)
    SELECT level1, (SELECT min(name) FROM customer c WHERE c.level1 = s.level1) AS customer, ltm::float,
           (ltm / sum(ltm) OVER ())::float AS share FROM s ORDER BY ltm DESC LIMIT 10`);
  console.log(`  Ten largest storage accounts hold ${pc(top.reduce((t, x) => t + x.share, 0))} of storage revenue:`);
  table(top, [['level1', x => x.level1], ['customer', x => (x.customer || '').slice(0, 36)], ['LTM storage', x => money(x.ltm)], ['share', x => pc(x.share)]]);
});

// ── 7. Reconciliation ────────────────────────────────────────────────────────────────────
section('7. RECONCILIATION — last 12 months, invoices vs kpi.monthly', async (q) => {
  const [r] = await q(`
    SELECT (SELECT sum(ret_tot) FROM invoices WHERE COALESCE(invdate, billdate) >= '${LTM[0]}' AND COALESCE(invdate, billdate) < '${LTM[1]}')::float AS inv_storage,
           (SELECT sum(ser_tot) FROM invoices WHERE COALESCE(invdate, billdate) >= '${LTM[0]}' AND COALESCE(invdate, billdate) < '${LTM[1]}')::float AS inv_service,
           (SELECT sum(storage) FROM kpi.monthly WHERE month >= '${LTM[0]}' AND month < '${LTM[1]}')::float AS kpi_storage,
           (SELECT sum(service) FROM kpi.monthly WHERE month >= '${LTM[0]}' AND month < '${LTM[1]}')::float AS kpi_service`);
  console.log(`  Storage: invoices ${money(r.inv_storage)} · kpi.monthly ${money(r.kpi_storage)} · difference ${money(r.inv_storage - r.kpi_storage)}`);
  console.log(`  Service: invoices ${money(r.inv_service)} · kpi.monthly ${money(r.kpi_service)} · difference ${money(r.inv_service - r.kpi_service)}`);
  console.log('  QuickBooks check (by hand): LTM revenue should sit within 0.4% of the accounts, $10.16m in the logic pack.');
});

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: process.env.PGSSL === '0' ? false : { rejectUnauthorized: false } });
  await db.connect();
  await db.query('SET default_transaction_read_only = on');
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  console.log(`R4 Pulse lever sizing · read-only · run ${new Date().toISOString().slice(0, 16)} · rates: route day $${R.RATES.routeDay.v.toFixed(2)}, shred ${'$' + R.RATES.shredPlant.v.toFixed(4)}/lb (model/rates.js seed)`);
  for (const [title, fn] of sections) {
    console.log(`\n${title}`);
    try { await fn(q); } catch (e) { console.log(`  FAILED: ${e.message}`); }
  }
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
