PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'dc';
ALTER TABLE users ADD COLUMN store_code TEXT NOT NULL DEFAULT '';

ALTER TABLE claims ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'DC';
ALTER TABLE claims ADD COLUMN store_case_id TEXT NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN case_state TEXT NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN dispute_status TEXT NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN closed_at TEXT NOT NULL DEFAULT '';

CREATE TABLE claim_drafts (
  draft_token TEXT PRIMARY KEY,
  claim_no TEXT NOT NULL UNIQUE,
  transport_no TEXT NOT NULL DEFAULT '',
  store_code TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_claim_draft_exp ON claim_drafts(expires_at);

CREATE TABLE reference_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_token TEXT NOT NULL,
  item_key TEXT NOT NULL,
  ref_type TEXT NOT NULL CHECK(ref_type IN ('DC','TP')),
  ref_no TEXT NOT NULL UNIQUE,
  claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(draft_token,item_key)
);
CREATE INDEX idx_ref_res_draft ON reference_reservations(draft_token,claimed);

CREATE TABLE store_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_no TEXT NOT NULL UNIQUE,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  transport_no TEXT NOT NULL DEFAULT '',
  ship_date TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  claim_no TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  assigned_to TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  dispute_status TEXT NOT NULL DEFAULT '',
  closed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_store_cases_store ON store_cases(store_code,updated_at DESC);
CREATE INDEX idx_store_cases_status ON store_cases(status,updated_at DESC);
CREATE INDEX idx_store_cases_transport ON store_cases(transport_no);

CREATE TABLE case_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_case_id INTEGER NOT NULL REFERENCES store_cases(id) ON DELETE CASCADE,
  sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_username TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_side TEXT NOT NULL CHECK(sender_side IN ('STORE','DC')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_case_messages_case ON case_messages(store_case_id,id);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('DC','STORE','USER')),
  recipient_key TEXT NOT NULL DEFAULT '',
  store_case_id INTEGER,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_type,recipient_key,is_read,id DESC);

CREATE INDEX idx_claim_source_case ON claims(source_channel,store_case_id,archived);
