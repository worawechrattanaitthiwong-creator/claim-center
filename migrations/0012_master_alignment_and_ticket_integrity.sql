PRAGMA foreign_keys = ON;

-- Align existing MasterStore rows with the actual Claim CCD MasterStore layout.
-- A Location ID, B Store type, E Thai name, U Lanes.
UPDATE master_stores
SET
  store_name = COALESCE(
    NULLIF(json_extract(raw_json,'$[4]'),''),
    NULLIF(json_extract(raw_json,'$[5]'),''),
    NULLIF(json_extract(raw_json,'$[1]'),''),
    store_name
  ),
  store_type = COALESCE(NULLIF(json_extract(raw_json,'$[1]'),''), store_type),
  format_type = COALESCE(
    NULLIF(json_extract(raw_json,'$[20]'),''),
    NULLIF(json_extract(raw_json,'$[12]'),''),
    format_type
  )
WHERE json_valid(raw_json)=1 AND json_type(raw_json)='array';

UPDATE master_stores
SET check_100 = COALESCE(
  (SELECT c.flag FROM master_check100 c WHERE c.store_code=master_stores.store_code),
  check_100,
  ''
);

-- Keep existing Store submissions and historical Claim rows aligned with the corrected Master Store name.
UPDATE store_cases
SET store_name = COALESCE(
  (SELECT m.store_name FROM master_stores m WHERE m.store_code=store_cases.store_code),
  store_name
)
WHERE EXISTS (SELECT 1 FROM master_stores m WHERE m.store_code=store_cases.store_code);

UPDATE claims
SET store_name = COALESCE(
  (SELECT m.store_name FROM master_stores m WHERE m.store_code=claims.store_code),
  store_name
)
WHERE archived=0
  AND EXISTS (SELECT 1 FROM master_stores m WHERE m.store_code=claims.store_code);

-- Transport is the operational Ticket key; keep lookups/status views fast.
CREATE INDEX IF NOT EXISTS idx_store_cases_transport_status_v8
ON store_cases(transport_no,status,updated_at DESC);
