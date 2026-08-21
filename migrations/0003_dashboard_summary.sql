-- Production dashboard extensions.
-- Dashboard always works at 1 Transport = 1 Case, matching the legacy Claim Center logic.

ALTER TABLE claim_case_summary ADD COLUMN egg_values TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_case_summary_date_who
  ON claim_case_summary(reply_date, who);
CREATE INDEX IF NOT EXISTS idx_case_summary_date_status
  ON claim_case_summary(reply_date, dominant_status);
CREATE INDEX IF NOT EXISTS idx_case_summary_date_format
  ON claim_case_summary(reply_date, format_type);
CREATE INDEX IF NOT EXISTS idx_case_summary_store_date
  ON claim_case_summary(store_code, reply_date);
