PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS login_rate_limits (
  rate_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_login_rate_blocked ON login_rate_limits(blocked_until);

DROP TRIGGER IF EXISTS trg_claim_amount_round_insert;
DROP TRIGGER IF EXISTS trg_claim_amount_round_update;
CREATE TRIGGER trg_claim_amount_round_insert
AFTER INSERT ON claims
WHEN NEW.amount_claim != ROUND(NEW.amount_claim, 2)
BEGIN
  UPDATE claims SET amount_claim = ROUND(NEW.amount_claim, 2) WHERE id = NEW.id;
END;
CREATE TRIGGER trg_claim_amount_round_update
AFTER UPDATE OF amount_claim ON claims
WHEN NEW.amount_claim != ROUND(NEW.amount_claim, 2)
BEGIN
  UPDATE claims SET amount_claim = ROUND(NEW.amount_claim, 2) WHERE id = NEW.id;
END;
