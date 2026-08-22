import fs from 'node:fs';

const runtime = fs.readFileSync('worker/v8-runtime.js', 'utf8');

const checks = [
  ['login freeze marker exists', runtime.includes('LOGIN_UI_FREEZE_FIX_20260822')],
  ['V8 login asset gets cache-busted', runtime.includes('20260822-loginfix1')],
  ['compat login asset gets cache-busted', runtime.includes('20260822-login2')],
  ['V8 asset is patched at runtime', runtime.includes("url.pathname === '/v8.js'") && runtime.includes('patchLoginUiAsset')],
  ['self-mutating login observer is removed from served asset', runtime.includes("loginBuild.textContent !== 'พร้อมใช้งาน'")],
  ['served login JS is no-store', runtime.includes("headers.set('cache-control', 'no-store, max-age=0')")]
];

for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
