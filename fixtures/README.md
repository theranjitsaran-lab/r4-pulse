Snapshots of the database, one JSON file per screen, written by `npm run snapshot` on a machine
that can reach the database. Committed, so cloud sessions can build and check the screens on real
figures (decided 24 October 2026; the repository is private). They hold revenue, volumes and
invoiced rates by account, never credentials and never a cost: costs are built by model/rates.js.
With USE_FIXTURES=1 the API serves these instead of querying. Refresh them after `npm run kpi:rebuild`.
