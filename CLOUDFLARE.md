# Claim Center on Cloudflare Workers + D1

Production runtime ใช้ Cloudflare Workers + D1 และ Workers Static Assets โดยคง Claim business logic เดิมและใช้ `Claim CCD.xlsm` A:AQ เป็น data contract

## Architecture

```text
Browser
  ├─ Static Assets: public/
  └─ /api/*
       ↓
worker/app.js                 production orchestration
  ├─ worker/ccd-index.js      CCD compatibility + editable dropdowns
  ├─ worker/index.js          auth + base APIs
  ├─ worker/d1.js             Claim D1 data layer
  ├─ worker/dashboard.js      case summary + D1 SQL analytics
  └─ worker/history-import.js historical A:AQ migration
       ↓
Cloudflare D1 (binding: DB)
```

Client safety/adapters:

- `worker/client-adapter.js` — Claim/Master batching
- `public/ccd-adapter.js` — Claim CCD fields + editable dropdown UI
- `public/ops-dashboard.js` — Operations Dashboard
- `public/history-import.js` — Historical Import workflow
- `public/history-batch-adapter.js` — split history import to D1-safe 15-row server chunks

## D1 Migrations

Apply all migrations in order:

1. `0001_cloudflare_d1.sql` — core schema, indexes, case summary
2. `0002_claim_ccd_format.sql` — A:AQ fields + dropdown tables
3. `0003_dashboard_summary.sql` — dashboard summary indexes/extensions
4. `0004_history_import_usage.sql` — historical import quota ledger

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## 1. Install / Login

```bash
npm install
npx wrangler login
```

## 2. Create D1

```bash
npx wrangler d1 create claim-center --location apac
```

นำ UUID ที่ได้ไปแทน:

```jsonc
"database_id": "REPLACE_WITH_D1_DATABASE_ID"
```

ใน `wrangler.jsonc`

## 3. Admin Secret

```bash
npx wrangler secret put ADMIN_PASSWORD
```

ห้าม commit password หรือ token ลง repository

Vars ปัจจุบันใน `wrangler.jsonc`:

- `ADMIN_USERNAME`
- `SESSION_HOURS`
- `HISTORY_IMPORT_DAILY_ROWS`

## 4. Local Validation

```bash
npm run check
npm test
npm run dev
```

Health API:

```text
GET /api/health
```

## 5. Deploy

```bash
npm run deploy
```

## Claim Save Batching

ผู้ใช้กด Save ครั้งเดียวเหมือนเดิม แต่ adapter จะแบ่งงานให้เหมาะกับ D1:

- Claim save: 10 rows/server request
- Master lookup / Master Store / Master Product: split + merge อัตโนมัติ
- Historical import UI: logical chunk 40 rows แต่ transport adapter ส่งจริงสูงสุด 15 rows/server request

## Claim CCD Data Contract

Export ถูกล็อกเป็น **A:AQ = 43 columns** ตาม `Claim CCD.xlsm`

- mapping: `docs/CLAIM-CCD-COLUMNS.md`
- internal metadata เช่น `ref_id`, updated timestamp และ session อยู่แยกใน D1
- CI ตรวจ column count และตำแหน่งสำคัญเพื่อป้องกัน column drift

## Operations Dashboard

Dashboard ใช้ `claim_case_summary` โดยกฎเดิม:

- 1 Transport = 1 Case
- Reject > Pending > Accept

Save / Edit / Delete / Historical Import จะ sync summary อัตโนมัติ

Analytics ใช้ D1 `COUNT / SUM / GROUP BY` แทนการโหลด item rows ทั้งหมดเข้า Worker

ถ้ามี Claim ใน D1 ก่อนเริ่มใช้ summary ให้ Admin กด **Rebuild Summary** หนึ่งครั้ง

## Historical Import

Admin สามารถนำ `.xlsm/.xlsx/.xls/.csv` เดิมเข้า D1 ได้จากหน้าเว็บ

Importer จะ:

- หา `Claim All BU`
- อ่าน A:AQ 43 columns
- Preserve Claim No., Reference, User, Unique Key, Month, Year
- Import เป็น Archive โดย default
- Skip duplicate `Transport + Article` / Unique Key
- Sync running sequences
- เก็บ checkpoint ใน Browser เพื่อ Resume
- มอง Safety Budget pause เป็น resumable state ไม่ใช่ data failure

### Free-tier Safety Budget

Default:

```jsonc
"HISTORY_IMPORT_DAILY_ROWS": "4000"
```

เป็น safety budget เชิงอนุรักษ์สำหรับ historical migration เพราะ Claim insert มี secondary indexes และ dashboard summary writes เพิ่มเติม ค่า budget reset ตาม Cloudflare daily window **00:00 UTC (07:00 เวลาไทย)**

ถ้าเปลี่ยนเป็น Paid หรือทำ migration ในช่วงที่ไม่มี normal workload สามารถปรับค่า env นี้ได้หลังประเมิน D1 Analytics

## Editable Dropdowns

Authenticated users เพิ่ม/ลบได้:

- Claims Reason
- Status
- WHO
- Cause Group
- ROOT CAUSE
- Check
- Adjust Code
- Status SC
- Remark List

ค่าที่ถูกลบออกจาก dropdown จะไม่แก้ข้อมูล Claim เก่าที่เคยบันทึกไว้

## Go-live Verification

ก่อนเปิดผู้ใช้จริงให้ตรวจตามลำดับนี้:

1. Login / Logout / Change password
2. Import Master Store และ Product sample
3. บันทึก Claim ใหม่ 1 Transport หลาย Article
4. ตรวจ Claim No. และ Reference group
5. ลอง Duplicate Transport + Article
6. Edit Claim และเปลี่ยน Status / Transport เพื่อยืนยัน summary sync
7. Delete Transport และตรวจ Dashboard ลดตาม
8. Import history sample 50–100 rows แล้ว Export กลับ
9. เทียบ Export A:AQ กับ `Claim CCD.xlsm` แบบ column-by-column
10. เทียบ Dashboard total cases/amount กับ Excel sample โดยกฎ 1 Transport = 1 Case
11. ทดสอบ Dropdown add/delete และเปิด Claim เก่าที่ใช้ option ถูกลบ
12. ทดสอบ Email draft/status, Reference, Performance และ Pivot
13. เปิด D1 Analytics ตรวจ rows read / rows written / storage
14. เมื่อผ่านทั้งหมดค่อยนำ history เต็มก้อนเข้า Archive

## Production Checklist

1. Replace D1 placeholder `database_id`
2. Set `ADMIN_PASSWORD` secret
3. Apply migrations 0001–0004
4. Import Master Store / Product
5. Import Claim history (Archive)
6. Check Running No. / Reference sequence
7. Verify Dashboard totals against Excel sample
8. Test Search / Edit / Delete / Email / Export / Dropdown
9. Check Export A:AQ against `Claim CCD.xlsm`
10. Review D1 Analytics: rows read / rows written / storage
11. Rotate legacy API tokens/keys before go-live

## CI

GitHub Actions executes:

```bash
npm run check
npm test
```

Tests include Claim logic plus CCD 43-column and Dashboard dominant-status contract checks
