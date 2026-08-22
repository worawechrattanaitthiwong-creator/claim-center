-- Exact CCD master alignment derived from Claim CCD.xlsm.
-- Eggs comes from sheet `Lish _Eggs`; Store Check100 comes from `Check_100`.

CREATE TABLE IF NOT EXISTS master_eggs (
  article TEXT PRIMARY KEY,
  eggs TEXT NOT NULL DEFAULT 'Eggs'
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS master_check100 (
  store_code TEXT PRIMARY KEY,
  store_name TEXT NOT NULL DEFAULT '',
  flag TEXT NOT NULL DEFAULT 'เช็ค 100 %'
) WITHOUT ROWID;

INSERT OR REPLACE INTO master_eggs(article,eggs) VALUES
('100764816','Eggs'),('100975690','Eggs'),('100975694','Eggs'),('100990525','Eggs'),
('101869497','Eggs'),('101963402','Eggs'),('102074291','Eggs'),('102120971','Eggs'),
('102270173','Eggs'),('102562126','Eggs'),('102660605','Eggs'),('102660606','Eggs'),
('102822577','Eggs'),('102834571','Eggs'),('102970689','Eggs'),('102970690','Eggs'),
('103047101','Eggs'),('103061373','Eggs'),('103061374','Eggs');

INSERT OR REPLACE INTO master_check100(store_code,store_name,flag) VALUES
('11190','บิ๊กซี-Extra พระราม 4','เช็ค 100 %'),
('11191','บิ๊กซี-Extra รัชดาภิเษก','เช็ค 100 %'),
('11172','บิ๊กซี-ราชดำริ','เช็ค 100 %'),
('11174','บิ๊กซี-Extra ลาดพร้าว 2','เช็ค 100 %'),
('11133','บิ๊กซี-ติวานนท์','เช็ค 100 %'),
('11128','บิ๊กซี-สุขสวัสดิ์','เช็ค 100 %'),
('11102','บิ๊กซี-แจ้งวัฒนะ','เช็ค 100 %'),
('11126','บิ๊กซี-แฟชั่นไอซ์แลนด์','เช็ค 100 %'),
('11144','บิ๊กซี-เอกมัย','เช็ค 100 %'),
('11210','บิ๊กซี-Extra เมกะ บางนา','เช็ค 100 %'),
('11110','บิ๊กซี แฟรี่-ขอนแก่น','เช็ค 100 %'),
('11127','บิ๊กซี-เชียงใหม่','เช็ค 100 %');

DROP TRIGGER IF EXISTS trg_master_article_eggs_insert;
DROP TRIGGER IF EXISTS trg_master_article_eggs_update;
DROP TRIGGER IF EXISTS trg_master_store_check100_insert;
DROP TRIGGER IF EXISTS trg_master_store_check100_update;

CREATE TRIGGER trg_master_article_eggs_insert
AFTER INSERT ON master_articles
BEGIN
  UPDATE master_articles
  SET eggs = COALESCE((SELECT e.eggs FROM master_eggs e WHERE e.article = NEW.article), '')
  WHERE batch_id = NEW.batch_id AND article = NEW.article;
END;

CREATE TRIGGER trg_master_article_eggs_update
AFTER UPDATE OF article ON master_articles
BEGIN
  UPDATE master_articles
  SET eggs = COALESCE((SELECT e.eggs FROM master_eggs e WHERE e.article = NEW.article), '')
  WHERE batch_id = NEW.batch_id AND article = NEW.article;
END;

CREATE TRIGGER trg_master_store_check100_insert
AFTER INSERT ON master_stores
BEGIN
  UPDATE master_stores
  SET check_100 = COALESCE((SELECT c.flag FROM master_check100 c WHERE c.store_code = NEW.store_code), '')
  WHERE store_code = NEW.store_code;
END;

CREATE TRIGGER trg_master_store_check100_update
AFTER UPDATE OF store_code ON master_stores
BEGIN
  UPDATE master_stores
  SET check_100 = COALESCE((SELECT c.flag FROM master_check100 c WHERE c.store_code = NEW.store_code), '')
  WHERE store_code = NEW.store_code;
END;
