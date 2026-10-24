-- The cost model's inputs: GL pools, how each pool splits across the rates, and the volumes the
-- rates divide by. model/rates.js reads these at startup and derives every rate as pool ÷ volume.
-- Updated once a year; every change lands in change_log. Safe to re-run: the seed upserts.
--
-- GL: QuickBooks Profit and Loss Detail, 1 January 2025 – 4 June 2026, 17.1 months, read from the
-- account tree (totals "with sub-accounts"). amount is the 17.1-month figure; rates.js annualises
-- it × 12 ÷ months. Volumes: the database, twelve months 1 September 2025 – 31 August 2026.
-- Provisional until the monthly P&L to August 2026 arrives and the GL is restated over the same
-- twelve months as the volumes.

CREATE SCHEMA IF NOT EXISTS model;

CREATE TABLE IF NOT EXISTS model.gl_pool (
  pool         text PRIMARY KEY,
  gl_accounts  text[] NOT NULL,
  amount       numeric(14,2) NOT NULL,        -- over the period, not annualised
  months       numeric(5,2) NOT NULL,         -- length of the period, for annualising
  period_from  date NOT NULL,
  period_to    date NOT NULL,
  allocated    boolean NOT NULL,
  note         text
);

-- family names the rate a pool's share feeds: facilities, handling, shred_plant, route_day.
CREATE TABLE IF NOT EXISTS model.pool_split (
  pool    text NOT NULL REFERENCES model.gl_pool (pool),
  family  text NOT NULL,
  share   numeric(5,4) NOT NULL CHECK (share > 0 AND share <= 1),
  PRIMARY KEY (pool, family)
);

CREATE TABLE IF NOT EXISTS model.driver_volume (
  driver       text PRIMARY KEY,
  value        numeric(14,2) NOT NULL,
  period_from  date NOT NULL,
  period_to    date NOT NULL,
  source       text NOT NULL
);

-- Empty by decision (DECISIONS.md, 8 October 2026): every rate traces to a pool over a volume.
CREATE TABLE IF NOT EXISTS model.rate_override (
  rate    text PRIMARY KEY,
  value   numeric(14,6) NOT NULL,
  reason  text NOT NULL,
  set_by  text NOT NULL,
  set_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model.change_log (
  id          bigserial PRIMARY KEY,
  table_name  text NOT NULL,
  row_id      text NOT NULL,
  old         jsonb,
  new         jsonb,
  who         text NOT NULL DEFAULT current_user,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION model.log_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
BEGIN
  IF o IS DISTINCT FROM n THEN
    INSERT INTO model.change_log (table_name, row_id, old, new)
    VALUES (TG_TABLE_NAME, COALESCE(n, o) ->> TG_ARGV[0], o, n);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS log_change ON model.gl_pool;
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON model.gl_pool
  FOR EACH ROW EXECUTE FUNCTION model.log_change('pool');
DROP TRIGGER IF EXISTS log_change ON model.pool_split;
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON model.pool_split
  FOR EACH ROW EXECUTE FUNCTION model.log_change('pool');
DROP TRIGGER IF EXISTS log_change ON model.driver_volume;
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON model.driver_volume
  FOR EACH ROW EXECUTE FUNCTION model.log_change('driver');
DROP TRIGGER IF EXISTS log_change ON model.rate_override;
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON model.rate_override
  FOR EACH ROW EXECUTE FUNCTION model.log_change('rate');

-- ── Seed: GL pools, 1 Jan 2025 – 4 Jun 2026 ─────────────────────────────────────────────────
INSERT INTO model.gl_pool (pool, gl_accounts, amount, months, period_from, period_to, allocated, note) VALUES
  ('facilities',          '{7028,7335660}',                 1930871.65, 17.1, '2025-01-01', '2026-06-04', true,
     '7028 Bldg Exp with sub-accounts $1,777,803.49 (7030 3716 S. Iron $674,522.47, 7031 1301 W. 35th $832,815.24, 7032 3551 S. Iron $24,489.46, 7033 2723 W. 47th $245,976.32) plus 7335660 Maintenance payroll $153,068.16'),
  ('warehouse_perm',      '{7335600}',                       651400.61, 17.1, '2025-01-01', '2026-06-04', true,
     '7335600 Warehouse with sub-accounts: regular, hourly, overtime, health and payroll tax'),
  ('warehouse_temp',      '{7385}',                          383031.43, 17.1, '2025-01-01', '2026-06-04', true,
     '7385 Temporary Services: Anchor Staffing $271,166.18 + Banner Personnel $111,865.25'),
  ('warehouse_supplies',  '{7435}',                          154999.36, 17.1, '2025-01-01', '2026-06-04', true,
     '7435 Warehouse Supplies with sub-accounts'),
  ('warehouse_equipment', '{7095}',                           86576.09, 17.1, '2025-01-01', '2026-06-04', true,
     '7095 Equipment with sub-accounts $119,076.09 less Allegheny Paper Shredders $32,500 (in shred_maintenance). Includes 7098 Crown forklifts $12,204.80'),
  ('shred_maintenance',   '{7098}',                           32500.00, 17.1, '2025-01-01', '2026-06-04', true,
     '7098 Repairs: Allegheny Paper Shredders, plant maintenance'),
  ('shred_payroll',       '{7335650}',                        13945.79, 17.1, '2025-01-01', '2026-06-04', true,
     '7335650 Shredding with sub-accounts'),
  ('drivers',             '{7335700}',                       510097.77, 17.1, '2025-01-01', '2026-06-04', true,
     '7335700 Drivers with sub-accounts: regular, hourly, overtime, health and payroll tax'),
  ('vehicles',            '{7011}',                          226484.77, 17.1, '2025-01-01', '2026-06-04', true,
     '7011 Auto Expense with sub-accounts, including Teletrac $6,406.09 and 7011-6B Trisha Car insurance $17,998.77. 7400 Transportation is air travel and is not here'),
  ('route_software',      '{7064}',                           69426.04, 17.1, '2025-01-01', '2026-06-04', true,
     '7064 Computer: Routeware'),
  ('uniforms',            '{7410}',                           85799.43, 17.1, '2025-01-01', '2026-06-04', true,
     '7410 Uniforms, drivers and warehouse'),
  ('scanning',            '{7335450,7064}',                  538508.10, 17.1, '2025-01-01', '2026-06-04', true,
     '7335450 Scanning + Data Entry $468,568.40 plus 7064 Datamation $69,939.70. Allocated to scanning revenue, not to a rate'),
  ('citadel_direct',      '{7385}',                          167068.42, 17.1, '2025-01-01', '2026-06-04', true,
     '7385 Temporary Services billed against Citadel work. Direct to Citadel, not to a rate'),
  ('aviation_badging',    '{7335440}',                       234303.35, 17.1, '2025-01-01', '2026-06-04', true,
     '7335440 Aviation + Badging with sub-accounts. Direct to the City of Chicago aviation and badging accounts'),
  ('sales',               '{7335200}',                      1933770.14, 17.1, '2025-01-01', '2026-06-04', false,
     '7335200 Sales with sub-accounts, including benefits and taxes $258,523'),
  ('management',          '{7335100}',                       841534.32, 17.1, '2025-01-01', '2026-06-04', false,
     '7335100 Management with sub-accounts, including benefits and taxes $179,188'),
  ('owner_health',        '{7337-1,7337-2}',                 173237.00, 17.1, '2025-01-01', '2026-06-04', false,
     'Owner health. Excluded: owner cost'),
  ('salaries_unassigned', '{7333,7337,7338}',                 22329.00, 17.1, '2025-01-01', '2026-06-04', false,
     'Unassigned 7333/7337/7338 $22,119 and Service Center $210: no pool')
ON CONFLICT (pool) DO UPDATE SET
  gl_accounts = EXCLUDED.gl_accounts, amount = EXCLUDED.amount, months = EXCLUDED.months,
  period_from = EXCLUDED.period_from, period_to = EXCLUDED.period_to,
  allocated = EXCLUDED.allocated, note = EXCLUDED.note;

-- ── Seed: which rate each allocated pool feeds ───────────────────────────────────────────────
INSERT INTO model.pool_split (pool, family, share) VALUES
  ('facilities',          'facilities',  1.00),
  ('warehouse_perm',      'handling',    0.40),
  ('warehouse_perm',      'shred_plant', 0.60),
  ('warehouse_temp',      'handling',    0.40),
  ('warehouse_temp',      'shred_plant', 0.60),
  ('warehouse_supplies',  'handling',    1.00),
  ('warehouse_equipment', 'handling',    1.00),
  ('shred_maintenance',   'shred_plant', 1.00),
  ('shred_payroll',       'shred_plant', 1.00),
  ('drivers',             'route_day',   1.00),
  ('vehicles',            'route_day',   1.00),
  ('route_software',      'route_day',   1.00),
  ('uniforms',            'route_day',   0.50),
  ('uniforms',            'handling',    0.50)
ON CONFLICT (pool, family) DO UPDATE SET share = EXCLUDED.share;

-- ── Seed: volumes, twelve months 1 Sep 2025 – 31 Aug 2026, from the database ────────────────
INSERT INTO model.driver_volume (driver, value, period_from, period_to, source) VALUES
  ('route_days', 1322,    '2025-09-01', '2026-08-31',
     'v_route_day: route-days with at least one done service (billable = true)'),
  ('boxes',      1135790, '2025-09-01', '2026-08-31',
     'storage_rate_hist: mean of the twelve monthly box counts'),
  ('movements',  65065,   '2025-09-01', '2026-08-31',
     'priced_lines + priced_lines_current units on codes model.service_family marks volume = movements: retrieval, pull and return boxes 51,612 (servtype R box codes 45,439 + T returns 6,173) and delivery boxes 13,453. Returns and delivery boxes are handled in the warehouse too'),
  ('pounds',     1756127, '2025-09-01', '2026-08-31',
     'vs_service_orders weight on done orders. Partial: 60% is B3/B6 capacity defaults; 696,887 lb actually weighed'),
  ('visits',     4329,    '2025-09-01', '2026-08-31',
     'vs_service_orders: customer-days, distinct date × route × customer with a done service'),
  ('services',   25102,   '2025-09-01', '2026-08-31',
     'vs_service_orders: done services (billable = true). Completion is confirmed on 54% of services in the period')
ON CONFLICT (driver) DO UPDATE SET
  value = EXCLUDED.value, period_from = EXCLUDED.period_from, period_to = EXCLUDED.period_to,
  source = EXCLUDED.source;
DELETE FROM model.driver_volume WHERE driver = 'stops';

-- ── Service codes: which cost family each belongs to and what its units count ───────────────
-- unit: what one unit on a priced line means. drives_cost: the line's units feed the account's
-- cost build. volume: the model.driver_volume those units are counted in, if any.
-- Bin rotation and storage cost come from Veri-Shred services and box counts, not from these
-- lines, so their codes are revenue only here.
CREATE TABLE IF NOT EXISTS model.service_family (
  servcode     text PRIMARY KEY,
  servtype     text,
  family       text NOT NULL CHECK (family IN ('storage','handling','movement','bin','itad','labour','shred','none')),
  unit         text NOT NULL,
  drives_cost  boolean NOT NULL,
  volume       text,
  note         text
);

DROP TRIGGER IF EXISTS log_change ON model.service_family;
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON model.service_family
  FOR EACH ROW EXECUTE FUNCTION model.log_change('servcode');

INSERT INTO model.service_family (servcode, servtype, family, unit, drives_cost, volume, note) VALUES
  -- handling: warehouse box movements
  ('20', 'R', 'handling', 'box',  true,  'movements', 'retrieval per box'),
  ('22', 'R', 'handling', 'box',  true,  'movements', 'retrieval per box, rush'),
  ('25', 'R', 'handling', 'box',  true,  'movements', 'retrieval'),
  ('26', 'R', 'handling', 'box',  true,  'movements', 'retrieval, rush'),
  ('29', 'R', 'handling', 'box',  true,  'movements', 'rush retrieval box'),
  ('32', 'R', 'handling', 'box',  true,  'movements', 'rotate tape'),
  ('P1', 'R', 'handling', 'box',  true,  'movements', 'permanent withdrawal pull'),
  ('R2', 'R', 'handling', 'box',  true,  'movements', 'retrieval for recycling'),
  ('S1', 'R', 'handling', 'box',  true,  'movements', 'destruction pull, one row per box'),
  ('S2', 'R', 'handling', 'box',  false, NULL, 'charge line for the boxes S1 counts; its units would double-count'),
  ('P2', 'R', 'handling', 'box',  false, NULL, 'charge line for the permanent-withdrawal boxes P1 counts'),
  ('21', 'R', 'handling', 'file', false, NULL, 'file retrieval: files, not boxes'),
  ('23', 'R', 'handling', 'file', false, NULL, 'file retrieval, rush'),
  ('28', 'R', 'handling', 'file', false, NULL, 'rush file retrieval'),
  ('I1', 'R', 'handling', 'file', false, NULL, 'new file add'),
  ('30', 'T', 'handling', 'box',  true,  'movements', 'return per box'),
  ('31', 'T', 'handling', 'box',  true,  'movements', 'return per file, unit recorded as box'),
  ('33', 'T', 'handling', 'box',  true,  'movements', 'return per box'),
  ('34', 'T', 'handling', 'file', true,  'movements', 'return per file; inside the 65,065 as decided'),
  ('10', 'N', 'handling', 'box',  false, NULL, 'new carton intake; not in the movements volume'),
  ('12', 'N', 'handling', 'box',  false, NULL, 'new box department assignment; zero-rated'),
  -- movement: delivery and pickup
  ('01', 'D', 'movement', 'trip',   true,  NULL, 'delivery or pickup trip: one visit each'),
  ('02', 'D', 'movement', 'box',    true,  'movements', 'additional boxes on a delivery'),
  ('03', 'D', 'movement', 'box',    true,  'movements', 'delivery over 80 boxes'),
  ('90', 'D', 'movement', 'box',    true,  'movements', 'rush delivery'),
  ('91', 'D', 'movement', 'dollar', false, NULL, 'rush surcharge on 90; its boxes are counted there'),
  ('00', 'D', 'movement', 'stop',   false, NULL, 'zero-rated stop record alongside 01'),
  -- bin rotation: cost from Veri-Shred done services and customer-day visits
  ('B1', 'F', 'bin', 'service', false, NULL, '35 gallon; cost from Veri-Shred'),
  ('B2', 'F', 'bin', 'service', false, NULL, '95 gallon; cost from Veri-Shred'),
  ('B3', 'F', 'bin', 'service', false, NULL, 'executive; cost from Veri-Shred'),
  ('B4', 'F', 'bin', 'service', false, NULL, '65 gallon; cost from Veri-Shred'),
  ('B5', 'F', 'bin', 'service', false, NULL, '175 gallon; cost from Veri-Shred'),
  ('B6', 'F', 'bin', 'service', false, NULL, 'executive under-desk; cost from Veri-Shred'),
  ('B7', 'F', 'bin', 'dollar',  false, NULL, 'monthly rotation fee'),
  ('IR', 'F', 'bin', 'dollar',  false, NULL, 'flat monthly rotation fee: units are dollars'),
  ('IP', 'F', 'bin', 'service', false, NULL, 'bin purge'),
  ('IB', 'F', 'bin', 'box',     false, NULL, 'purge of bankers boxes at a bin site'),
  ('IC', 'F', 'bin', 'box',     false, NULL, 'purge of long boxes at a bin site'),
  -- itad: devices
  ('S4', 'S', 'itad', 'device', true,  NULL, 'certified electronic media destruction'),
  ('S6', 'S', 'itad', 'device', true,  NULL, 'certified destruction per computer hard drive'),
  ('SR', 'S', 'itad', 'device', true,  NULL, 'hard drive removal'),
  ('SN', 'S', 'itad', 'device', true,  NULL, 'network card removal'),
  ('S9', 'S', 'itad', 'device', true,  NULL, 'printer ribbons'),
  ('SI', 'S', 'itad', 'dollar', false, NULL, 'certified shredding ITAD: units are dollars'),
  -- shred: weighed paper, plant cost per pound, no route time of its own
  ('S3', 'S', 'shred', 'lb',         true,  NULL, 'certified shredding per lb'),
  ('S5', 'S', 'shred', 'lb',         true,  NULL, 'zero-rated weight record for bin and purge work'),
  ('R3', 'S', 'shred', 'box',        false, NULL, 'shredding fee per standard box; no weight on the line'),
  ('R4', 'S', 'shred', 'box',        false, NULL, 'shredding fee per letter box; no weight'),
  ('R5', 'S', 'shred', 'box',        false, NULL, 'shredding fee per legal box; no weight'),
  ('SC', 'S', 'shred', 'cubic foot', false, NULL, 'shredding by cubic foot; no weight'),
  -- labour
  ('53', 'L', 'labour', 'hour',   true,  NULL, 'customer support'),
  ('54', 'L', 'labour', 'hour',   true,  NULL, 'data entry'),
  ('55', 'L', 'labour', 'hour',   true,  NULL, 'labour'),
  ('S0', 'S', 'labour', 'hour',   true,  NULL, 'mobile shredding truck, hourly'),
  ('75', 'L', 'labour', 'box',    false, NULL, 'rebox per box; no hours on the line'),
  ('11', 'L', 'labour', 'box',    false, NULL, 'new box detail'),
  ('I2', 'L', 'labour', 'file',   false, NULL, 'new file processing'),
  ('PA', 'L', 'labour', 'dollar', false, NULL, 'pack up'),
  ('^A', 'L', 'none',   'dollar', false, NULL, 'minimum work order adjustment'),
  ('^B', 'L', 'none',   'dollar', false, NULL, 'minimum service order adjustment'),
  -- storage: cost from mean box counts, not from these lines
  ('VV', NULL, 'storage', 'dollar',     false, NULL, 'monthly storage'),
  ('CX', 'E',  'storage', 'cubic foot', false, NULL, 'cubic foot storage'),
  -- no cost family
  ('78', 'I', 'none', 'record', false, NULL, 'VCKweb digital storage'),
  ('79', 'I', 'none', 'record', false, NULL, 'InfoKeepr digital storage'),
  ('Z3', 'H', 'none', 'dollar', false, NULL, 'system access'),
  ('ZA', 'H', 'none', 'dollar', false, NULL, 'electronic retention'),
  ('Z4', 'H', 'none', 'image',  false, NULL, 'scanning: the scanning pool, not a rate'),
  ('ZC', 'H', 'none', 'image',  false, NULL, 'scanning, rush'),
  ('ZF', 'H', 'none', 'image',  false, NULL, 'image drawing'),
  ('ZI', 'H', 'none', 'image',  false, NULL, 'scanning, alternate'),
  ('59', 'C', 'none', 'each',   false, NULL, 'box lid, supplies sold'),
  ('60', 'C', 'none', 'each',   false, NULL, 'box body, supplies sold'),
  ('61', 'C', 'none', 'each',   false, NULL, 'legal transfer case lid'),
  ('62', 'C', 'none', 'each',   false, NULL, 'legal transfer case body'),
  ('70', 'C', 'none', 'each',   false, NULL, 'miracle box lid'),
  ('71', 'C', 'none', 'each',   false, NULL, 'miracle box body'),
  ('52', 'M', 'none', 'each',   false, NULL, 'mail'),
  ('72', 'M', 'none', 'box',    false, NULL, 'shipping and handling'),
  ('73', 'M', 'none', 'dollar', false, NULL, 'special shipping'),
  ('76', 'M', 'none', 'each',   false, NULL, 'shipping container'),
  ('77', 'M', 'none', 'each',   false, NULL, 'shipping container, legal'),
  ('96', 'M', 'none', 'each',   false, NULL, 'conference room rental'),
  ('C1', 'M', 'none', 'dollar', false, NULL, 'Citadel shipping charges'),
  ('LA', 'M', 'none', 'each',   false, NULL, 'barcode labels'),
  ('MN', 'M', 'none', 'dollar', false, NULL, 'miscellaneous fees'),
  ('PR', 'M', 'none', 'dollar', false, NULL, 'prepaid retention'),
  ('YY', 'M', 'none', 'each',   false, NULL, 'in/out charge per skid'),
  ('FU', 'E', 'none', 'dollar', false, NULL, 'monthly fuel surcharge'),
  ('99', 'Q', 'none', 'dollar', false, NULL, 'monthly administration fee'),
  ('P3', NULL, 'none', 'dollar', false, NULL, 'permanent withdrawal fee: a fee; the pull is P1'),
  ('CC', 'A',  'none', 'dollar', false, NULL, 'Citadel rebate: a revenue credit, not work')
ON CONFLICT (servcode) DO UPDATE SET
  servtype = EXCLUDED.servtype, family = EXCLUDED.family, unit = EXCLUDED.unit,
  drives_cost = EXCLUDED.drives_cost, volume = EXCLUDED.volume, note = EXCLUDED.note;
