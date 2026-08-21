# Claim Center — Cloudflare Production Edition

ระบบ Claim Center บน Cloudflare Workers + D1 โดยคง Business Logic จากระบบ Claim เดิม และล็อกโครงสร้างข้อมูลภายนอกให้ตรงกับ `Claim CCD.xlsm` เพื่อให้ข้อมูลเก่าและข้อมูลใหม่ต่อกันได้โดยคอลัมน์ไม่สลับ

## Production Runtime

- **Cloudflare Workers** — API, authentication, business logic และ security layer
- **Cloudflare D1** — Claim, User, Master, Reference, Dropdown, audit และ case summary
- **Workers Static Assets** — HTML/CSS/JavaScript ใน `public/`
- **GitHub Actions** — syntax check, logic tests และ CCD column-contract tests

Repository นี้ไม่มี Node HTTP server, local SQLite หรือ Docker runtime แล้ว

## Business Logic ที่คงจากระบบเดิม

- Login / Session / Admin / User
- Validation รูปแบบ Store, Claim DC, Transport, Driver, Article, Barcode, Qty และวันที่
- Master Store / Product / Barcode / SKU Cost / Segment / Eggs / Check 100%
- Amount = SKU Cost × Claim Qty
- Claim No. `HYP` / `MBC` / `FC` + วันที่ + Running Number
- Reference `CCD` / `TF`
- ใช้ Claim/Reference เดียวกันตาม Transport group เดิม
- Duplicate protection ด้วย `Transport No. + Article`
- รักษาผู้สร้างเดิมและ audit trail ตอน Edit
- Search / Edit / Delete / Archive
- Email draft / Email status
- Reference DC / TP
- User performance
- Pivot

## Operations Dashboard

Dashboard ใหม่ใช้กฎเดิมแบบ **1 Transport = 1 Case** และสถานะหลักมี priority:

1. มี Reject อย่างน้อยหนึ่งรายการ → `Reject`
2. ไม่มี Reject แต่มี Pending → `Pending`
3. ที่เหลือ → `Accept`

ระบบเก็บ `claim_case_summary` แยกจาก item rows และใช้ D1 `COUNT / SUM / GROUP BY` เพื่อไม่โหลด Claim ทั้งตารางเข้า Worker

Dashboard แสดง:

- Total Cases / Claim Value / Average Ticket / Completion Rate
- Accept / Pending / Reject
- Daily หรือ Monthly trend
- Format mix: HYPER / MBC / FRANCHISE
- Top Stores
- Hub / Type status
- Recent Transport cases
- Filter ปี / เดือน / WHO / Status / Format

Case summary จะ sync หลัง Save, Edit, Delete และ Historical Import โดยอัตโนมัติ

## Claim CCD Compatibility

External save/export ถูกล็อกเป็น **A:AQ = 43 คอลัมน์** ตามไฟล์ `Claim CCD.xlsm` รายละเอียดอยู่ที่:

- `docs/CLAIM-CCD-COLUMNS.md`

ตำแหน่งสำคัญ เช่น `S=Claims Reason`, `V=Status`, `W=WHO`, `Y=Claim No.`, `Z=Reference`, `AA=Cause Group`, `AB=ROOT CAUSE`, `AN=User`, `AO=Unique Key`, `AP=Month`, `AQ=Year` ถูกตรวจด้วย CI เพื่อป้องกัน column drift ในอนาคต

Metadata ภายในเว็บ เช่น `ref_id`, updated timestamp และ session อยู่ใน D1 แยกจาก A:AQ

## Editable Dropdowns

ผู้ใช้งานที่ Login สามารถเพิ่มหรือลบ Dropdown ได้เอง:

- Claims Reason
- Status
- WHO (`DC`, `TP`, `QC` และค่าใหม่ในอนาคต)
- Cause Group
- ROOT CAUSE
- Check
- Adjust Code
- Status SC
- Remark List

การลบ option ไม่แก้หรือลบค่าที่บันทึกใน Claim เก่า

## Historical Import

Admin มีหน้า **นำเข้าข้อมูลเก่า** สำหรับ `.xlsm`, `.xlsx`, `.xls`, `.csv`

- หา Sheet `Claim All BU` อัตโนมัติ
- ตรวจ A:AQ 43 คอลัมน์
- Preview ก่อน Import
- รักษา Claim No., Reference, User, Unique Key, Month และ Year เดิม
- Import เป็น Archive โดย default
- Skip `Transport + Article` หรือ Unique Key ที่มีอยู่แล้ว
- Sync Running Number จากประวัติ เพื่อให้เลขใหม่ต่อจากข้อมูลเดิม
- มี checkpoint / Resume เมื่อ Browser, Network หรือ quota หยุดกลางทาง
- UI ทำงานเป็น logical chunk และ adapter แบ่ง request จริงไม่เกิน 15 rows เพื่อมี headroom ใต้ D1 query limit

เพื่อป้องกัน Free-tier write quota มี Safety Budget เริ่มต้น `4,000` historical rows ต่อ Cloudflare quota day และ reset ตาม **00:00 UTC (07:00 ไทย)** ปรับได้ด้วย `HISTORY_IMPORT_DAILY_ROWS`

## D1 Migrations

```text
0001_cloudflare_d1.sql        Core schema + indexes + case summary
0002_claim_ccd_format.sql     Claim CCD fields + editable dropdowns
0003_dashboard_summary.sql    Dashboard summary indexes/extensions
0004_history_import_usage.sql Historical import safety ledger
```

Apply migrations ตามลำดับด้วย Wrangler

## Setup

```bash
npm install
npx wrangler login
npx wrangler d1 create claim-center --location apac
```

นำ `database_id` ที่ได้ไปแทน `REPLACE_WITH_D1_DATABASE_ID` ใน `wrangler.jsonc`

ตั้ง Admin password เป็น Cloudflare Secret:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Apply D1:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Local development:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

ดูรายละเอียดใน `CLOUDFLARE.md`

## Validation

```bash
npm run check
npm test
```

CI ตรวจทั้ง JavaScript syntax, Claim business logic, 43-column CCD contract และ Dashboard dominant-status rule

## Repository Structure

```text
.
├── .github/workflows/ci.yml
├── docs/
│   └── CLAIM-CCD-COLUMNS.md
├── lib/
│   ├── auth.js
│   └── claim-logic.js
├── migrations/
│   ├── 0001_cloudflare_d1.sql
│   ├── 0002_claim_ccd_format.sql
│   ├── 0003_dashboard_summary.sql
│   └── 0004_history_import_usage.sql
├── public/
│   ├── app.js
│   ├── ccd-adapter.js
│   ├── ops-dashboard.js
│   ├── ops.css
│   ├── history-import.js
│   ├── history-batch-adapter.js
│   ├── history-styles.js
│   ├── history.css
│   ├── history-quota.css
│   ├── index.html
│   └── styles.css
├── test/
│   ├── claim-logic.test.js
│   └── ccd-contract.test.js
├── worker/
│   ├── app.js
│   ├── index.js
│   ├── d1.js
│   ├── client-adapter.js
│   ├── ccd-index.js
│   ├── dashboard.js
│   └── history-import.js
├── CLOUDFLARE.md
├── package.json
└── wrangler.jsonc
```

## Security

- `ADMIN_PASSWORD` อยู่ใน Cloudflare Secret เท่านั้น
- Password ถูก hash ก่อนเก็บ
- Session ใช้ HttpOnly / SameSite cookie
- Mutation API ตรวจ Origin และ authentication
- User-management และ Historical Import เป็น Admin-only
- Dropdown management ต้อง Login
- ห้าม commit API key, token หรือ password ลง repository

Token / key ที่เคยฝังใน source ระบบเดิมควรถูก revoke/rotate ก่อนใช้งาน production
