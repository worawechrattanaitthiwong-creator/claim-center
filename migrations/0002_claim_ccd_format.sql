-- Align Cloudflare D1 with the saved-data layout used by Claim CCD.xlsm.
-- The external/exported Claim data is A:AQ (43 columns). Internal audit columns
-- such as ref_id/created_at remain in D1 but are not inserted into that external order.

ALTER TABLE claims ADD COLUMN cause_group TEXT NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN remark_list TEXT NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN unique_key TEXT NOT NULL DEFAULT '';
ALTER TABLE claims ADD COLUMN data_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE claims ADD COLUMN data_year INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_claim_cause_group ON claims(cause_group);
CREATE INDEX IF NOT EXISTS idx_claim_unique_key ON claims(unique_key);
CREATE INDEX IF NOT EXISTS idx_claim_month_year ON claims(data_year, data_month);

CREATE TABLE IF NOT EXISTS dropdown_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  value TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, value)
);
CREATE INDEX IF NOT EXISTS idx_dropdown_category_sort
  ON dropdown_options(category, sort_order, id);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('claims_reason','1. สินค้าขาดส่ง',10),
('claims_reason','2. สินค้าส่งเกิน',20),
('claims_reason','3. สินค้าส่งผิดรายการ',30),
('claims_reason','4. สินค้าไม่ได้คุณภาพ',40),
('claims_reason','5. สินค้าชำรุดจากการขนส่ง',50),
('claims_reason','6. สินค้าหมดอายุ',60),
('claims_reason','7. สินค้าถูกแกะกิน',70);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('status','Accept',10),
('status','Pending',20),
('status','Reject',30);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('who','DC',10),
('who','TP',20),
('who','QC',30);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('cause_group','Short Delivery',10),
('cause_group','Damage Delivery',20),
('cause_group','Over Deliver',30),
('cause_group','Quality not good',40),
('cause_group','Other',50);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('root_cause','Product value < 1,000 THB',10),
('root_cause','Product value < 2,000 THB',20),
('root_cause','Store wrong policy claim over 24 Hrs.',30),
('root_cause','Action taken',40),
('root_cause','Quality not good',50),
('root_cause','Have a proof of delivery',60),
('root_cause','Store duplicate  claim',70),
('root_cause','Store wrong policy Incomplete document',80),
('root_cause','Delivery wrong branch',90),
('root_cause','Over Deliver',100),
('root_cause','Short Delivery',110),
('root_cause','Damage Delivery',120);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('adjust_code','Adjust Code 15',10),
('adjust_code','Adjust Code 16',20),
('adjust_code','Adjust Code 26',30);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('status_sc','Complete',10),
('status_sc','Pending',20),
('status_sc','ยังไม่ส่งข้อมูล SC',30);

INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('remark_list','Picking ',10),
('remark_list','1. กระจายสินค้าผิด',20),
('remark_list','2. วางสินค้าในพาเลทสลับ',30),
('remark_list','3. ติดลาเบลสาขาสลับ',40),
('remark_list','Shipping',50),
('remark_list','1. รวมสินค้าผิด' || char(10) || '2. นับตะกร้าผิด',60),
('remark_list','3. ติดลาเบลสาขาผิด',70),
('remark_list','RSU (  Asset  )',80),
('remark_list','1. นับตะกร้าผิด',90),
('remark_list','Transport',100),
('remark_list','1. พขร.ลากสินค้าขึ้นรถไปผิด',110),
('remark_list','2. พขร.ลงสินค้าผิดสาขา',120);

-- Check is retained from the original Claim Center logic supplied by the user.
INSERT OR IGNORE INTO dropdown_options(category,value,sort_order) VALUES
('check_result','Store wrong claim (Not missing pallet) - Not exceeding 5,000',10),
('check_result','Store wrong claim ( สาขารับตะกร้าครบตาม Rams )',20),
('check_result','Store wrong claim (Claim Delay)',30),
('check_result','DC Accept',40),
('check_result','TP Accept',50),
('check_result','TP Reject',60),
('check_result','Transfer',70),
('check_result','ตรวจสอบ',80),
('check_result','Cancel Claim',90),
('check_result','Reject ตามเอกสาร',100),
('check_result','พบสินค้าตกค้างที่ DC',110),
('check_result','เอกสารไม่สมบูรณ์',120),
('check_result','อื่นๆ',130);
