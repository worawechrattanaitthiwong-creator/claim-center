PRAGMA foreign_keys = ON;

ALTER TABLE store_cases ADD COLUMN received_date TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN claim_date TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN claim_dc TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN vehicle_no TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN driver TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN dn_no TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN route TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN pallet_no TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN basket_no TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN correction_note TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN returned_at TEXT NOT NULL DEFAULT '';
ALTER TABLE store_cases ADD COLUMN returned_by TEXT NOT NULL DEFAULT '';

CREATE TABLE store_case_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_case_id INTEGER NOT NULL REFERENCES store_cases(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL DEFAULT 1,
  article TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  delivery_qty TEXT NOT NULL DEFAULT '',
  received_qty TEXT NOT NULL DEFAULT '',
  claim_qty TEXT NOT NULL DEFAULT '',
  claims_reason TEXT NOT NULL DEFAULT '',
  sku_cost REAL NOT NULL DEFAULT 0,
  amount_claim REAL NOT NULL DEFAULT 0,
  remark TEXT NOT NULL DEFAULT '',
  master_matched INTEGER NOT NULL DEFAULT 0 CHECK(master_matched IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(store_case_id,line_no)
);
CREATE INDEX idx_store_case_items_case ON store_case_items(store_case_id,line_no);
CREATE INDEX idx_store_case_items_article ON store_case_items(article);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order,active,created_by,created_at)
SELECT 'store_topic', value, sort_order, active, 'migration-v8', CURRENT_TIMESTAMP
FROM dropdown_options
WHERE category='claims_reason';

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order,active,created_by,created_at) VALUES
('store_topic','อื่นๆ',999,1,'migration-v8',CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_store_cases_ticket ON store_cases(transport_no,status,updated_at DESC);
