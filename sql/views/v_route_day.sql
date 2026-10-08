-- One row per route-day from Veri-Shred service orders, booked and done.
-- Every Veri-Shred column is text (data rule 3): cast on the way in.
-- services counts every order on the route that day, forward bookings included; services_done
-- counts billable = 'true', the completion flag (rule 2), which matches a stamped finished.
-- customers is distinct level1; stops are distinct service locations (slocid); postcodes are the
-- first five digits of the service zip, falling back to the primary zip.
-- pounds are recorded weights on done orders. B3 and B6 executive bins carry their capacity, not
-- a weigh (rule 6): pounds_exec_default is that part. No GPS, times or duration exist (rule 8).
DROP VIEW IF EXISTS v_route_day CASCADE;
CREATE VIEW v_route_day AS
WITH so AS (
  SELECT NULLIF(date, '')::date                                AS date,
         NULLIF(route, '')                                     AS route,
         NULLIF(routeid, '')::int                              AS routeid,
         NULLIF(driver, '')                                    AS driver,
         NULLIF(level1, '')::int                               AS level1,
         NULLIF(slocid, '')                                    AS slocid,
         left(COALESCE(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS postcode,
         NULLIF(cbtcode, '')                                   AS bin,
         NULLIF(weight, '')::numeric                           AS weight,
         billable = 'true'                                     AS done
  FROM vs_service_orders
)
SELECT date, route, min(routeid) AS routeid,
       string_agg(DISTINCT driver, ' ') AS driver,
       count(*)                                    AS services,
       count(*) FILTER (WHERE done)                AS services_done,
       count(DISTINCT level1)                      AS customers,
       count(DISTINCT slocid)                      AS stops,
       count(DISTINCT slocid) FILTER (WHERE done)  AS stops_done,
       count(DISTINCT postcode)                    AS postcodes,
       string_agg(DISTINCT postcode, ' ')          AS postcode_list,
       COALESCE(sum(weight) FILTER (WHERE done), 0)                         AS pounds,
       COALESCE(sum(weight) FILTER (WHERE done AND bin IN ('B3', 'B6')), 0) AS pounds_exec_default
FROM so
GROUP BY date, route;
