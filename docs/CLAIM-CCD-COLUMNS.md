# Claim CCD.xlsm — Data Contract A:AQ

ไฟล์ `Claim CCD.xlsm` เป็น Source of Truth สำหรับลำดับข้อมูลภายนอกของ Claim Center

> **กฎ:** Export / Historical Import ต้องคง A:AQ = 43 คอลัมน์ตามลำดับด้านล่าง ห้ามแทรก internal metadata เข้าไปกลางชุดข้อมูล

| Excel | # | Header | D1 / Meaning |
|---|---:|---|---|
| A | 1 | Store Code | `store_code` |
| B | 2 | Store Name (Thai) | `store_name` |
| C | 3 | Claim DC | `claim_dc` |
| D | 4 | Received Date | `received_date` |
| E | 5 | Claim Date | `reported_date` |
| F | 6 | Transport No. | `transport_no` |
| G | 7 | VehicleNo. | `vehicle_no` |
| H | 8 | Driver | `driver` |
| I | 9 | DN No. | `dn_no` |
| J | 10 | Route | `route` |
| K | 11 | Pallet No. | `pallet_no` |
| L | 12 | Basket No. | `basket_no` |
| M | 13 | Article | `article` |
| N | 14 | Barcode | `barcode` |
| O | 15 | Description | `description` |
| P | 16 | Delivery Qty (PU/Kg) | `sent_qty` |
| Q | 17 | Received QTY (PU/Kg) | `received_qty` |
| R | 18 | Claim Qty (PU/Kg) | `claim_qty` |
| S | 19 | Claims Reason | `reason` |
| T | 20 | Amount claim | `amount` |
| U | 21 | Ship Date | `reply_date` |
| V | 22 | Update status | `update_status` |
| W | 23 | WHO | `who` |
| X | 24 | Format Type | `format_type` |
| Y | 25 | Claim NO | `claim_no` |
| Z | 26 | Reference_No. | `reference_no` |
| AA | 27 | Cause Group | `cause_group` |
| AB | 28 | ROOT CAUSE | `root_cause` |
| AC | 29 | Check | `check_result` |
| AD | 30 | Remark List | `remark_list` |
| AE | 31 | Eggs | `list_eggs` |
| AF | 32 | Format Type | `store_type` (หัวไฟล์เดิมใช้ชื่อ Format Type ซ้ำ) |
| AG | 33 | MANAGE_WEIGHT | `manage_weight` |
| AH | 34 | Adjust Code | `sc` |
| AI | 35 | Status SC | `complete_sc` |
| AJ | 36 | Remark | `remark` |
| AK | 37 | Store Hyper 100 % | `check_100` / store check value |
| AL | 38 | SKU_cost | `sku_cost` |
| AM | 39 | SEG_DESCRIPTION | `seg_description` |
| AN | 40 | User | `created_by` |
| AO | 41 | Unique Key | `unique_key` |
| AP | 42 | Month | `data_month` |
| AQ | 43 | Year | `data_year` |

## Internal metadata ที่ไม่อยู่ใน A:AQ

ตัวอย่างข้อมูลที่ระบบเก็บใน D1 แต่ไม่แทรกเข้า Export contract:

- `id`
- `ref_id`
- `created_at`
- `updated_at`
- `updated_by`
- `email_sent`
- `archived`
- session/authentication metadata

ด้วยวิธีนี้ไฟล์ Export ใหม่สามารถนำไปต่อกับข้อมูล Claim CCD เดิมได้โดยไม่เกิด column drift

## Historical Import

Historical Import อ่าน A:AQ ตามตารางนี้โดยตรง และรักษาค่าเดิมของ:

- Claim No.
- Reference No.
- Cause Group / ROOT CAUSE / Check / Remark List
- User
- Unique Key
- Month / Year

ข้อมูลย้อนหลังจะถูก Import เป็น Archive โดย default และระบบจะ sync Claim/Reference sequence เพื่อให้เลขใหม่ต่อจากประวัติเดิม

## CI Protection

`test/ccd-contract.test.js` ตรวจอัตโนมัติว่า:

- Header มี 43 คอลัมน์
- ตำแหน่งสำคัญ A/F/M/S/V/W/Y/Z/AA/AB/AN/AO/AP/AQ ไม่เปลี่ยน
- Historical importer ยังล็อก 43 columns
- Dashboard ยังใช้ 1 Transport = 1 Case และ Reject > Pending > Accept

หากมีการเปลี่ยนลำดับโดยไม่ตั้งใจ CI จะไม่ผ่านก่อน merge
