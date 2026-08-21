# Claim CCD — MasterArticle & RunValidation Contract

เอกสารนี้ล็อก Logic จากไฟล์ `Claim CCD.xlsm` / `Claim CCD(1).xlsm` ที่ใช้เป็น Source of Truth สำหรับ Claim Center บน Cloudflare

## MasterArticle

ไฟล์ตัวอย่างล่าสุดใช้ Sheet `MasterArticle` ช่วง `A:BK` และมีข้อมูล 63 คอลัมน์

คอลัมน์ที่ Claim Center ใช้โดยตรง:

| Excel | Header | การใช้งาน |
|---|---|---|
| A | `ARTICLE` | Product key หลัก |
| D | `BARCODE` | Barcode ↔ Article lookup |
| E | `DESCRIPTION` | รายละเอียดสินค้า |
| L | `MANAGE_WEIGHT` | น้ำหนัก / flag ตาม Master |
| AJ | `ITEM_VALUE` | ราคาต่อหน่วย / `SKU_cost` |
| AN | `SEG_DESCRIPTION` | Segment description |

### Pricing Logic

Logic จาก VBA เดิม:

- `AJ = ITEM_VALUE` ถูก VLOOKUP ด้วย Article
- `SKU_cost = ITEM_VALUE`
- `Amount claim = ITEM_VALUE × Claim Qty`
- `AN = SEG_DESCRIPTION` ถูกเก็บไปกับรายการ Claim

Cloudflare version รักษาสูตรนี้เหมือนเดิม โดย `master_products` เป็น compatibility view ที่อ่าน MasterArticle batch ที่ Active อยู่

### Duplicate Article

ไฟล์จริงอาจมี Article ซ้ำ และ Excel `VLOOKUP` คืนค่ารายการแรกที่เจอ

Weekly uploader จึงใช้กฎเดียวกัน:

- อ่านไฟล์จากบนลงล่าง
- Article ที่เจอครั้งแรกเป็นค่าที่ใช้งาน
- Article ซ้ำถัดไปถูกนับเป็น duplicate และไม่ทับรายการแรก
- ต้องรับ source rows ครบทุกแถวก่อน Finalize

## Weekly Replace Policy

หน้า Admin > Master Data มี `Master Article — Weekly Replace`

Flow:

1. เลือก `.xlsx`, `.xlsm`, `.xls` หรือ `.csv`
2. ระบบเลือก Sheet `MasterArticle` ถ้ามี
3. ตรวจหัวตาราง A/D/E/L/AJ/AN ก่อนอัปโหลด
4. อัปโหลดเข้า staging batch ทีละชุด
5. Master เดิมยัง Active ตลอดช่วง upload
6. เมื่อ source rows ครบ ระบบจึงสลับ batch ใหม่เป็น Active
7. หลังสลับสำเร็จจึงลบ row data ของ MasterArticle batch เก่า

แนะนำให้อัปโหลดไฟล์ใหม่ทุกวันจันทร์ตามรอบงานของทีม

## RunValidation

Macro เดิม `RunValidation` ใช้คู่ข้อมูลจากไฟล์ที่เลือก:

- Source column **E** = Article
- Source column **O** = Reference

แล้วเทียบกับ Claim database:

- Claim Article = column M ในไฟล์ Claim เดิม
- Claim Reference_No. = column Z ในไฟล์ Claim เดิม

เมื่อพบคู่ `Article + Reference` จะคืนข้อมูล:

- Transport No.
- ทะเบียนรถ
- ชื่อพนักงานขับรถ
- Claim date
- Claim No.

### Result columns Q:X

| Column | Header | Found | Not Found |
|---|---|---|---|
| Q | Who Accept | `DC Accept` | `No Accept` |
| R | Result | `Valid` | `No Valid` |
| S | Remark | `Process ในระบบได้` | `เลข Reference ไม่สามารถตรวจสอบได้ / ไม่สอดคล้องกับรายการเคลม` |
| T | Transport No. | DB value | `-` |
| U | ทะเบียนรถ | DB value | `-` |
| V | ชื่อพนักงานขับรถ | DB value | `-` |
| W | Claim date | DB value | `-` |
| X | Claim No. | DB value | `-` |

Cloudflare Validation Center อ่านข้อมูล source ตั้งแต่แถว 10 เหมือน VBA เดิม และ Export ผลเป็น 2 Sheets:

- `Valid`
- `No Valid`

ฐานค้นหาเปลี่ยนจากการวนเปิด `Claim_Data_*.xls*` บน Network มาเป็น D1 เท่านั้น แต่ business rule และ output labels รักษาตาม Macro เดิม
