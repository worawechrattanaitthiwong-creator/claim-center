import fs from 'node:fs';

const runtime = fs.readFileSync('worker/evidence-runtime.js','utf8');
const css = fs.readFileSync('site/final-ui.css','utf8');
const storeCss = fs.readFileSync('site/store-submit.css','utf8');
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
  ['Store items use one compact spreadsheet row per Article', ui.includes('store-items-header') && storeCss.includes('grid-template-columns:0 minmax(250px,1.2fr) 110px 110px 110px')],
  ['Store item number sits inside Article area without a separate column', storeCss.includes('.store-items-header>span:first-child{display:none!important}') && storeCss.includes('position:absolute!important') && storeCss.includes('left:10px!important')],
  ['Store row matches DC quantities', ui.includes('Delivery Qty') && ui.includes('Received Qty') && ui.includes('Claim Qty') && storeCss.includes('.store-delivery-field') && storeCss.includes('.store-received-field')],
  ['Master-only inputs stay hidden from Store', ui.includes("'.siProduct','.siBarcode','.siPrice','.siPrep','.siPack','.siSupplier'") && storeCss.includes('.store-master-hidden{display:none!important}')],
  ['Article cell shows raw barcode value and description without field-name prefix', ui.includes('data-store-barcode') && ui.includes('data-store-description') && ui.includes("barcodeEl.textContent = barcode || '—'") && !ui.includes('`Barcode ${barcode')],
  ['Article Master line uses compact upper space', storeCss.includes('width:760px') && storeCss.includes('margin:0 2px 3px 72px') && storeCss.includes('font-size:14px')],
  ['Store lower controls share one compact aligned height', storeCss.includes('align-items:end!important') && storeCss.includes('height:40px!important') && storeCss.includes('min-height:40px!important')],
  ['Article field has no shadow', storeCss.includes('.store-article-field input:focus{box-shadow:none!important') && storeCss.includes('box-shadow:none!important')],
  ['Truck and driver are visible in Claim Information', ui.includes("labelFor(coreGrid, '#storeClaimVehicle')") && ui.includes("labelFor(coreGrid, '#storeClaimDriver')") && ui.includes("labelFor(coreGrid, '#storeClaimDc')?.classList.add('store-background-hidden')") && storeCss.includes('.store-truck-field,.store-driver-field{display:block!important}')],
  ['Claim Information balances four desktop columns', storeCss.includes('.store-core-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important')],
  ['high-volume entry supports adding ten rows', ui.includes("addTen.textContent = '+ 10 แถว'") && ui.includes('for (let i = 0; i < 10; i += 1) add.click()')],
  ['Store item list is bounded and scrollable', storeCss.includes('max-height:min(62vh,680px)') && storeCss.includes('overflow:auto!important')],
  ['internal numbered routes remain untouched', runtime.includes("import runtime from './v8-runtime.js'")]
];

for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`Complete mobile UI: PASS (${checks.length} checks)`);
