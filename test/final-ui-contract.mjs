import fs from 'node:fs';

const runtime = fs.readFileSync('worker/evidence-runtime.js','utf8');
const css = fs.readFileSync('site/final-ui.css','utf8');
const ui = fs.readFileSync('site/final-ui.js','utf8');
const wrangler = fs.readFileSync('wrangler.jsonc','utf8');

const checks = [
  ['complete UI injected by active runtime', wrangler.includes('worker/evidence-runtime.js') && runtime.includes('/final-ui.css?v=complete') && runtime.includes('/final-ui.js?v=complete')],
  ['browser title no longer exposes numbered release', runtime.includes('Claim Center · Store & DC Operations') && ui.includes("COMPLETE_TITLE = 'Claim Center · Store & DC Operations'")],
  ['user-facing release label is complete', ui.includes("COMPLETE_LABEL = 'เวอร์ชันสมบูรณ์'") && ui.includes("badge.textContent !== COMPLETE_LABEL")],
  ['mobile bottom navigation', css.includes('@media(max-width:760px)') && css.includes('inset:auto 0 0 0!important') && css.includes('overflow-x:auto!important')],
  ['mobile safe areas', css.includes('env(safe-area-inset-bottom)')],
  ['mobile form controls avoid iOS zoom', css.includes('font-size:16px!important')],
  ['mobile tables remain horizontally usable', css.includes('.table-wrap,.v8-review-table,.v8-reg-edit') && css.includes('-webkit-overflow-scrolling:touch')],
  ['mobile dialogs fit viewport', css.includes('width:calc(100vw - 16px)!important') && css.includes('max-height:calc(100dvh - 16px)!important')],
  ['mobile global search remains usable', css.includes('.plus-global-search') && css.includes('.plus-search-results')],
  ['internal numbered routes remain untouched', runtime.includes("import runtime from './v8-runtime.js'")]
];

for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`Complete mobile UI: PASS (${checks.length} checks)`);
