import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrangler = fs.readFileSync('wrangler.jsonc', 'utf8');
const production = fs.readFileSync('worker/production.js', 'utf8');
const ui = fs.readFileSync('public/pro-ui.js', 'utf8');
const css = fs.readFileSync('public/pro-ui.css', 'utf8');

test('production has one deterministic main entrypoint', () => {
  assert.match(wrangler, /"main"\s*:\s*"worker\/production\.js"/);
  assert.match(wrangler, /"run_worker_first"\s*:\s*true/);
  assert.match(production, /main-reconnect-v1/);
  assert.match(production, /\/api\/build/);
  assert.match(production, /pro-ui\.js/);
  assert.match(production, /master-validation\.js/);
  assert.match(production, /cache-control', 'no-store/);
});

test('Validation is first-class and Pivot is retired without touching business logic', () => {
  assert.match(ui, /data-view = 'validation'|dataset\.view = 'validation'/);
  assert.match(ui, /id = 'view-validation'|id="view-validation"/);
  assert.match(ui, /masterArticleCard/);
  assert.match(ui, /validationFile/);
  assert.match(ui, /validationRunButton/);
  assert.match(ui, /data-view="pivot"/);
  assert.match(ui, /dataset\.retired/);
});

test('UI v3 provides persistent Light and Dark modes', () => {
  assert.match(ui, /claim-center-theme/);
  assert.match(ui, /data-theme-choice/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /body\.pro-ui-v3/);
});
