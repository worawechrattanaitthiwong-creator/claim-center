import fs from 'node:fs';

const compat = fs.readFileSync('site/v8-compat.js','utf8');
const runtime = fs.readFileSync('worker/v8-runtime.js','utf8');

const checks = [
  ['legacy Claim Workspace title', compat.includes('สร้างและตรวจเคลมด้วย Logic เดิม')],
  ['one decision for whole claim', compat.includes('Decision สำหรับทั้ง Claim') && compat.includes('ใช้ Decision ชุดเดียวกับสินค้าทุกรายการ')],
  ['old Decision Master categories restored', ['claims_reason','status','who','cause_group','root_cause','check_result','remark_list','adjust_code','status_sc'].every(x => compat.includes(`'${x}'`))],
  ['store dropdown remains connected', compat.includes("'store_topic'") && compat.includes("'.siReason'")],
  ['reliable login capture', compat.includes("installReliableLogin") && compat.includes("'/api/auth/login'") && compat.includes('location.reload()')],
  ['save override is capture phase', compat.includes("e.target.closest('#saveClaim')") && compat.includes('}, true);')],
  ['V8 runtime injects compat asset', runtime.includes('/v8-compat.js') && runtime.includes('keep the new Store/DC workflow')],
];

for (const [name, ok] of checks) {
  if (!ok) throw new Error(`compat contract failed: ${name}`);
}
console.log(`compat contract OK: ${checks.length} checks`);
