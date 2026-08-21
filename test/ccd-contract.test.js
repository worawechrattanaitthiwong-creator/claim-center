import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ccdSource = readFileSync(new URL('../worker/ccd-index.js', import.meta.url), 'utf8');
const historySource = readFileSync(new URL('../worker/history-import.js', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../worker/dashboard.js', import.meta.url), 'utf8');

function extractCcdHeaders() {
  const block = ccdSource.match(/const CLAIM_CCD_HEADERS = \[([\s\S]*?)\n\];/);
  assert.ok(block, 'CLAIM_CCD_HEADERS must exist in worker/ccd-index.js');
  return [...block[1].matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

test('Claim CCD export contract stays A:AQ = 43 columns', () => {
  const headers = extractCcdHeaders();
  assert.equal(headers.length, 43);
  assert.equal(headers[0], 'Store Code');          // A
  assert.equal(headers[5], 'Transport No.');      // F
  assert.equal(headers[12], 'Article');            // M
  assert.equal(headers[18], 'Claims Reason');      // S
  assert.equal(headers[21], 'Update status');      // V
  assert.equal(headers[22], 'WHO');                // W
  assert.equal(headers[24], 'Claim NO');           // Y
  assert.equal(headers[25], 'Reference_No.');      // Z
  assert.equal(headers[26], 'Cause Group');        // AA
  assert.equal(headers[27], 'ROOT CAUSE');         // AB
  assert.equal(headers[39], 'User');               // AN
  assert.equal(headers[40], 'Unique Key');         // AO
  assert.equal(headers[41], 'Month');              // AP
  assert.equal(headers[42], 'Year');               // AQ
});

test('Historical importer is locked to the same 43-column contract and safe chunk size', () => {
  assert.match(historySource, /const CCD_COLUMNS = 43;/);
  assert.match(historySource, /const IMPORT_LIMIT = 15;/);
  assert.match(historySource, /const DEFAULT_DAILY_IMPORT_ROWS = 4000;/);
});

test('Dashboard preserves the legacy case and dominant-status rules', () => {
  assert.match(dashboardSource, /1 Transport = 1 Case/);
  const reject = dashboardSource.indexOf("lower(update_status) = 'reject'");
  const pending = dashboardSource.indexOf("lower(update_status) = 'pending'");
  assert.ok(reject >= 0 && pending > reject, 'Reject must have priority before Pending');
  assert.match(dashboardSource, /ELSE 'Accept'/);
});
