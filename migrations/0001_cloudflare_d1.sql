PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS master_stores (
  store_code TEXT PRIMARY KEY,
  store_name TEXT NOT NULL DEFAULT '',
  format_type TEXT NOT NULL DEFAULT '',
  store_type TEXT NOT NULL DEFAULT '',
  check_100 TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS master_products (
  article TEXT PRIMARY KEY,
  barcode TEXT NOT NULL DEFAULT '',
  manage_weight TEXT NOT NULL DEFAULT '',
  sku_cost REAL NOT NULL DEFAULT 0,
  seg_description TEXT NOT NULL DEFAULT '',
  list_eggs TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_master_products_barcode ON master_products(barcode);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  claim_dc TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL DEFAULT '',
  reported_date TEXT NOT NULL DEFAULT '',
  transport_no TEXT NOT NULL,
  vehicle_no TEXT NOT NULL DEFAULT '',
  driver TEXT NOT NULL DEFAULT '',
  dn_no TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  pallet_no TEXT NOT NULL DEFAULT '',
  basket_no TEXT NOT NULL DEFAULT '',
  article TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sent_qty TEXT NOT NULL DEFAULT '',
  received_qty TEXT NOT NULL DEFAULT '',
  claim_qty TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  reply_date TEXT NOT NULL,
  update_status TEXT NOT NULL,
  who TEXT NOT NULL,
  format_type TEXT NOT NULL DEFAULT '',
  store_type TEXT NOT NULL DEFAULT '',
  claim_no TEXT NOT NULL DEFAULT '',
  reference_no TEXT NOT NULL DEFAULT '-',
  final_status TEXT NOT NULL DEFAULT 'Pending',
  root_cause TEXT NOT NULL DEFAULT '',
  check_result TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  list_eggs TEXT NOT NULL DEFAULT '',
  check_100 TEXT NOT NULL DEFAULT '',
  manage_weight TEXT NOT NULL DEFAULT '',
  sc TEXT NOT NULL DEFAULT '',
  complete_sc TEXT NOT NULL DEFAULT '',
  store_check_100 TEXT NOT NULL DEFAULT '',
  sku_cost REAL NOT NULL DEFAULT 0,
  seg_description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  ref_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  email_sent INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_active_transport_article
  ON claims(transport_no COLLATE NOCASE, article COLLATE NOCASE)
  WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_claim_transport ON claims(transport_no);
CREATE INDEX IF NOT EXISTS idx_claim_article ON claims(article);
CREATE INDEX IF NOT EXISTS idx_claim_store ON claims(store_code);
CREATE INDEX IF NOT EXISTS idx_claim_reply_date ON claims(reply_date);
CREATE INDEX IF NOT EXISTS idx_claim_reference ON claims(reference_no);
CREATE INDEX IF NOT EXISTS idx_claim_status_who ON claims(update_status, who);
CREATE INDEX IF NOT EXISTS idx_claim_created_by_date ON claims(created_by, reply_date);

CREATE TABLE IF NOT EXISTS claim_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_no TEXT NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('DC', 'TP')),
  reply_date TEXT NOT NULL DEFAULT '',
  claim_no TEXT NOT NULL DEFAULT '',
  store_code TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(ref_no, reference_type)
);
CREATE INDEX IF NOT EXISTS idx_claim_reference_type ON claim_references(reference_type, id DESC);

CREATE TABLE IF NOT EXISTS sequences (
  sequence_key TEXT PRIMARY KEY,
  current_value INTEGER NOT NULL
);

-- Small aggregate table reserved for the restored Dashboard layer.
-- Keeping case summaries separate prevents Dashboard reads from scanning millions of item rows.
CREATE TABLE IF NOT EXISTS claim_case_summary (
  transport_no TEXT PRIMARY KEY,
  store_code TEXT NOT NULL DEFAULT '',
  reply_date TEXT NOT NULL DEFAULT '',
  dominant_status TEXT NOT NULL DEFAULT 'Pending',
  who TEXT NOT NULL DEFAULT '',
  format_type TEXT NOT NULL DEFAULT '',
  hub TEXT NOT NULL DEFAULT '',
  total_amount REAL NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_summary_date ON claim_case_summary(reply_date);
CREATE INDEX IF NOT EXISTS idx_case_summary_status ON claim_case_summary(dominant_status);
