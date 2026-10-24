# Database schema

Snapshot of schemas `kpi`, `model`, `public`, taken 2026-10-24. Structure only, no data.
Row counts are `pg_class.reltuples` estimates, not exact counts.

## Schema `kpi`

| Name | Kind | Rows (approx.) |
|---|---|---|
| [`customer_monthly`](#kpicustomer_monthly) | table | ~44,524 |
| [`monthly`](#kpimonthly) | table | ~23 |

### `kpi.customer_monthly`

**table** · rows ~44,524 · primary key (`level1`, `month`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `month` | date | NOT NULL |
| 2 | `level1` | integer | NOT NULL |
| 3 | `custno` | text | yes |
| 4 | `customer` | text | yes |
| 5 | `storage` | numeric | yes |
| 6 | `service` | numeric | yes |
| 7 | `revenue` | numeric | yes |
| 8 | `trailing6_mean` | numeric | yes |
| 9 | `deviation_pct` | numeric | yes |
| 10 | `flag_down_2m` | boolean | yes |

### `kpi.monthly`

**table** · rows ~23 · primary key (`month`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `month` | date | NOT NULL |
| 2 | `storage` | numeric | yes |
| 3 | `service` | numeric | yes |
| 4 | `citadel` | numeric | yes |
| 5 | `core` | numeric | yes |
| 6 | `core_service` | numeric | yes |
| 7 | `storage_share_pct` | numeric | yes |
| 8 | `storage_growth_yoy_pct` | numeric | yes |
| 9 | `core_service_growth_yoy_pct` | numeric | yes |
| 10 | `storage_boxes` | bigint | yes |
| 11 | `retention_rate` | numeric | yes |
| 12 | `storage_gross_margin_pct` | numeric | yes |
| 13 | `service_gross_margin_pct` | numeric | yes |
| 14 | `revenue_per_sqft` | numeric | yes |
| 15 | `utilisation_pct` | numeric | yes |
| 16 | `perm_withdrawal_fees` | numeric | yes |
| 17 | `route_days` | bigint | yes |
| 18 | `stops_per_route_day` | numeric | yes |
| 19 | `revenue_per_stop` | numeric | yes |
| 20 | `revenue_per_route_hour` | numeric | yes |
| 21 | `route_day_margin` | numeric | yes |
| 22 | `pounds_per_route_day` | numeric | yes |
| 23 | `pounds_exec_default_pct` | numeric | yes |

## Schema `model`

| Name | Kind | Rows (approx.) |
|---|---|---|
| [`change_log`](#modelchange_log) | table | ~133 |
| [`driver_volume`](#modeldriver_volume) | table | unknown (never analysed) |
| [`gl_pool`](#modelgl_pool) | table | unknown (never analysed) |
| [`pool_split`](#modelpool_split) | table | unknown (never analysed) |
| [`rate_override`](#modelrate_override) | table | unknown (never analysed) |
| [`service_family`](#modelservice_family) | table | ~91 |

### `model.change_log`

**table** · rows ~133 · primary key (`id`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `id` | bigint | NOT NULL |
| 2 | `table_name` | text | NOT NULL |
| 3 | `row_id` | text | NOT NULL |
| 4 | `old` | jsonb | yes |
| 5 | `new` | jsonb | yes |
| 6 | `who` | text | NOT NULL |
| 7 | `changed_at` | timestamp with time zone | NOT NULL |

### `model.driver_volume`

**table** · rows unknown (never analysed) · primary key (`driver`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `driver` | text | NOT NULL |
| 2 | `value` | numeric(14,2) | NOT NULL |
| 3 | `period_from` | date | NOT NULL |
| 4 | `period_to` | date | NOT NULL |
| 5 | `source` | text | NOT NULL |

### `model.gl_pool`

**table** · rows unknown (never analysed) · primary key (`pool`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `pool` | text | NOT NULL |
| 2 | `gl_accounts` | text[] | NOT NULL |
| 3 | `amount` | numeric(14,2) | NOT NULL |
| 4 | `months` | numeric(5,2) | NOT NULL |
| 5 | `period_from` | date | NOT NULL |
| 6 | `period_to` | date | NOT NULL |
| 7 | `allocated` | boolean | NOT NULL |
| 8 | `note` | text | yes |

### `model.pool_split`

**table** · rows unknown (never analysed) · primary key (`pool`, `family`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `pool` | text | NOT NULL |
| 2 | `family` | text | NOT NULL |
| 3 | `share` | numeric(5,4) | NOT NULL |

### `model.rate_override`

**table** · rows unknown (never analysed) · primary key (`rate`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `rate` | text | NOT NULL |
| 2 | `value` | numeric(14,6) | NOT NULL |
| 3 | `reason` | text | NOT NULL |
| 4 | `set_by` | text | NOT NULL |
| 5 | `set_at` | timestamp with time zone | NOT NULL |

### `model.service_family`

**table** · rows ~91 · primary key (`servcode`)

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `servcode` | text | NOT NULL |
| 2 | `servtype` | text | yes |
| 3 | `family` | text | NOT NULL |
| 4 | `unit` | text | NOT NULL |
| 5 | `drives_cost` | boolean | NOT NULL |
| 6 | `volume` | text | yes |
| 7 | `note` | text | yes |

## Schema `public`

| Name | Kind | Rows (approx.) |
|---|---|---|
| [`customer`](#publiccustomer) | table | ~15,250 |
| [`invoices`](#publicinvoices) | table | ~82,172 |
| [`invoices_current`](#publicinvoices_current) | table | ~3,947 |
| [`priced_lines`](#publicpriced_lines) | table | ~112,838 |
| [`priced_lines_current`](#publicpriced_lines_current) | table | ~2,892 |
| [`servcode`](#publicservcode) | table | ~162 |
| [`storage_rate_hist`](#publicstorage_rate_hist) | table | ~6,508 |
| [`storage_rates`](#publicstorage_rates) | table | ~41,291 |
| [`storage_rates_stage`](#publicstorage_rates_stage) | table | unknown (never analysed) |
| [`storage_retention`](#publicstorage_retention) | table | ~6,042 |
| [`storage_summary`](#publicstorage_summary) | table | ~5,899 |
| [`vs_address`](#publicvs_address) | table | ~7,554 |
| [`vs_bin`](#publicvs_bin) | table | ~5,198 |
| [`vs_binmap`](#publicvs_binmap) | table | ~29,877 |
| [`vs_placement`](#publicvs_placement) | table | ~7,598 |
| [`vs_route_detail`](#publicvs_route_detail) | table | ~879 |
| [`vs_schedule_dt`](#publicvs_schedule_dt) | table | ~34,729 |
| [`vs_schedule_hd`](#publicvs_schedule_hd) | table | ~34,421 |
| [`vs_schedule_xref`](#publicvs_schedule_xref) | table | ~34,421 |
| [`vs_service_orders`](#publicvs_service_orders) | table | ~87,226 |
| [`work_order_units`](#publicwork_order_units) | table | ~4,536 |
| [`work_orders`](#publicwork_orders) | table | ~4,546 |
| [`v_current_run`](#publicv_current_run) | view | — |
| [`v_customer_monthly`](#publicv_customer_monthly) | view | — |
| [`v_kpi_industry`](#publicv_kpi_industry) | view | — |
| [`v_monthly_storage_service`](#publicv_monthly_storage_service) | view | — |
| [`v_rate_by_customer_service`](#publicv_rate_by_customer_service) | view | — |
| [`v_route_day`](#publicv_route_day) | view | — |

### `public.customer`

**table** · rows ~15,250 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `custno` | text | yes |
| 2 | `level1` | integer | yes |
| 3 | `level2` | integer | yes |
| 4 | `level3` | integer | yes |
| 5 | `level4` | integer | yes |
| 6 | `level` | integer | yes |
| 7 | `name` | text | yes |
| 8 | `dept` | text | yes |
| 9 | `inactive` | text | yes |
| 10 | `act_inact` | text | yes |
| 11 | `salesrep` | integer | yes |
| 12 | `servicerep` | integer | yes |
| 13 | `marketid` | integer | yes |
| 14 | `terms` | text | yes |
| 15 | `contractno` | text | yes |
| 16 | `contexp` | text | yes |
| 17 | `retminbill` | numeric | yes |
| 18 | `servminbil` | numeric | yes |
| 19 | `retdiscoun` | numeric | yes |
| 20 | `servdiscou` | numeric | yes |
| 21 | `rettier` | text | yes |
| 22 | `servtier` | text | yes |

### `public.invoices`

**table** · rows ~82,172 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `custno` | text | yes |
| 3 | `dept` | text | yes |
| 4 | `invoice_no` | text | yes |
| 5 | `billdate` | timestamp without time zone | yes |
| 6 | `invdate` | timestamp without time zone | yes |
| 7 | `ret_amt` | numeric | yes |
| 8 | `ret_tax` | numeric | yes |
| 9 | `ret_tot` | numeric | yes |
| 10 | `ser_amt` | numeric | yes |
| 11 | `ser_tax` | numeric | yes |
| 12 | `ser_tot` | numeric | yes |
| 13 | `grand_tot` | numeric | yes |
| 14 | `surcharge` | numeric | yes |
| 15 | `fuelsurtot` | numeric | yes |
| 16 | `salesrep` | integer | yes |
| 17 | `servicerep` | integer | yes |
| 18 | `terms` | text | yes |
| 19 | `type` | text | yes |
| 20 | `tax2charge` | text | yes |

### `public.invoices_current`

**table** · rows ~3,947 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `custno` | text | yes |
| 3 | `dept` | text | yes |
| 4 | `invoice_no` | text | yes |
| 5 | `invdate` | timestamp without time zone | yes |
| 6 | `ret_amt` | numeric | yes |
| 7 | `ret_tot` | numeric | yes |
| 8 | `ser_amt` | numeric | yes |
| 9 | `ser_tot` | numeric | yes |
| 10 | `grand_tot` | numeric | yes |
| 11 | `surcharge` | numeric | yes |
| 12 | `fuelsurtot` | numeric | yes |
| 13 | `salesrep` | integer | yes |
| 14 | `servicerep` | integer | yes |
| 15 | `terms` | text | yes |
| 16 | `type` | text | yes |
| 17 | `printed` | text | yes |

### `public.priced_lines`

**table** · rows ~112,838 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `levelid` | integer | yes |
| 3 | `woid` | integer | yes |
| 4 | `woservid` | integer | yes |
| 5 | `servcodeid` | integer | yes |
| 6 | `units` | numeric | yes |
| 7 | `rate` | numeric | yes |
| 8 | `totamt` | numeric | yes |
| 9 | `tottax` | numeric | yes |
| 10 | `wodate` | timestamp without time zone | yes |
| 11 | `invoiced` | text | yes |
| 12 | `invoice_no` | text | yes |
| 13 | `servtype` | text | yes |
| 14 | `servtier` | text | yes |

### `public.priced_lines_current`

**table** · rows ~2,892 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `levelid` | integer | yes |
| 3 | `woid` | integer | yes |
| 4 | `woservid` | integer | yes |
| 5 | `servcodeid` | integer | yes |
| 6 | `units` | numeric | yes |
| 7 | `rate` | numeric | yes |
| 8 | `totamt` | numeric | yes |
| 9 | `tottax` | numeric | yes |
| 10 | `wodate` | timestamp without time zone | yes |
| 11 | `invoiced` | text | yes |
| 12 | `invoice_no` | text | yes |

### `public.servcode`

**table** · rows ~162 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `servcodeid` | integer | yes |
| 2 | `servcode` | text | yes |
| 3 | `servtype` | text | yes |
| 4 | `description` | text | yes |
| 5 | `func` | text | yes |
| 6 | `unitofmeas` | text | yes |
| 7 | `taxable` | text | yes |
| 8 | `active` | text | yes |

### `public.storage_rate_hist`

**table** · rows ~6,508 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `mth` | text | yes |
| 2 | `level1` | integer | yes |
| 3 | `storage_billed` | numeric | yes |
| 4 | `boxes` | integer | yes |
| 5 | `rate_per_box` | numeric | yes |

### `public.storage_rates`

**table** · rows ~41,291 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `level2` | integer | yes |
| 3 | `level3` | integer | yes |
| 4 | `level4` | integer | yes |
| 5 | `levelid` | integer | yes |
| 6 | `level` | integer | yes |
| 7 | `retpriceid` | integer | yes |
| 8 | `mediaid` | integer | yes |
| 9 | `mediatype` | text | yes |
| 10 | `tierqty` | integer | yes |
| 11 | `activerate` | numeric | yes |
| 12 | `inactive_rate` | numeric | yes |
| 13 | `rettype` | text | yes |
| 14 | `active` | text | yes |
| 15 | `last_update` | text | yes |
| 16 | `lastaction` | text | yes |
| 17 | `changed_by` | text | yes |

### `public.storage_rates_stage`

**table** · rows unknown (never analysed) · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `raw` | text | yes |

### `public.storage_retention`

**table** · rows ~6,042 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `status` | text | yes |
| 3 | `boxtype` | text | yes |
| 4 | `home_loc` | text | yes |
| 5 | `review_overdue` | integer | yes |
| 6 | `permanent` | integer | yes |
| 7 | `legal_hold` | integer | yes |
| 8 | `over_ten_years` | integer | yes |
| 9 | `oldest_received` | timestamp without time zone | yes |
| 10 | `boxes` | integer | yes |

### `public.storage_summary`

**table** · rows ~5,899 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `status` | text | yes |
| 3 | `boxtype` | text | yes |
| 4 | `boxes` | integer | yes |

### `public.vs_address`

**table** · rows ~7,554 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `iappk` | text | yes |
| 2 | `ilocfk` | text | yes |
| 3 | `lapactive` | text | yes |
| 4 | `capphone1` | text | yes |
| 5 | `capext1` | text | yes |
| 6 | `lapneedlab` | text | yes |
| 7 | `iapdeptdef` | text | yes |
| 8 | `iapsortdef` | text | yes |
| 9 | `tapupdate` | text | yes |
| 10 | `capuser` | text | yes |
| 11 | `iapuser` | text | yes |
| 12 | `captime` | text | yes |
| 13 | `caparrive` | text | yes |

### `public.vs_bin`

**table** · rows ~5,198 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `ibnpk` | text | yes |
| 2 | `ilocfk` | text | yes |
| 3 | `ibtfk` | text | yes |
| 4 | `cbnbarcode` | text | yes |
| 5 | `cbndesc` | text | yes |
| 6 | `lbnactive` | text | yes |
| 7 | `cbnstatus` | text | yes |
| 8 | `tbncreate` | text | yes |
| 9 | `ibnlastwo` | text | yes |
| 10 | `lbnprinted` | text | yes |
| 11 | `tbnupdate` | text | yes |
| 12 | `cbnuser` | text | yes |
| 13 | `nbncost` | text | yes |

### `public.vs_binmap`

**table** · rows ~29,877 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `ibmpk` | text | yes |
| 2 | `iplfk` | text | yes |
| 3 | `ibnfk` | text | yes |
| 4 | `cbmbarcode` | text | yes |
| 5 | `tbmupdate` | text | yes |
| 6 | `cbmuser` | text | yes |

### `public.vs_placement`

**table** · rows ~7,598 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `iplpk` | text | yes |
| 2 | `icfk` | text | yes |
| 3 | `ilocfk_par` | text | yes |
| 4 | `ilocfk` | text | yes |
| 5 | `ibtfk` | text | yes |
| 6 | `cpldesc` | text | yes |
| 7 | `lplactive` | text | yes |
| 8 | `tplcreate` | text | yes |
| 9 | `iplbillcfk` | text | yes |
| 10 | `lplunconf` | text | yes |
| 11 | `cplorigin` | text | yes |
| 12 | `tplupdate` | text | yes |
| 13 | `cpluser` | text | yes |
| 14 | `cpltime` | text | yes |

### `public.vs_route_detail`

**table** · rows ~879 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `irdpk` | text | yes |
| 2 | `irhfk` | text | yes |
| 3 | `ilocfk` | text | yes |
| 4 | `irdorder` | text | yes |
| 5 | `trdupdate` | text | yes |
| 6 | `crduser` | text | yes |
| 7 | `crdtime` | text | yes |
| 8 | `nrddistanc` | text | yes |
| 9 | `irddisunfk` | text | yes |

### `public.vs_schedule_dt`

**table** · rows ~34,729 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `isdpk` | text | yes |
| 2 | `ishfk` | text | yes |
| 3 | `isdoccurs` | text | yes |
| 4 | `isdorder` | text | yes |
| 5 | `isdrepeat` | text | yes |
| 6 | `csdwhen` | text | yes |
| 7 | `dsdwhen` | text | yes |
| 8 | `isdwhen` | text | yes |
| 9 | `tsdupdate` | text | yes |
| 10 | `csduser` | text | yes |

### `public.vs_schedule_hd`

**table** · rows ~34,421 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `ishpk` | text | yes |
| 2 | `cshdesc` | text | yes |
| 3 | `ishoccurs` | text | yes |
| 4 | `dshstart` | text | yes |
| 5 | `cshstart` | text | yes |
| 6 | `dshlcalent` | text | yes |
| 7 | `cshlcalent` | text | yes |
| 8 | `tshupdate` | text | yes |
| 9 | `cshuser` | text | yes |

### `public.vs_schedule_xref`

**table** · rows ~34,421 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `isxpk` | text | yes |
| 2 | `ishfk` | text | yes |
| 3 | `csxcoktab` | text | yes |
| 4 | `csxcokfld` | text | yes |
| 5 | `isxcokey` | text | yes |
| 6 | `tsxupdate` | text | yes |
| 7 | `csxuser` | text | yes |

### `public.vs_service_orders`

**table** · rows ~87,226 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `isopk` | text | yes |
| 2 | `iwhpk` | text | yes |
| 3 | `date` | text | yes |
| 4 | `acdmwoid` | text | yes |
| 5 | `acdmcert` | text | yes |
| 6 | `icalpk` | text | yes |
| 7 | `level1` | text | yes |
| 8 | `level2` | text | yes |
| 9 | `level3` | text | yes |
| 10 | `level4` | text | yes |
| 11 | `level` | text | yes |
| 12 | `levelid` | text | yes |
| 13 | `custno` | text | yes |
| 14 | `dept` | text | yes |
| 15 | `dept3` | text | yes |
| 16 | `dept4` | text | yes |
| 17 | `desc` | text | yes |
| 18 | `company` | text | yes |
| 19 | `plocid` | text | yes |
| 20 | `address1` | text | yes |
| 21 | `p_address2` | text | yes |
| 22 | `p_mailstop` | text | yes |
| 23 | `city` | text | yes |
| 24 | `state` | text | yes |
| 25 | `zip` | text | yes |
| 26 | `zip4` | text | yes |
| 27 | `country` | text | yes |
| 28 | `slocid` | text | yes |
| 29 | `address2` | text | yes |
| 30 | `mailstop` | text | yes |
| 31 | `s_zip` | text | yes |
| 32 | `s_zip4` | text | yes |
| 33 | `iplpk` | text | yes |
| 34 | `ibillcpk` | text | yes |
| 35 | `lshredreci` | text | yes |
| 36 | `lshredincl` | text | yes |
| 37 | `signer` | text | yes |
| 38 | `ibtpk` | text | yes |
| 39 | `cbtcode` | text | yes |
| 40 | `cbtdesc` | text | yes |
| 41 | `ibnpk` | text | yes |
| 42 | `bin` | text | yes |
| 43 | `bindesc` | text | yes |
| 44 | `status` | text | yes |
| 45 | `routeid` | text | yes |
| 46 | `route` | text | yes |
| 47 | `routedesc` | text | yes |
| 48 | `rorder` | text | yes |
| 49 | `porder` | text | yes |
| 50 | `sorder` | text | yes |
| 51 | `created` | text | yes |
| 52 | `updated` | text | yes |
| 53 | `type` | text | yes |
| 54 | `selected` | text | yes |
| 55 | `billable` | text | yes |
| 56 | `printed` | text | yes |
| 57 | `scanned` | text | yes |
| 58 | `scanimport` | text | yes |
| 59 | `cvolume` | text | yes |
| 60 | `nvolume` | text | yes |
| 61 | `tvolume` | text | yes |
| 62 | `condition` | text | yes |
| 63 | `ckwoid` | text | yes |
| 64 | `currentbin` | text | yes |
| 65 | `incount` | text | yes |
| 66 | `tipcount` | text | yes |
| 67 | `outcount` | text | yes |
| 68 | `scanveradd` | text | yes |
| 69 | `takeaction` | text | yes |
| 70 | `finished` | text | yes |
| 71 | `nextvisit` | text | yes |
| 72 | `contact` | text | yes |
| 73 | `phone1` | text | yes |
| 74 | `ext1` | text | yes |
| 75 | `s_contact` | text | yes |
| 76 | `s_phone1` | text | yes |
| 77 | `s_ext1` | text | yes |
| 78 | `svc_time` | text | yes |
| 79 | `iscpk` | text | yes |
| 80 | `archived` | text | yes |
| 81 | `arch_type` | text | yes |
| 82 | `tsaupdate` | text | yes |
| 83 | `csauser` | text | yes |
| 84 | `transcount` | text | yes |
| 85 | `chkcount` | text | yes |
| 86 | `transient` | text | yes |
| 87 | `nfcount` | text | yes |
| 88 | `email` | text | yes |
| 89 | `s_email` | text | yes |
| 90 | `nbtcapacit` | text | yes |
| 91 | `cap_unit` | text | yes |
| 92 | `nbtweight` | text | yes |
| 93 | `wei_unit` | text | yes |
| 94 | `nbttare` | text | yes |
| 95 | `tare_unit` | text | yes |
| 96 | `nbtvalue` | text | yes |
| 97 | `ibtsize` | text | yes |
| 98 | `icphowtlly` | text | yes |
| 99 | `howtotally` | text | yes |
| 100 | `ialtheadid` | text | yes |
| 101 | `ialttranid` | text | yes |
| 102 | `driver` | text | yes |
| 103 | `offsite` | text | yes |
| 104 | `material` | text | yes |
| 105 | `starttime` | text | yes |
| 106 | `arrivetime` | text | yes |
| 107 | `irstart` | text | yes |
| 108 | `irend` | text | yes |
| 109 | `dlong` | text | yes |
| 110 | `dlat` | text | yes |
| 111 | `acctcode` | text | yes |
| 112 | `usercat1` | text | yes |
| 113 | `quantity` | text | yes |
| 114 | `weight` | text | yes |
| 115 | `hasitems` | text | yes |
| 116 | `siccode` | text | yes |

### `public.work_order_units`

**table** · rows ~4,536 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `woservid` | integer | yes |
| 2 | `woid` | integer | yes |
| 3 | `units` | numeric | yes |
| 4 | `detail_lines` | integer | yes |

### `public.work_orders`

**table** · rows ~4,546 · no primary key

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `level1` | integer | yes |
| 2 | `woservid` | integer | yes |
| 3 | `woid` | integer | yes |
| 4 | `servcodeid` | integer | yes |
| 5 | `received` | text | yes |
| 6 | `duedate` | text | yes |
| 7 | `serv_fin` | text | yes |
| 8 | `allservfin` | text | yes |
| 9 | `pstatus` | text | yes |
| 10 | `delivcode` | text | yes |
| 11 | `notes` | text | yes |

### `public.v_current_run`

**view**

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `part` | text | yes |
| 2 | `storage` | numeric | yes |
| 3 | `service` | numeric | yes |
| 4 | `citadel` | numeric | yes |
| 5 | `invoices` | bigint | yes |
| 6 | `earliest_work_date` | date | yes |
| 7 | `latest_work_date` | date | yes |
| 8 | `earliest_invdate` | date | yes |
| 9 | `latest_invdate` | date | yes |

```sql
WITH w AS (
         SELECT priced_lines_current.invoice_no,
            min(priced_lines_current.wodate)::date AS first_wo,
            max(priced_lines_current.wodate)::date AS last_wo
           FROM priced_lines_current
          GROUP BY priced_lines_current.invoice_no
        )
 SELECT
        CASE
            WHEN c.invdate IS NULL THEN 'run'::text
            ELSE 'pending'::text
        END AS part,
    sum(c.ret_tot) AS storage,
    sum(c.ser_tot) AS service,
    COALESCE(sum(c.ser_tot) FILTER (WHERE c.custno = '00870'::text), 0::numeric) AS citadel,
    count(*) AS invoices,
    min(w.first_wo) AS earliest_work_date,
    max(w.last_wo) AS latest_work_date,
    min(c.invdate)::date AS earliest_invdate,
    max(c.invdate)::date AS latest_invdate
   FROM invoices_current c
     LEFT JOIN w USING (invoice_no)
  GROUP BY (
        CASE
            WHEN c.invdate IS NULL THEN 'run'::text
            ELSE 'pending'::text
        END);
```

### `public.v_customer_monthly`

**view**

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `month` | date | yes |
| 2 | `level1` | integer | yes |
| 3 | `custno` | text | yes |
| 4 | `customer` | text | yes |
| 5 | `storage` | numeric | yes |
| 6 | `service` | numeric | yes |
| 7 | `revenue` | numeric | yes |
| 8 | `trailing6_mean` | numeric | yes |
| 9 | `deviation_pct` | numeric | yes |
| 10 | `flag_down_2m` | boolean | yes |

```sql
WITH months AS (
         SELECT v_monthly_storage_service.month
           FROM v_monthly_storage_service
        ), inv AS (
         SELECT date_trunc('month'::text, COALESCE(invoices.invdate, invoices.billdate))::date AS month,
            invoices.level1,
            min(invoices.custno) AS custno,
            sum(invoices.ret_tot) AS storage,
            sum(invoices.ser_tot) AS service
           FROM invoices
          GROUP BY (date_trunc('month'::text, COALESCE(invoices.invdate, invoices.billdate))::date), invoices.level1
        ), cust AS (
         SELECT inv.level1,
            min(inv.custno) AS custno,
            min(inv.month) AS first_month
           FROM inv
          WHERE (inv.month IN ( SELECT months.month
                   FROM months))
          GROUP BY inv.level1
        ), names AS (
         SELECT DISTINCT ON (customer.level1) customer.level1,
            customer.name
           FROM customer
          ORDER BY customer.level1, customer.level
        ), r AS (
         SELECT m.month,
            c.level1,
            c.custno,
            COALESCE(i.storage, 0::numeric) AS storage,
            COALESCE(i.service, 0::numeric) AS service,
            COALESCE(i.storage, 0::numeric) + COALESCE(i.service, 0::numeric) AS revenue
           FROM months m
             JOIN cust c ON m.month >= c.first_month
             LEFT JOIN inv i ON i.month = m.month AND i.level1 = c.level1
        ), t AS (
         SELECT r.month,
            r.level1,
            r.custno,
            r.storage,
            r.service,
            r.revenue,
            avg(r.revenue) OVER w AS mean6,
            count(*) OVER w AS prior
           FROM r
          WINDOW w AS (PARTITION BY r.level1 ORDER BY r.month ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING)
        ), d AS (
         SELECT t.month,
            t.level1,
            t.custno,
            t.storage,
            t.service,
            t.revenue,
            t.mean6,
            t.prior,
                CASE
                    WHEN t.prior = 6 THEN round(t.mean6, 2)
                    ELSE NULL::numeric
                END AS trailing6_mean,
                CASE
                    WHEN t.prior = 6 AND t.mean6 > 0::numeric THEN round(100::numeric * (t.revenue - t.mean6) / t.mean6, 1)
                    ELSE NULL::numeric
                END AS deviation_pct
           FROM t
        )
 SELECT d.month,
    d.level1,
    d.custno,
    n.name AS customer,
    d.storage,
    d.service,
    d.revenue,
    d.trailing6_mean,
    d.deviation_pct,
    COALESCE(d.deviation_pct < 0::numeric AND lag(d.deviation_pct) OVER (PARTITION BY d.level1 ORDER BY d.month) < 0::numeric, false) AS flag_down_2m
   FROM d
     LEFT JOIN names n USING (level1);
```

### `public.v_kpi_industry`

**view**

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `month` | date | yes |
| 2 | `storage` | numeric | yes |
| 3 | `service` | numeric | yes |
| 4 | `citadel` | numeric | yes |
| 5 | `core` | numeric | yes |
| 6 | `core_service` | numeric | yes |
| 7 | `storage_share_pct` | numeric | yes |
| 8 | `storage_growth_yoy_pct` | numeric | yes |
| 9 | `core_service_growth_yoy_pct` | numeric | yes |
| 10 | `storage_boxes` | bigint | yes |
| 11 | `retention_rate` | numeric | yes |
| 12 | `storage_gross_margin_pct` | numeric | yes |
| 13 | `service_gross_margin_pct` | numeric | yes |
| 14 | `revenue_per_sqft` | numeric | yes |
| 15 | `utilisation_pct` | numeric | yes |
| 16 | `perm_withdrawal_fees` | numeric | yes |
| 17 | `route_days` | bigint | yes |
| 18 | `stops_per_route_day` | numeric | yes |
| 19 | `revenue_per_stop` | numeric | yes |
| 20 | `revenue_per_route_hour` | numeric | yes |
| 21 | `route_day_margin` | numeric | yes |
| 22 | `pounds_per_route_day` | numeric | yes |
| 23 | `pounds_exec_default_pct` | numeric | yes |

```sql
WITH m AS (
         SELECT v_monthly_storage_service.month,
            v_monthly_storage_service.storage,
            v_monthly_storage_service.service,
            v_monthly_storage_service.citadel,
            v_monthly_storage_service.core
           FROM v_monthly_storage_service
        ), citadel AS (
         SELECT DISTINCT customer.level1
           FROM customer
          WHERE customer.custno = '00870'::text
        ), vol AS (
         SELECT to_date(storage_rate_hist.mth, 'YYYY-MM'::text) AS month,
            sum(storage_rate_hist.boxes) AS boxes
           FROM storage_rate_hist
          GROUP BY (to_date(storage_rate_hist.mth, 'YYYY-MM'::text))
        ), pw AS (
         SELECT date_trunc('month'::text, COALESCE(i.invdate, i.billdate))::date AS month,
            sum(p.totamt) AS fees
           FROM priced_lines p
             JOIN servcode s USING (servcodeid)
             JOIN invoices i USING (invoice_no)
          WHERE s.servcode = ANY (ARRAY['P1'::text, 'P2'::text, 'P3'::text, 'P5'::text, 'PC'::text])
          GROUP BY (date_trunc('month'::text, COALESCE(i.invdate, i.billdate))::date)
        ), ops AS (
         SELECT date_trunc('month'::text, v_route_day.date::timestamp with time zone)::date AS month,
            count(*) FILTER (WHERE v_route_day.services_done > 0) AS route_days,
            sum(v_route_day.stops_done) AS stops,
            sum(v_route_day.pounds) AS pounds,
            sum(v_route_day.pounds_exec_default) AS pounds_exec_default
           FROM v_route_day
          WHERE v_route_day.date IS NOT NULL
          GROUP BY (date_trunc('month'::text, v_route_day.date::timestamp with time zone)::date)
        ), destruction AS (
         SELECT date_trunc('month'::text, l.wodate)::date AS month,
            sum(l.totamt) AS revenue
           FROM ( SELECT priced_lines.level1,
                    priced_lines.servcodeid,
                    priced_lines.wodate,
                    priced_lines.totamt,
                    priced_lines.invoiced
                   FROM priced_lines
                UNION ALL
                 SELECT priced_lines_current.level1,
                    priced_lines_current.servcodeid,
                    priced_lines_current.wodate,
                    priced_lines_current.totamt,
                    priced_lines_current.invoiced
                   FROM priced_lines_current) l
             JOIN servcode s USING (servcodeid)
          WHERE lower(l.invoiced) = 'true'::text AND (s.servtype = ANY (ARRAY['F'::text, 'S'::text])) AND NOT (l.level1 IN ( SELECT citadel.level1
                   FROM citadel))
          GROUP BY (date_trunc('month'::text, l.wodate)::date)
        )
 SELECT m.month,
    m.storage,
    m.service,
    m.citadel,
    m.core,
    m.service - m.citadel AS core_service,
    round(100::numeric * m.storage / NULLIF(m.core, 0::numeric), 1) AS storage_share_pct,
    round(100::numeric * (m.storage / NULLIF(ly.storage, 0::numeric) - 1::numeric), 1) AS storage_growth_yoy_pct,
    round(100::numeric * ((m.service - m.citadel) / NULLIF(ly.service - ly.citadel, 0::numeric) - 1::numeric), 1) AS core_service_growth_yoy_pct,
    vol.boxes AS storage_boxes,
    NULL::numeric AS retention_rate,
    NULL::numeric AS storage_gross_margin_pct,
    NULL::numeric AS service_gross_margin_pct,
    NULL::numeric AS revenue_per_sqft,
    NULL::numeric AS utilisation_pct,
    COALESCE(pw.fees, 0::numeric) AS perm_withdrawal_fees,
    ops.route_days,
    round(ops.stops / NULLIF(ops.route_days, 0)::numeric, 1) AS stops_per_route_day,
    round(destruction.revenue / NULLIF(ops.stops, 0::numeric), 2) AS revenue_per_stop,
    NULL::numeric AS revenue_per_route_hour,
    NULL::numeric AS route_day_margin,
    round(ops.pounds / NULLIF(ops.route_days, 0)::numeric) AS pounds_per_route_day,
    round(100::numeric * ops.pounds_exec_default / NULLIF(ops.pounds, 0::numeric), 1) AS pounds_exec_default_pct
   FROM m
     LEFT JOIN m ly ON ly.month = (m.month - '1 year'::interval)
     LEFT JOIN vol ON vol.month = m.month
     LEFT JOIN pw ON pw.month = m.month
     LEFT JOIN ops ON ops.month = m.month
     LEFT JOIN destruction ON destruction.month = m.month
  ORDER BY m.month;
```

### `public.v_monthly_storage_service`

**view**

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `month` | date | yes |
| 2 | `storage` | numeric | yes |
| 3 | `service` | numeric | yes |
| 4 | `citadel` | numeric | yes |
| 5 | `core` | numeric | yes |

```sql
WITH m AS (
         SELECT date_trunc('month'::text, COALESCE(invoices.invdate, invoices.billdate))::date AS month,
            sum(invoices.ret_tot) AS storage,
            sum(invoices.ser_tot) AS service,
            COALESCE(sum(invoices.ser_tot) FILTER (WHERE invoices.custno = '00870'::text), 0::numeric) AS citadel
           FROM invoices
          GROUP BY (date_trunc('month'::text, COALESCE(invoices.invdate, invoices.billdate))::date)
        )
 SELECT month,
    storage,
    service,
    citadel,
    storage + service - citadel AS core
   FROM m
  WHERE month >= (( SELECT date_trunc('month'::text, min(invoices.billdate))::date AS date_trunc
           FROM invoices)) AND month > ((( SELECT max(m_1.month) AS max
           FROM m m_1)) - '3 years'::interval)
  ORDER BY month;
```

### `public.v_rate_by_customer_service`

**view**

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `month` | date | yes |
| 2 | `level1` | integer | yes |
| 3 | `servcodeid` | integer | yes |
| 4 | `servcode` | text | yes |
| 5 | `servtype` | text | yes |
| 6 | `service` | text | yes |
| 7 | `modal_rate` | numeric | yes |
| 8 | `lines` | bigint | yes |
| 9 | `zero_rate_lines` | bigint | yes |
| 10 | `distinct_rates` | bigint | yes |
| 11 | `first_month` | date | yes |
| 12 | `last_changed` | date | yes |

```sql
WITH l AS (
         SELECT priced_lines.level1,
            priced_lines.servcodeid,
            date_trunc('month'::text, priced_lines.wodate)::date AS month,
            priced_lines.rate
           FROM priced_lines
          WHERE lower(priced_lines.invoiced) = 'true'::text
        ), m AS (
         SELECT l.level1,
            l.servcodeid,
            l.month,
            mode() WITHIN GROUP (ORDER BY l.rate) FILTER (WHERE l.rate > 0::numeric) AS modal_rate,
            count(*) FILTER (WHERE l.rate > 0::numeric) AS lines,
            count(*) FILTER (WHERE l.rate = 0::numeric) AS zero_rate_lines,
            count(DISTINCT l.rate) FILTER (WHERE l.rate > 0::numeric) AS distinct_rates
           FROM l
          GROUP BY l.level1, l.servcodeid, l.month
         HAVING count(*) FILTER (WHERE l.rate > 0::numeric) > 0
        ), c AS (
         SELECT m.level1,
            m.servcodeid,
            m.month,
            m.modal_rate,
            m.lines,
            m.zero_rate_lines,
            m.distinct_rates,
            lag(m.modal_rate) OVER (PARTITION BY m.level1, m.servcodeid ORDER BY m.month) AS previous_rate,
            min(m.month) OVER (PARTITION BY m.level1, m.servcodeid) AS first_month
           FROM m
        )
 SELECT c.month,
    c.level1,
    c.servcodeid,
    s.servcode,
    s.servtype,
    s.description AS service,
    c.modal_rate,
    c.lines,
    c.zero_rate_lines,
    c.distinct_rates,
    c.first_month,
    max(
        CASE
            WHEN c.modal_rate <> c.previous_rate THEN c.month
            ELSE NULL::date
        END) OVER (PARTITION BY c.level1, c.servcodeid ORDER BY c.month) AS last_changed
   FROM c
     LEFT JOIN servcode s USING (servcodeid);
```

### `public.v_route_day`

**view**

| # | Column | Type | Nullable |
|---|---|---|---|
| 1 | `date` | date | yes |
| 2 | `route` | text | yes |
| 3 | `routeid` | integer | yes |
| 4 | `driver` | text | yes |
| 5 | `services` | bigint | yes |
| 6 | `services_done` | bigint | yes |
| 7 | `customers` | bigint | yes |
| 8 | `stops` | bigint | yes |
| 9 | `stops_done` | bigint | yes |
| 10 | `postcodes` | bigint | yes |
| 11 | `postcode_list` | text | yes |
| 12 | `pounds` | numeric | yes |
| 13 | `pounds_exec_default` | numeric | yes |

```sql
WITH so AS (
         SELECT NULLIF(vs_service_orders.date, ''::text)::date AS date,
            NULLIF(vs_service_orders.route, ''::text) AS route,
            NULLIF(vs_service_orders.routeid, ''::text)::integer AS routeid,
            NULLIF(vs_service_orders.driver, ''::text) AS driver,
            NULLIF(vs_service_orders.level1, ''::text)::integer AS level1,
            NULLIF(vs_service_orders.slocid, ''::text) AS slocid,
            "left"(COALESCE(NULLIF(vs_service_orders.s_zip, ''::text), NULLIF(vs_service_orders.zip, ''::text)), 5) AS postcode,
            NULLIF(vs_service_orders.cbtcode, ''::text) AS bin,
            NULLIF(vs_service_orders.weight, ''::text)::numeric AS weight,
            vs_service_orders.billable = 'true'::text AS done
           FROM vs_service_orders
        )
 SELECT date,
    route,
    min(routeid) AS routeid,
    string_agg(DISTINCT driver, ' '::text) AS driver,
    count(*) AS services,
    count(*) FILTER (WHERE done) AS services_done,
    count(DISTINCT level1) AS customers,
    count(DISTINCT slocid) AS stops,
    count(DISTINCT slocid) FILTER (WHERE done) AS stops_done,
    count(DISTINCT postcode) AS postcodes,
    string_agg(DISTINCT postcode, ' '::text) AS postcode_list,
    COALESCE(sum(weight) FILTER (WHERE done), 0::numeric) AS pounds,
    COALESCE(sum(weight) FILTER (WHERE done AND (bin = ANY (ARRAY['B3'::text, 'B6'::text]))), 0::numeric) AS pounds_exec_default
   FROM so
  GROUP BY date, route;
```
