PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS store_case_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_case_id INTEGER NOT NULL REFERENCES store_cases(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_case_evidence_case ON store_case_evidence(store_case_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_time ON audit_log(entity_key,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_transport_time ON audit_log(transport_no,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_barcode_active ON claims(barcode,archived,id DESC);
CREATE INDEX IF NOT EXISTS idx_claim_description_active ON claims(description,archived,id DESC);
CREATE INDEX IF NOT EXISTS idx_store_cases_assigned_status ON store_cases(assigned_to,status,updated_at DESC);
