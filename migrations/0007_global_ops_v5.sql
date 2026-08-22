PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS master_products;
DROP TABLE IF EXISTS claim_case_summary;
DROP TABLE IF EXISTS history_import_usage;
DROP TABLE IF EXISTS master_articles;
DROP TABLE IF EXISTS master_article_state;
DROP TABLE IF EXISTS master_article_batches;
DROP TABLE IF EXISTS master_products_legacy;
DROP TABLE IF EXISTS master_products;
DROP TABLE IF EXISTS master_stores;
DROP TABLE IF EXISTS dropdown_options;
DROP TABLE IF EXISTS references_ledger;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS sequences;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','supervisor','user')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  last_login_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_exp ON sessions(expires_at);

CREATE TABLE sequences (
  sequence_key TEXT PRIMARY KEY,
  current_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE dropdown_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  value TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(category,value)
);
CREATE INDEX idx_dropdown_active ON dropdown_options(category,active,sort_order,id);

CREATE TABLE master_stores (
  store_code TEXT PRIMARY KEY,
  store_name TEXT NOT NULL DEFAULT '',
  format_type TEXT NOT NULL DEFAULT '',
  store_type TEXT NOT NULL DEFAULT '',
  check_100 TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE master_article_batches (
  batch_id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL DEFAULT '',
  sheet_name TEXT NOT NULL DEFAULT '',
  expected_rows INTEGER NOT NULL DEFAULT 0,
  received_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','active','replaced','failed')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE master_articles (
  batch_id TEXT NOT NULL REFERENCES master_article_batches(batch_id) ON DELETE CASCADE,
  article TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  manage_weight TEXT NOT NULL DEFAULT '',
  item_value REAL NOT NULL DEFAULT 0,
  seg_description TEXT NOT NULL DEFAULT '',
  eggs TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(batch_id,article)
) WITHOUT ROWID;
CREATE INDEX idx_master_articles_barcode ON master_articles(batch_id,barcode);

CREATE TABLE master_article_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  active_batch_id TEXT,
  updated_at TEXT NOT NULL DEFAULT ''
);
INSERT INTO master_article_state(id,active_batch_id,updated_at) VALUES(1,NULL,'');

CREATE TABLE claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_code TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL DEFAULT '',
  claim_dc TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL DEFAULT '',
  claim_date TEXT NOT NULL DEFAULT '',
  transport_no TEXT NOT NULL DEFAULT '',
  vehicle_no TEXT NOT NULL DEFAULT '',
  driver TEXT NOT NULL DEFAULT '',
  dn_no TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  pallet_no TEXT NOT NULL DEFAULT '',
  basket_no TEXT NOT NULL DEFAULT '',
  article TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  delivery_qty TEXT NOT NULL DEFAULT '',
  received_qty TEXT NOT NULL DEFAULT '',
  claim_qty TEXT NOT NULL DEFAULT '',
  claims_reason TEXT NOT NULL DEFAULT '',
  amount_claim REAL NOT NULL DEFAULT 0,
  ship_date TEXT NOT NULL DEFAULT '',
  update_status TEXT NOT NULL DEFAULT '',
  who TEXT NOT NULL DEFAULT '',
  format_type TEXT NOT NULL DEFAULT '',
  claim_no TEXT NOT NULL DEFAULT '',
  reference_no TEXT NOT NULL DEFAULT '',
  cause_group TEXT NOT NULL DEFAULT '',
  root_cause TEXT NOT NULL DEFAULT '',
  check_result TEXT NOT NULL DEFAULT '',
  remark_list TEXT NOT NULL DEFAULT '',
  eggs TEXT NOT NULL DEFAULT '',
  store_format TEXT NOT NULL DEFAULT '',
  manage_weight TEXT NOT NULL DEFAULT '',
  sc TEXT NOT NULL DEFAULT '',
  complete_sc TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  store_check_100 TEXT NOT NULL DEFAULT '',
  sku_cost REAL NOT NULL DEFAULT 0,
  seg_description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  unique_key TEXT NOT NULL UNIQUE,
  data_month TEXT NOT NULL DEFAULT '',
  data_year INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_claim_transport ON claims(transport_no,archived,id DESC);
CREATE INDEX idx_claim_reference ON claims(reference_no,archived);
CREATE INDEX idx_claim_claimno ON claims(claim_no,archived);
CREATE INDEX idx_claim_store ON claims(store_code,archived);
CREATE INDEX idx_claim_article ON claims(article,archived);
CREATE INDEX idx_claim_shipdate ON claims(ship_date,archived);
CREATE INDEX idx_claim_period ON claims(data_year,data_month,archived);
CREATE INDEX idx_claim_dashboard ON claims(ship_date,update_status,who,format_type,archived);

CREATE TABLE references_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL CHECK(ref_type IN ('DC','TP')),
  ref_no TEXT NOT NULL UNIQUE,
  claim_no TEXT NOT NULL DEFAULT '',
  transport_no TEXT NOT NULL DEFAULT '',
  store_code TEXT NOT NULL DEFAULT '',
  ship_date TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ref_type_no ON references_ledger(ref_type,ref_no);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_key TEXT NOT NULL DEFAULT '',
  claim_no TEXT NOT NULL DEFAULT '',
  reference_no TEXT NOT NULL DEFAULT '',
  transport_no TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(username,created_at DESC);

INSERT INTO dropdown_options(category,value,sort_order,created_at) VALUES
('claims_reason','1. สินค้าขาดส่ง',10,CURRENT_TIMESTAMP),
('claims_reason','2. สินค้าส่งเกิน',20,CURRENT_TIMESTAMP),
('claims_reason','3. สินค้าส่งผิดรายการ',30,CURRENT_TIMESTAMP),
('claims_reason','4. สินค้าไม่ได้คุณภาพ',40,CURRENT_TIMESTAMP),
('claims_reason','5. สินค้าชำรุดจากการขนส่ง',50,CURRENT_TIMESTAMP),
('claims_reason','6. สินค้าหมดอายุ',60,CURRENT_TIMESTAMP),
('claims_reason','7. สินค้าถูกแกะกิน',70,CURRENT_TIMESTAMP),
('status','Accept',10,CURRENT_TIMESTAMP),
('status','Pending',20,CURRENT_TIMESTAMP),
('status','Reject',30,CURRENT_TIMESTAMP),
('who','DC',10,CURRENT_TIMESTAMP),
('who','TP',20,CURRENT_TIMESTAMP),
('who','QC',30,CURRENT_TIMESTAMP),
('cause_group','Short Delivery',10,CURRENT_TIMESTAMP),
('cause_group','Damage Delivery',20,CURRENT_TIMESTAMP),
('cause_group','Over Deliver',30,CURRENT_TIMESTAMP),
('cause_group','Quality not good',40,CURRENT_TIMESTAMP),
('cause_group','Other',50,CURRENT_TIMESTAMP),
('root_cause','Product value < 1,000 THB',10,CURRENT_TIMESTAMP),
('root_cause','Product value < 2,000 THB',20,CURRENT_TIMESTAMP),
('root_cause','Store wrong policy claim over 24 Hrs.',30,CURRENT_TIMESTAMP),
('root_cause','Action taken',40,CURRENT_TIMESTAMP),
('root_cause','Quality not good',50,CURRENT_TIMESTAMP),
('root_cause','Have a proof of delivery',60,CURRENT_TIMESTAMP),
('root_cause','Store duplicate claim',70,CURRENT_TIMESTAMP),
('root_cause','Store wrong policy Incomplete document',80,CURRENT_TIMESTAMP),
('root_cause','Delivery wrong branch',90,CURRENT_TIMESTAMP),
('root_cause','Over Deliver',100,CURRENT_TIMESTAMP),
('root_cause','Short Delivery',110,CURRENT_TIMESTAMP),
('root_cause','Damage Delivery',120,CURRENT_TIMESTAMP),
('check_result','Store wrong claim (Not missing pallet) - Not exceeding 5,000',10,CURRENT_TIMESTAMP),
('check_result','Store wrong claim ( สาขารับตะกร้าครบตาม Rams )',20,CURRENT_TIMESTAMP),
('check_result','Store wrong claim (Claim Delay)',30,CURRENT_TIMESTAMP),
('check_result','DC Accept',40,CURRENT_TIMESTAMP),
('check_result','TP Accept',50,CURRENT_TIMESTAMP),
('check_result','TP Reject',60,CURRENT_TIMESTAMP),
('check_result','Transfer',70,CURRENT_TIMESTAMP),
('check_result','ตรวจสอบ',80,CURRENT_TIMESTAMP),
('check_result','Cancel Claim',90,CURRENT_TIMESTAMP),
('check_result','Reject ตามเอกสาร',100,CURRENT_TIMESTAMP),
('check_result','พบสินค้าตกค้างที่ DC',110,CURRENT_TIMESTAMP),
('check_result','เอกสารไม่สมบูรณ์',120,CURRENT_TIMESTAMP),
('check_result','อื่นๆ',130,CURRENT_TIMESTAMP),
('adjust_code','Adjust Code 15',10,CURRENT_TIMESTAMP),
('adjust_code','Adjust Code 16',20,CURRENT_TIMESTAMP),
('adjust_code','Adjust Code 26',30,CURRENT_TIMESTAMP),
('status_sc','Complete',10,CURRENT_TIMESTAMP),
('status_sc','Pending',20,CURRENT_TIMESTAMP),
('status_sc','ยังไม่ส่งข้อมูล SC',30,CURRENT_TIMESTAMP),
('remark_list','Picking',10,CURRENT_TIMESTAMP),
('remark_list','1. กระจายสินค้าผิด',20,CURRENT_TIMESTAMP),
('remark_list','2. วางสินค้าในพาเลทสลับ',30,CURRENT_TIMESTAMP),
('remark_list','3. ติดลาเบลสาขาสลับ',40,CURRENT_TIMESTAMP),
('remark_list','Shipping',50,CURRENT_TIMESTAMP),
('remark_list','1. รวมสินค้าผิด / 2. นับตะกร้าผิด',60,CURRENT_TIMESTAMP),
('remark_list','3. ติดลาเบลสาขาผิด',70,CURRENT_TIMESTAMP),
('remark_list','RSU (Asset)',80,CURRENT_TIMESTAMP),
('remark_list','1. นับตะกร้าผิด',90,CURRENT_TIMESTAMP),
('remark_list','Transport',100,CURRENT_TIMESTAMP),
('remark_list','1. พขร.ลากสินค้าขึ้นรถไปผิด',110,CURRENT_TIMESTAMP),
('remark_list','2. พขร.ลงสินค้าผิดสาขา',120,CURRENT_TIMESTAMP);

PRAGMA foreign_keys = ON;
