-- Safety ledger for large Claim CCD history migrations on the Free plan.
-- The cap itself is configurable with HISTORY_IMPORT_DAILY_ROWS in wrangler.jsonc.

CREATE TABLE IF NOT EXISTS history_import_usage (
  usage_date TEXT PRIMARY KEY,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
