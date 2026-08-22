import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const runtime = read('worker/v8-runtime.js');
const entry = read('worker/v8-entry.js');
const ui = read('site/v8.js');
const compat = read('site/v8-compat.js');
const css = read('site/v8.css');
const migration = read('migrations/0012_master_alignment_and_ticket_integrity.sql');

const checks = [
  ['valid login bypasses stale lockout', runtime.includes('reliableLogin') && runtime.includes("DELETE FROM login_rate_limits WHERE rate_key=?")],
  ['login verifies scrypt before session', runtime.includes('verifyPassword(password') && runtime.includes("INSERT INTO sessions")],
  ['frontend login has one handler', compat.includes('oldForm.cloneNode(true)') && compat.includes('oldForm.replaceWith(form)')],
  ['frontend verifies session', compat.includes('ไม่สามารถยืนยัน Session หลังเข้าสู่ระบบ')],
  ['real Master Store import', entry.includes('saveStoreMasterAligned') && entry.includes("raw[4]") && entry.includes("raw[20]")],
  ['rich Master Article view', entry.includes('supplier_name') && entry.includes('prep_unit') && entry.includes('pack_size') && entry.includes('picking_unit')],
  ['Article optional in Store', ui.includes('Article <small>ไม่บังคับ</small>')],
  ['Store product name and price from Master', ui.includes('ชื่อสินค้า') && ui.includes('ราคา / หน่วย') && ui.includes('หน่วยเตรียม')],
  ['Store received and claim dates', ui.includes('storeClaimReceivedDate') && ui.includes('storeClaimDate')],
  ['Store subject dropdown only', ui.includes('<select id="storeClaimSubject"') && entry.includes("optionExists(env, 'store_topic'")],
  ['Store edit delete retained', ui.includes('data-v8-edit-case') && ui.includes('data-v8-delete-case')],
  ['DC Trainer Store read only', ui.includes('Store Data · Read only') && entry.includes('viewStore(user)')],
  ['Trainer chat read only', runtime.includes('Trainer ดูข้อมูล Store ได้อย่างเดียว')],
  ['DC return to Store', entry.includes('returnToStore') && ui.includes('ส่งกลับ Store พร้อมอัปเดตสถานะ')],
  ['one Transport one Ticket', entry.includes('มี Ticket') && entry.includes('transport_no=?')],
  ['Ticket count distinct Transport', entry.includes('new Set(data.map(c => text(c.transport_no)')],
  ['Queue searches Transport', ui.includes('ค้นหาด้วย Transport') && ui.includes('v8QueueTransport')],
  ['rich review includes Master Store', ui.includes('MASTER STORE') && ui.includes('Supplier') && ui.includes('Segment')],
  ['Registry admin edit delete', ui.includes('data-v8-reg-delete-case') && ui.includes('data-v8-reg-delete-item') && entry.includes('registryUpdate')],
  ['Registry uses central dropdowns', ui.includes("selectOptions('status'") && ui.includes("selectOptions('who'") && ui.includes("selectOptions('root_cause'")],
  ['Admin scoped purge retained', entry.includes('store_submissions') && entry.includes('dc_claims') && entry.includes('master_store') && entry.includes('all_business')],
  ['Store DC backup retained', entry.includes('/api/v8/backup') && entry.includes('backupRestore')],
  ['DC Admin dropdown editing retained', entry.includes('dropdownEditor') && ui.includes('ตัวเลือกถูกอัปเดตให้ทุกหน้าที่เกี่ยวข้อง')],
  ['technical copy guard', ui.includes('installCorporateTextGuard') && ui.includes('โครงสร้างข้อมูลมาตรฐาน')],
  ['Master alignment migration', migration.includes("json_extract(raw_json,'$[4]')") && migration.includes('idx_store_cases_transport_status_v8') && css.includes('.v8-master-strip')]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  process.exit(1);
}
console.log(`Latest command contract: PASS (${checks.length} checks)`);
