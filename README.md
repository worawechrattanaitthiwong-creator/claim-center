# Claim Center — Clean Rewrite

ระบบ Claim Center เขียนใหม่จากศูนย์สำหรับ Cloudflare Workers + D1 โดยคงโครงสร้างข้อมูลและ Business Logic ที่จำเป็นจาก Claim CCD เดิม

## Production architecture

```text
GitHub main
  ├─ worker/main.js       # Worker/API ตัวเดียว
  ├─ site/index.html      # UI หลักตัวเดียว
  ├─ site/app.js          # Frontend controller ตัวเดียว
  ├─ site/styles.css      # Light/Dark design system
  ├─ migrations/          # D1 schema 0001–0006
  ├─ wrangler.jsonc
  └─ package.json
        ↓
Cloudflare Git Build
        ↓
Worker: claim-center
        ↓
D1: claim-center
```

ไม่มี runtime UI injection, ไม่มี Worker wrapper ซ้อน, ไม่มี Pivot Table และไม่มี frontend legacy directory

## UI

- Operations Dashboard
- แจ้งเคลม
- รายการเคลม
- RunValidation (E = Article + O = Reference)
- Reference
- สถิติการทำงาน
- Dynamic Dropdown (Admin)
- Master Store / Master Article Weekly Replace (Admin)
- Historical Import A:AQ (Admin)
- User Management (Admin)
- Light / Dark mode

## Data contract

D1 migrations `0001`–`0006` ถูกเก็บไว้เพื่อรักษา schema เดิมและข้อมูล Production

Master Article mapping หลัก:

- A = ARTICLE
- D = BARCODE
- E = DESCRIPTION
- L = MANAGE_WEIGHT
- AJ = ITEM_VALUE (SKU Cost)
- AN = SEG_DESCRIPTION

RunValidation:

- อ่านข้อมูลตั้งแต่ Excel row 10
- E = Article
- O = Reference
- Match ด้วย `Article + Reference_No.`
- พบ: `DC Accept / Valid / Process ในระบบได้`
- ไม่พบ: `No Accept / No Valid`

## Deploy

Cloudflare Git Build ใช้:

```bash
npm run check && npm test
npm run deploy
```

`wrangler.jsonc` ชี้ `worker/main.js` และ Static Assets จาก `site/` เท่านั้น

## Safety

- `ADMIN_PASSWORD` ต้องเก็บเป็น Cloudflare Secret
- D1 binding ต้องเป็น `DB → claim-center`
- อย่าลบ D1 database เมื่อต้องการเปลี่ยน UI/Worker
- การแก้ schema ใหม่ให้ทำผ่าน migration ใหม่เท่านั้น
