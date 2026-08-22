import fs from 'node:fs';

const runtime = fs.readFileSync('worker/v8-runtime.js','utf8');
const api = fs.readFileSync('worker/v8-plus.js','utf8');
const ui = fs.readFileSync('site/v8-plus.js','utf8');
const css = fs.readFileSync('site/v8-plus.css','utf8');
const migration = fs.readFileSync('migrations/0013_claim_center_ops_pack.sql','utf8');
const compat = fs.readFileSync('site/v8-compat.js','utf8');
const v8 = fs.readFileSync('site/v8.js','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const wrangler = fs.readFileSync('wrangler.jsonc','utf8');

const deploy = pkg.scripts?.deploy || '';
const checks = [
  ['isolated plus route', runtime.includes("url.pathname.startsWith('/api/v8/plus/')") && runtime.includes("import plus from './v8-plus.js'")],
  ['plus UI loads before V8', runtime.includes('PLUS_SCRIPT') && runtime.includes('html.replace(v8Tag, `${PLUS_SCRIPT}${v8Tag}`)')],
  ['dashboard metrics', api.includes("'/api/v8/plus/dashboard'") && ui.includes('CLAIM OPERATIONS PULSE')],
  ['sla aging', api.includes('SLA_HOURS = 24') && ui.includes('เกิน SLA')],
  ['notification center enhancement', ui.includes('renderNotificationCenterPlus') && ui.includes('data-plus-notify-case')],
  ['r2 evidence model', api.includes('env.EVIDENCE.put') && migration.includes('CREATE TABLE IF NOT EXISTS store_case_evidence') && ui.includes('compressImage')],
  ['r2 draft binding stays isolated', wrangler.includes('"binding": "EVIDENCE"') && wrangler.includes('"r2_buckets"')],
  ['deploy provisions before migration', deploy.startsWith('wrangler deploy && npm run db:migrate:remote') && deploy.endsWith('&& wrangler deploy')],
  ['wrangler supports provisioning', String(pkg.devDependencies?.wrangler || '').includes('4.45')],
  ['ticket timeline', api.includes('timeline = [') && ui.includes('ประวัติ Ticket')],
  ['global search', api.includes("'/api/v8/plus/search'") && ui.includes('plusGlobalInput')],
  ['data quality warnings', api.includes('qualityWarnings') && ui.includes('storeDraftWarnings')],
  ['claim summary before save', ui.includes('Claim Summary ก่อนบันทึก') && ui.includes('captureClaimSave')],
  ['closed reopen', api.includes('REOPEN_STORE_TICKET') && ui.includes('Reopen Ticket')],
  ['admin audit log', api.includes("'/api/v8/plus/audit'") && ui.includes('AUDIT TRAIL')],
  ['saved my work filters', ui.includes('MY WORK / SAVED FILTERS') && ui.includes('claimCenterSavedFilters')],
  ['business excel pdf output', api.includes("'/api/v8/plus/report'") && ui.includes('Excel Report') && ui.includes('PDF / Print')],
  ['max five evidence files', api.includes('>= 5') && ui.includes('0 / 5')],
  ['store evidence remains permission scoped', api.includes("['SUBMITTED','RETURNED_TO_STORE']")],
  ['trainer not granted mutation', api.includes("throw pub(403,'บัญชีนี้ดูหลักฐานได้อย่างเดียว')")],
  ['core compatibility preserved', compat.includes('Decision สำหรับทั้ง Claim') && v8.includes('1 Transport = 1 Ticket')],
  ['no core source replacement marker', !api.includes('window.fetch =') && !ui.includes('function installReliableLogin')],
  ['responsive operations css', css.includes('@media(max-width:760px)')]
];

for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`Claim Center operations pack: PASS (${checks.length} checks)`);
