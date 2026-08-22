import fs from 'node:fs';
const v8 = fs.readFileSync('site/v8.js','utf8');
const compat = fs.readFileSync('site/v8-compat.js','utf8');
const runtime = fs.readFileSync('worker/v8-runtime.js','utf8');
const checks = [
['login guarded', v8.includes("if (current !== 'พร้อมใช้งาน') loginBuild.textContent = 'พร้อมใช้งาน';")],
['old login loop removed', !v8.includes("if (!/ไม่สามารถ/.test(loginBuild.textContent)) loginBuild.textContent = 'พร้อมใช้งาน';")],
['export guarded', v8.includes('if (after !== before) preview.textContent = after;')],
['old export loop removed', !v8.includes('preview.textContent = preview.textContent.replace')],
['options idempotent', compat.includes('const sameOptions = currentValues.length === desiredValues.length') && compat.includes('if (!sameOptions)')],
['observer disconnects', compat.includes('observer.disconnect();') && compat.includes('observeDropdownContainer')],
['cache bust current', runtime.includes('20260822-observerfix1')]
];
for (const [name, ok] of checks) { if (!ok) { console.error('FAIL:', name); process.exitCode=1; } else console.log('PASS:', name); }
