// One named query per screen. Each returns the JSON that screen renders.
// Prompt 3 fills these in from the SQL views; until then they throw, and
// USE_FIXTURES=1 serves fixtures/<name>.json instead.
'use strict';
const { query } = require('./db');

const notYet = (name) => async () => { throw new Error(`queries.${name} is not written yet — run with USE_FIXTURES=1`); };

module.exports = {
  // Pulse — Trisha. Headline figures, the four decisions, the two halves, 24 months, finding of the week.
  pulse: notYet('pulse'),

  // Activity — Mike. Yesterday's route-days, the week grid, booked ahead.
  activity: notYet('activity'),

  // Pricing — Anne. Percentile summary per service and the named accounts on each strip.
  pricing: notYet('pricing'),

  // Calls — Anne. Ten accounts this week with their signals.
  calls: notYet('calls'),

  // Margin — drill-down. Every customer with revenue, lines, visits.
  margin: notYet('margin'),
};

// kept so Prompt 3 has the import ready
module.exports._query = query;
