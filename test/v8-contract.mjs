import fs from 'node:fs';
import assert from 'node:assert/strict';

const worker = fs.readFileSync('worker/v8-entry.js', 'utf8');
const runtime = fs.readFileSync('worker/v8-runtime.js', 'utf8');
const ui = fs.readFileSync('site/v8.js', 'utf8');
const css = fs.readFileSync('site/v8.css', 'utf8');
const migration = fs.readFileSync('migrations/0011_store_dc_workflow_v8.sql', 'utf8');
const wrangler = fs.readFileSync('wrangler.jsonc', 'utf8');

for (const token of [
  '/api/v8/store/cases',
  '/api/v8/master/articles',
  'RETURNED_TO_STORE',
  '/api/v8/registry',
  '/api/v8/backup',
  '/api/v8/admin/purge',
  '/api/v8/options'
]) assert.ok(worker.includes(token), `missing V8 worker contract: ${token}`);

assert.ok(worker.includes("function reviewer(u) { if (!(isAdmin(u)||isDc(u)))"), 'Store review writes must be DC/Admin only');
assert.ok(worker.includes("function canEditDropdown(u) { return isAdmin(u) || isDc(u); }"), 'Dropdown editing must be DC/Admin only');
assert.ok(worker.includes('ไม่พบสินค้าใน Master Article'), 'Store items must resolve against Master Article');
assert.ok(worker.includes('วันที่รับสินค้า'), 'Store received date validation is required');
assert.ok(worker.includes("UPDATE store_cases SET status='RETURNED_TO_STORE'"), 'Return-to-Store workflow missing');

assert.ok(runtime.includes("user.user_type || '') === 'trainer'"), 'Trainer Store collaboration must be read-only');
assert.ok(runtime.includes('/messages$'), 'Trainer chat mutation guard missing');

for (const token of [
  '1 Transport = 1 Ticket',
  'storeClaimReceivedDate',
  'storeClaimDate',
  'v8ProductList',
  'Dropdown Settings',
  'Backup & Restore',
  'Data Control',
  'data-v8-return',
  'data-v8-reg-save'
]) assert.ok(ui.includes(token), `missing V8 UI contract: ${token}`);

assert.ok(css.includes('.transport-input'), 'Transport emphasis styling missing');
assert.ok(css.includes('.v8-review-table'), 'Detailed DC review styling missing');
assert.ok(migration.includes('CREATE TABLE store_case_items'), 'Normalized Store item table missing');
assert.ok(migration.includes('received_date'), 'Store received date column missing');
assert.ok(migration.includes("'store_topic'"), 'Store topic dropdown seed missing');
assert.ok(wrangler.includes('"main": "worker/v8-runtime.js"'), 'V8 runtime is not active');

console.log('Claim Center V8 contract checks passed');
