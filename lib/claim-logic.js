import { randomBytes } from 'node:crypto';

export const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

export const BASE_FIELDS = [
  'storeCode', 'storeName', 'claimDc', 'receivedDate', 'reportedDate',
  'transportNo', 'vehicleNo', 'driver', 'dnNo', 'route', 'palletNo',
  'basketNo', 'article', 'barcode', 'description', 'sentQty', 'receivedQty',
  'claimQty'
];

export const CLAIM_HEADERS = [
  'Store Code', 'Store Name', 'Claim DC', 'วันที่รับสินค้า', 'วันที่แจ้งเคลม',
  'Transport No.', 'VehicleNo. ทะเบียนรถ', 'Driver', 'DN No.', 'Route',
  'Pallet No.', 'Basket No.', 'Article', 'Barcode', 'Description รายการสินค้า',
  'จำนวนที่ส่ง Qty (PU/Kg)', 'จำนวนทีได้รับ QTY (PU/Kg)', 'จำนวนที่เคลม Qty (PU/Kg)',
  'Claims Reason สาเหตุการเคลม', 'Amount claim จำนวนเงินเคลม', 'ตอบกลับสาขา',
  'Update status', 'WHO', 'Format Type', 'Type', 'Claim NO', 'Reference_No.',
  'Status final', 'ROOT CAUSE', 'Check', 'Remark', 'List Eggs', 'check 100 %',
  'MANAGE_WEIGHT', 'SC', 'Complet SC', 'Store เช็ค 100 %', 'SKU_cost',
  'SEG_DESCRIPTION', 'ผู้บันทึกข้อมูล', 'Ref_ID', 'Last_Updated_Date',
  'Last_Updated_By', 'Email_Sent'
];

export const ALLOWED_CLAIM_DCS = new Set(['92924', '91915', '91210', '91101']);
export const ALLOWED_STATUSES = new Set(['Accept', 'Reject', 'Pending']);
export const ALLOWED_WHO = new Set(['DC', 'TP']);

export const CLAIM_REASONS = [
  '1. สินค้าขาดส่ง',
  '2. สินค้าส่งเกิน',
  '3. สินค้าส่งผิดรายการ',
  '4. สินค้าไม่ได้คุณภาพ',
  '5. สินค้าชำรุดจากการขนส่ง',
  '6. สินค้าหมดอายุ',
  '8. สินค้าถูกแกะกิน'
];

export const CHECK_OPTIONS = [
  'Store wrong claim (Not missing pallet) - Not exceeding 5,000',
  'Store wrong claim ( สาขารับตะกร้าครบตาม Rams )',
  'Store wrong claim (Claim Delay)',
  'DC Accept', 'TP Accept', 'TP Reject', 'Transfer', 'ตรวจสอบ', 'Cancel Claim',
  'Reject ตามเอกสาร', 'พบสินค้าตกค้างที่ DC', 'เอกสารไม่สมบูรณ์', 'อื่นๆ'
];

export const ROOT_CAUSE_OPTIONS = [
  'Short Delivery', 'Over Delivery', 'Damage Delivery', 'Left Over',
  'Not Missing pallet', 'Delivery wrong branch', 'Claim over timeline', 'Other',
  'Product already send to store', 'TP Reject', 'DC Left over', 'Store Cancelled',
  'Not missing basket', 'Store wrong policy', 'DC Damage', 'DC Other',
  'DC Short Delivery', 'TP Accident', 'TP Damage', 'TP Other', 'TP Short Delivery'
];

export const CHECK_TO_ROOT = {
  'Store wrong claim (Not missing pallet) - Not exceeding 5,000': 'Not Missing pallet',
  'Store wrong claim ( สาขารับตะกร้าครบตาม Rams )': 'Not missing basket',
  'Store wrong claim (Claim Delay)': 'Claim over timeline',
  'TP Reject': 'TP Reject',
  'Transfer': 'Delivery wrong branch',
  'Cancel Claim': 'Store Cancelled',
  'Reject ตามเอกสาร': 'Product already send to store',
  'พบสินค้าตกค้างที่ DC': 'DC Left over',
  'เอกสารไม่สมบูรณ์': 'Store wrong policy',
  'อื่นๆ': 'Other'
};

export function cleanText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function onlyDigits(value) {
  return cleanText(value).replace(/\D/g, '');
}

export function sanitizePallet(value) {
  const cleaned = cleanText(value).replace(/80000000/g, '').replace(/[,:]/g, '').trim();
  return cleaned.length > 9 ? cleaned.slice(-9) : cleaned;
}

export function normalizeDate(value) {
  const text = cleanText(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return localIsoDate(parsed);
}

export function localIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function bangkokTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date);
}

export function formatTypeForStore(storeCode, fallback = '') {
  const store = cleanText(storeCode);
  if (store.startsWith('1')) return 'HYPER';
  if (store.startsWith('2')) return 'MBC';
  if (store.startsWith('3')) return 'FRANCHISE';
  return cleanText(fallback).toUpperCase();
}

export function claimPrefix(formatType) {
  const type = cleanText(formatType).toUpperCase();
  if (type === 'HYPER') return 'HYP';
  if (type === 'MBC') return 'MBC';
  if (type === 'FRANCHISE') return 'FC';
  return type.length > 3 ? type.slice(0, 3) : type;
}

export function claimDateKey(dateValue) {
  const iso = normalizeDate(dateValue);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}${month}${year.slice(-2)}`;
}

export function makeRefId(date = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TIME_ZONE,
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  return `CLM-${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}-${randomBytes(2).readUInt16BE(0).toString().padStart(5, '0')}`;
}

export function normalizeImportedRow(source) {
  const row = {};
  if (Array.isArray(source)) {
    BASE_FIELDS.forEach((name, index) => { row[name] = source[index] ?? ''; });
  } else {
    BASE_FIELDS.forEach((name) => { row[name] = source?.[name] ?? ''; });
    Object.assign(row, source || {});
  }

  row.storeCode = onlyDigits(row.storeCode);
  row.claimDc = onlyDigits(row.claimDc).slice(0, 5);
  row.transportNo = cleanText(row.transportNo);
  row.article = cleanText(row.article).replace(/'/g, '');
  row.barcode = cleanText(row.barcode).replace(/'/g, '');
  row.receivedDate = normalizeDate(row.receivedDate);
  row.reportedDate = normalizeDate(row.reportedDate);
  row.replyDate = normalizeDate(row.replyDate);
  row.palletNo = sanitizePallet(row.palletNo);
  row.basketNo = '';
  row.status = normalizeChoice(row.status, ALLOWED_STATUSES);
  row.who = normalizeChoice(row.who, ALLOWED_WHO);
  for (const field of [
    'storeCode', 'storeName', 'claimDc', 'vehicleNo', 'driver', 'dnNo', 'route',
    'palletNo', 'basketNo', 'article', 'barcode', 'description', 'reason',
    'rootCause', 'checkResult', 'remark', 'sc', 'completeSc', 'storeCheck100',
    'formatType', 'storeType', 'claimNo', 'referenceNo', 'finalStatus', 'listEggs',
    'check100', 'manageWeight', 'segDescription', 'createdBy', 'refId', 'updatedAt',
    'updatedBy'
  ]) row[field] = cleanText(row[field]);
  row.amount = numberOrZero(row.amount);
  row.skuCost = numberOrZero(row.skuCost);
  row.sentQty = numericText(row.sentQty);
  row.receivedQty = numericText(row.receivedQty);
  row.claimQty = numericText(row.claimQty);
  row.emailSent = Boolean(row.emailSent === true || cleanText(row.emailSent).toLowerCase() === 'true');
  return row;
}

function normalizeChoice(value, allowed) {
  const text = cleanText(value);
  for (const option of allowed) {
    if (option.toLowerCase() === text.toLowerCase()) return option;
  }
  return text;
}

export function numberOrZero(value) {
  const number = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function numericText(value) {
  const text = cleanText(value);
  if (!text) return '';
  const number = Number.parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(number) ? String(number) : text;
}

export function validateClaimRow(row, { bypassDate = false, now = new Date() } = {}) {
  const errors = [];
  if (!/^\d{5}$/.test(row.storeCode)) errors.push('Store Code ต้องเป็นตัวเลข 5 หลัก');
  else if (!['1', '2', '3', '7'].includes(row.storeCode[0])) errors.push('Store Code ต้องขึ้นต้นด้วย 1, 2, 3 หรือ 7');

  if (row.claimDc && !ALLOWED_CLAIM_DCS.has(row.claimDc)) {
    errors.push('Claim DC ต้องเป็น 92924, 91915, 91210 หรือ 91101');
  }
  if (!/^\d+$/.test(row.transportNo)) errors.push('Transport No. ต้องเป็นตัวเลขและห้ามว่าง');
  if (/\d/.test(row.driver)) errors.push('Driver ห้ามมีตัวเลข');
  if (!/^1\d{8}$/.test(row.article)) errors.push('Article ต้องเป็นตัวเลข 9 หลักและขึ้นต้นด้วย 1');
  if (row.barcode && !/^\d+$/.test(row.barcode)) errors.push('Barcode ต้องเป็นตัวเลขเท่านั้น');

  for (const [label, value] of [['จำนวนที่ส่ง', row.sentQty], ['จำนวนที่ได้รับ', row.receivedQty], ['จำนวนที่เคลม', row.claimQty]]) {
    if (value !== '' && !Number.isFinite(Number.parseFloat(value))) errors.push(`${label}ต้องเป็นตัวเลข`);
  }
  if (!Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) errors.push('Amount ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  if (!row.replyDate) errors.push('ตอบกลับสาขา: ต้องระบุวันที่');
  else if (!bypassDate) validateReplyDate(row.replyDate, now, errors);
  if (!ALLOWED_STATUSES.has(row.status)) errors.push('Update status ต้องเป็น Accept, Reject หรือ Pending');
  if (!ALLOWED_WHO.has(row.who)) errors.push('WHO ต้องเป็น DC หรือ TP');
  if (!cleanText(row.rootCause)) errors.push('ROOT CAUSE ห้ามว่าง');
  if (!cleanText(row.checkResult)) errors.push('Check ห้ามว่าง');
  return errors;
}

function validateReplyDate(value, now, errors) {
  const iso = normalizeDate(value);
  const date = iso ? new Date(`${iso}T00:00:00+07:00`) : new Date('invalid');
  if (Number.isNaN(date.getTime())) {
    errors.push('วันที่ตอบกลับสาขาไม่ถูกต้อง');
    return;
  }
  const bangkokToday = new Date(`${localIsoDate(now)}T00:00:00+07:00`);
  const minDate = new Date(bangkokToday);
  minDate.setDate(minDate.getDate() - 15);
  if (date.getFullYear() !== bangkokToday.getFullYear()) errors.push('วันที่ตอบกลับต้องอยู่ในปีปัจจุบัน');
  if (date < minDate) errors.push('วันที่ตอบกลับย้อนหลังเกิน 15 วัน');
}

export function finalStatus(status) {
  return status === 'Accept' || status === 'Reject' ? 'Complete' : 'Pending';
}

export function sqlClaimToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeCode: row.store_code,
    storeName: row.store_name,
    claimDc: row.claim_dc,
    receivedDate: row.received_date,
    reportedDate: row.reported_date,
    transportNo: row.transport_no,
    vehicleNo: row.vehicle_no,
    driver: row.driver,
    dnNo: row.dn_no,
    route: row.route,
    palletNo: row.pallet_no,
    basketNo: row.basket_no,
    article: row.article,
    barcode: row.barcode,
    description: row.description,
    sentQty: row.sent_qty,
    receivedQty: row.received_qty,
    claimQty: row.claim_qty,
    reason: row.reason,
    amount: row.amount,
    replyDate: row.reply_date,
    status: row.update_status,
    who: row.who,
    formatType: row.format_type,
    storeType: row.store_type,
    claimNo: row.claim_no,
    referenceNo: row.reference_no,
    finalStatus: row.final_status,
    rootCause: row.root_cause,
    checkResult: row.check_result,
    remark: row.remark,
    listEggs: row.list_eggs,
    check100: row.check_100,
    manageWeight: row.manage_weight,
    sc: row.sc,
    completeSc: row.complete_sc,
    storeCheck100: row.store_check_100,
    skuCost: row.sku_cost,
    segDescription: row.seg_description,
    createdBy: row.created_by,
    refId: row.ref_id,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    emailSent: Boolean(row.email_sent),
    archived: Boolean(row.archived),
    createdAt: row.created_at
  };
}

export function groupClaims(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.transportNo}|${row.status}|${row.who}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        transportNo: row.transportNo,
        status: row.status,
        who: row.who,
        storeCode: row.storeCode,
        storeName: row.storeName,
        referenceNo: row.referenceNo,
        claimNo: row.claimNo,
        emailSent: row.emailSent,
        archived: row.archived,
        totalAmount: 0,
        rows: []
      });
    }
    const group = groups.get(key);
    group.rows.push(row);
    group.totalAmount += Number(row.amount) || 0;
    group.emailSent ||= row.emailSent;
  }
  return [...groups.values()];
}

export function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function claimToExportRow(row) {
  const api = sqlClaimToApi(row);
  return [
    api.storeCode, api.storeName, api.claimDc, api.receivedDate, api.reportedDate,
    api.transportNo, api.vehicleNo, api.driver, api.dnNo, api.route, api.palletNo,
    api.basketNo, api.article, api.barcode, api.description, api.sentQty,
    api.receivedQty, api.claimQty, api.reason, api.amount, api.replyDate, api.status,
    api.who, api.formatType, api.storeType, api.claimNo, api.referenceNo,
    api.finalStatus, api.rootCause, api.checkResult, api.remark, api.listEggs,
    api.check100, api.manageWeight, api.sc, api.completeSc, api.storeCheck100,
    api.skuCost, api.segDescription, api.createdBy, api.refId, api.updatedAt,
    api.updatedBy, api.emailSent ? 'true' : 'false'
  ];
}
