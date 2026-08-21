export const MASTER_ARTICLE_COLUMN_COUNT = 63;

export const MASTER_ARTICLE_COLUMNS = Object.freeze({
  article: 0,          // A  ARTICLE
  barcode: 3,          // D  BARCODE
  description: 4,      // E  DESCRIPTION
  manageWeight: 11,    // L  MANAGE_WEIGHT
  itemValue: 35,       // AJ ITEM_VALUE
  segDescription: 39   // AN SEG_DESCRIPTION
});

export const VALIDATION_SOURCE_COLUMNS = Object.freeze({
  article: 4,          // E in the file selected by RunValidation
  reference: 14        // O in the file selected by RunValidation
});

export const VALIDATION_OUTPUT = Object.freeze({
  headers: ['Who Accept', 'Result', 'Remark', 'Transport No.', 'ทะเบียนรถ', 'ชื่อพนักงานขับรถ', 'Claim date', 'Claim No.'],
  valid: {
    whoAccept: 'DC Accept',
    result: 'Valid',
    remark: 'Process ในระบบได้'
  },
  invalid: {
    whoAccept: 'No Accept',
    result: 'No Valid',
    remark: 'เลข Reference ไม่สามารถตรวจสอบได้ / ไม่สอดคล้องกับรายการเคลม'
  }
});

export function cleanMasterText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeArticle(value) {
  return cleanMasterText(value).replace(/^'+/, '').replace(/'/g, '');
}

export function normalizeBarcode(value) {
  return cleanMasterText(value).replace(/^'+/, '').replace(/'/g, '');
}

export function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cleanMasterText(value).replace(/,/g, '');
  if (!text) return 0;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapMasterArticleRow(source) {
  if (!Array.isArray(source)) throw new Error('MasterArticle row ต้องเป็น Array');
  const row = Array.from({ length: MASTER_ARTICLE_COLUMN_COUNT }, (_, index) => source[index] ?? '');
  const article = normalizeArticle(row[MASTER_ARTICLE_COLUMNS.article]);
  if (!article) throw new Error('ARTICLE ห้ามว่าง');

  return {
    article,
    barcode: normalizeBarcode(row[MASTER_ARTICLE_COLUMNS.barcode]),
    description: cleanMasterText(row[MASTER_ARTICLE_COLUMNS.description]),
    manageWeight: cleanMasterText(row[MASTER_ARTICLE_COLUMNS.manageWeight]),
    itemValue: numericValue(row[MASTER_ARTICLE_COLUMNS.itemValue]),
    segDescription: cleanMasterText(row[MASTER_ARTICLE_COLUMNS.segDescription]),
    raw: row
  };
}

export function validationKey(article, reference) {
  return `${normalizeArticle(article).toLowerCase()}|${cleanMasterText(reference).toLowerCase()}`;
}

export function assertMasterArticleHeaders(headers) {
  if (!Array.isArray(headers)) throw new Error('ไม่พบหัวตาราง MasterArticle');
  const expected = [
    [MASTER_ARTICLE_COLUMNS.article, 'ARTICLE', 'A'],
    [MASTER_ARTICLE_COLUMNS.barcode, 'BARCODE', 'D'],
    [MASTER_ARTICLE_COLUMNS.description, 'DESCRIPTION', 'E'],
    [MASTER_ARTICLE_COLUMNS.manageWeight, 'MANAGE_WEIGHT', 'L'],
    [MASTER_ARTICLE_COLUMNS.itemValue, 'ITEM_VALUE', 'AJ'],
    [MASTER_ARTICLE_COLUMNS.segDescription, 'SEG_DESCRIPTION', 'AN']
  ];

  const errors = [];
  for (const [index, name, column] of expected) {
    const actual = cleanMasterText(headers[index]).toUpperCase();
    if (actual !== name) errors.push(`${column} ต้องเป็น ${name} แต่พบ ${actual || 'ว่าง'}`);
  }
  if (errors.length) throw new Error(`โครงสร้าง MasterArticle ไม่ตรงไฟล์ Claim CCD: ${errors.join(' • ')}`);
  return true;
}
