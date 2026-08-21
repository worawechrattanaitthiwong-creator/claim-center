import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTER_ARTICLE_COLUMN_COUNT,
  MASTER_ARTICLE_COLUMNS,
  VALIDATION_OUTPUT,
  VALIDATION_SOURCE_COLUMNS,
  assertMasterArticleHeaders,
  mapMasterArticleRow,
  validationKey
} from '../lib/master-validation.js';

test('MasterArticle contract matches Claim CCD workbook positions', () => {
  assert.equal(MASTER_ARTICLE_COLUMN_COUNT, 63);
  assert.deepEqual(MASTER_ARTICLE_COLUMNS, {
    article: 0,
    barcode: 3,
    description: 4,
    manageWeight: 11,
    itemValue: 35,
    segDescription: 39
  });
});

test('MasterArticle maps AJ ITEM_VALUE into price and AN into segment', () => {
  const row = Array(63).fill('');
  row[0] = "'10012345";
  row[3] = "'8851234567890";
  row[4] = 'Test Product';
  row[11] = 'Y';
  row[35] = '1,234.50';
  row[39] = 'FROZEN';

  const mapped = mapMasterArticleRow(row);
  assert.equal(mapped.article, '10012345');
  assert.equal(mapped.barcode, '8851234567890');
  assert.equal(mapped.description, 'Test Product');
  assert.equal(mapped.manageWeight, 'Y');
  assert.equal(mapped.itemValue, 1234.5);
  assert.equal(mapped.segDescription, 'FROZEN');
});

test('MasterArticle header validation rejects shifted price column', () => {
  const headers = Array(63).fill('');
  headers[0] = 'ARTICLE';
  headers[3] = 'BARCODE';
  headers[4] = 'DESCRIPTION';
  headers[11] = 'MANAGE_WEIGHT';
  headers[35] = 'WRONG_PRICE_COLUMN';
  headers[39] = 'SEG_DESCRIPTION';

  assert.throws(() => assertMasterArticleHeaders(headers), /AJ ต้องเป็น ITEM_VALUE/);
  headers[35] = 'ITEM_VALUE';
  assert.equal(assertMasterArticleHeaders(headers), true);
});

test('RunValidation contract keeps source E + O and original result labels', () => {
  assert.deepEqual(VALIDATION_SOURCE_COLUMNS, { article: 4, reference: 14 });
  assert.deepEqual(VALIDATION_OUTPUT.headers, [
    'Who Accept', 'Result', 'Remark', 'Transport No.', 'ทะเบียนรถ',
    'ชื่อพนักงานขับรถ', 'Claim date', 'Claim No.'
  ]);
  assert.equal(VALIDATION_OUTPUT.valid.whoAccept, 'DC Accept');
  assert.equal(VALIDATION_OUTPUT.valid.result, 'Valid');
  assert.equal(VALIDATION_OUTPUT.valid.remark, 'Process ในระบบได้');
  assert.equal(VALIDATION_OUTPUT.invalid.whoAccept, 'No Accept');
  assert.equal(VALIDATION_OUTPUT.invalid.result, 'No Valid');
});

test('RunValidation key normalizes Article and case', () => {
  assert.equal(validationKey("'10001", 'CCD0000001'), validationKey('10001', 'ccd0000001'));
});
