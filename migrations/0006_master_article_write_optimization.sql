PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS master_products;

CREATE TABLE master_articles_compact (
  batch_id TEXT NOT NULL REFERENCES master_article_batches(batch_id) ON DELETE CASCADE,
  article TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  manage_weight TEXT NOT NULL DEFAULT '',
  item_value REAL NOT NULL DEFAULT 0,
  seg_description TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, article)
) WITHOUT ROWID;

INSERT INTO master_articles_compact
  (batch_id, article, barcode, description, manage_weight, item_value, seg_description, raw_json, updated_at)
SELECT
  batch_id, article, barcode, description, manage_weight, item_value, seg_description, raw_json, updated_at
FROM master_articles;

DROP TABLE master_articles;
ALTER TABLE master_articles_compact RENAME TO master_articles;
CREATE INDEX idx_master_articles_batch_barcode ON master_articles(batch_id, barcode);

CREATE VIEW master_products AS
SELECT
  a.article AS article,
  a.barcode AS barcode,
  a.manage_weight AS manage_weight,
  a.item_value AS sku_cost,
  a.seg_description AS seg_description,
  COALESCE(p.list_eggs, '') AS list_eggs,
  a.description AS description,
  a.updated_at AS updated_at
FROM master_articles a
JOIN master_article_state s ON s.id = 1 AND s.active_batch_id = a.batch_id
LEFT JOIN master_products_legacy p ON p.article = a.article
UNION ALL
SELECT
  p.article,
  p.barcode,
  p.manage_weight,
  p.sku_cost,
  p.seg_description,
  p.list_eggs,
  '' AS description,
  p.updated_at
FROM master_products_legacy p
WHERE (SELECT active_batch_id FROM master_article_state WHERE id = 1) IS NULL;

PRAGMA foreign_keys = ON;
