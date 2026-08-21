PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS master_article_batches (
  batch_id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL DEFAULT '',
  sheet_name TEXT NOT NULL DEFAULT 'MasterArticle',
  expected_rows INTEGER NOT NULL DEFAULT 0,
  received_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'active', 'replaced', 'failed')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_master_article_batches_status ON master_article_batches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS master_articles (
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
);
CREATE INDEX IF NOT EXISTS idx_master_articles_batch_barcode ON master_articles(batch_id, barcode);

CREATE TABLE IF NOT EXISTS master_article_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_batch_id TEXT REFERENCES master_article_batches(batch_id),
  updated_at TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO master_article_state (id, active_batch_id, updated_at) VALUES (1, NULL, '');

-- The original Cloudflare version used master_products as a small editable table.
-- Keep that data only as a legacy fallback / Eggs source, then expose a view with
-- the original name so all existing Claim logic reads the weekly MasterArticle
-- automatically without duplicating 11k+ rows into a second table.
ALTER TABLE master_products RENAME TO master_products_legacy;

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
