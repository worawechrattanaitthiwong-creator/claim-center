import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimDateKey,
  claimPrefix,
  finalStatus,
  formatTypeForStore,
  normalizeDate,
  normalizeImportedRow,
  sanitizePallet,
  validateClaimRow
} from '../lib/claim-logic.js';

test('normalizes the original 18-column import format', () => {
  const row = normalizeImportedRow([
    '11101', 'Store A', '92924', '17/08/2026', '2026-08-17', '123456',
    '1กข2345', 'Somchai', 'DN01', 'R01', '80000000,1234567890', 'ignored',
    "'100000001", "'8850000000001", 'Product', '10', '9', '1'
  ]);
  assert.equal(row.storeCode, '11101');
  assert.equal(row.receivedDate, '2026-08-17');
  assert.equal(row.article, '100000001');
  assert.equal(row.basketNo, '');
  assert.equal(row.palletNo, '234567890');
});

test('keeps the original format, status, and running-number rules', () => {
  assert.equal(formatTypeForStore('11101'), 'HYPER');
  assert.equal(formatTypeForStore('21101'), 'MBC');
  assert.equal(formatTypeForStore('31101'), 'FRANCHISE');
  assert.equal(claimPrefix('FRANCHISE'), 'FC');
  assert.equal(claimDateKey('2026-08-17'), '170826');
  assert.equal(finalStatus('Accept'), 'Complete');
  assert.equal(finalStatus('Pending'), 'Pending');
  assert.equal(sanitizePallet('80000000:1234567890'), '234567890');
  assert.equal(normalizeDate('17/08/2026'), '2026-08-17');
});

test('validates store, DC, transport, article, date, status, root cause, and check', () => {
  const valid = normalizeImportedRow({
    storeCode: '11101', claimDc: '92924', transportNo: '123456', driver: 'Somchai',
    article: '100000001', barcode: '8850000000001', sentQty: '1', receivedQty: '0',
    claimQty: '1', amount: 20, replyDate: '2026-08-17', status: 'Accept', who: 'DC',
    rootCause: 'Short Delivery', checkResult: 'DC Accept'
  });
  assert.deepEqual(validateClaimRow(valid, { bypassDate: true }), []);

  const invalid = { ...valid, storeCode: '999', transportNo: 'T123', article: 'ABC', rootCause: '', checkResult: '' };
  const errors = validateClaimRow(invalid, { bypassDate: true });
  assert.ok(errors.length >= 5);
});
