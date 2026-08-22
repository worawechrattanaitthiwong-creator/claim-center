const COMPLETE_LABEL = 'เวอร์ชันสมบูรณ์';
const articleTimers = new WeakMap();

function qs(s, r=document) { return r.querySelector(s); }
function qsa(s, r=document) { return [...r.querySelectorAll(s)]; }
function escComplete(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function moneyComplete(v) { return new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0)); }

function setPlainLabel(label, text) {
  if (!label) return;
  const node = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim());
  if (node) node.nodeValue = text + ' ';
}

function installCompleteIdentity() {
  document.title = 'Claim Center · Store & DC Operations';
  const apply = () => {
    const badge = qs('#buildBadge');
    if (badge && badge.textContent !== COMPLETE_LABEL) badge.textContent = COMPLETE_LABEL;
    qsa('.system-line b').forEach(el => {
      if (el.id === 'loginBuild' && el.textContent && !/ไม่สามารถ/.test(el.textContent) && el.textContent !== 'พร้อมใช้งาน') el.textContent = 'พร้อมใช้งาน';
    });
  };
  apply();
  const badge = qs('#buildBadge');
  if (badge) new MutationObserver(apply).observe(badge,{childList:true,characterData:true,subtree:true});
}

function ensureArticleList() {
  let list = qs('#completeArticleList');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'completeArticleList';
    (qs('#page-store-new') || document.body).append(list);
  }
  return list;
}

async function searchArticle(input, row) {
  const term = input.value.trim();
  if (term.length < 2) return;
  try {
    const r = await fetch('/api/v8/master/articles?q=' + encodeURIComponent(term));
    if (!r.ok) return;
    const d = await r.json();
    const rows = d.data || [];
    const list = ensureArticleList();
    list.innerHTML = rows.slice(0,30).map(x => `<option value="${escComplete(x.article)}">${escComplete(x.description)} · ฿${moneyComplete(x.sku_cost)} · ${escComplete(x.barcode||'')}</option>`).join('');
    row._completeMatches = rows;
    const exact = rows.find(x => String(x.article) === term);
    if (exact) {
      input.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(() => refreshMasterSummary(row), 180);
      setTimeout(() => refreshMasterSummary(row), 520);
    }
  } catch {}
}

function masterSummaryHtml(row) {
  const article = qs('.siArticle',row)?.value.trim() || '';
  const name = qs('.siProduct',row)?.value.trim() || '';
  const barcode = qs('.siBarcode',row)?.value.trim() || '';
  const price = qs('.siPrice',row)?.value.trim() || '';
  const prep = qs('.siPrep',row)?.value.trim() || '';
  const pack = qs('.siPack',row)?.value.trim() || '';
  const supplier = qs('.siSupplier',row)?.value.trim() || '';
  if (!article || !name) return '<span class="complete-master-empty">กรอก Article แล้วระบบจะเติมชื่อสินค้า Barcode ราคา และข้อมูล Master ให้อัตโนมัติ</span>';
  return `<div><span>สินค้า</span><b>${escComplete(name)}</b></div><div><span>Barcode</span><b>${escComplete(barcode||'—')}</b></div><div><span>ราคา / หน่วย</span><b>฿${escComplete(price||'0.00')}</b></div><div><span>หน่วย / Pack</span><b>${escComplete([prep,pack].filter(Boolean).join(' · ')||'—')}</b></div>${supplier?`<div class="complete-master-supplier"><span>Supplier</span><b>${escComplete(supplier)}</b></div>`:''}`;
}

function refreshMasterSummary(row) {
  const host = qs('.complete-master-summary',row);
  if (host) host.innerHTML = masterSummaryHtml(row);
}

function decorateItemRow(row) {
  if (!row || row.dataset.completeUi === '1') return;
  row.dataset.completeUi = '1';
  const grid = qs('.v8-item-grid',row);
  if (!grid) return;
  grid.classList.add('complete-item-grid');

  const article = qs('.siArticle',row);
  const product = qs('.siProduct',row);
  if (!article || !product) return;
  const articleLabel = article.closest('label');
  const productLabel = product.closest('label');
  articleLabel?.classList.add('complete-article');
  productLabel?.classList.add('complete-product');
  setPlainLabel(articleLabel,'Article *');
  setPlainLabel(productLabel,'สินค้า (จาก Master)');
  article.required = true;
  article.placeholder = 'กรอก Article';
  article.setAttribute('list','completeArticleList');
  article.setAttribute('autocomplete','off');
  product.readOnly = true;
  product.removeAttribute('list');
  product.placeholder = 'ระบบเติมจาก Article';

  ['.siBarcode','.siPrice','.siPrep','.siPack','.siSupplier','.siMasterStatus','.siSegment'].forEach(sel => {
    const label = qs(sel,row)?.closest('label');
    if (label) label.classList.add('complete-master-hidden');
  });

  const delivery = qs('.siDelivery',row), received = qs('.siReceived',row), claim = qs('.siClaim',row);
  [[delivery,'Delivery'],[received,'Received'],[claim,'Claim *']].forEach(([input,title]) => {
    if (!input) return;
    const label = input.closest('label');
    label?.classList.add('complete-qty');
    setPlainLabel(label,title);
    input.setAttribute('inputmode','decimal');
  });
  const reason = qs('.siReason',row);
  const remark = qs('.siRemark',row);
  if (reason) { reason.closest('label')?.classList.add('complete-reason'); setPlainLabel(reason.closest('label'),'สาเหตุ'); }
  if (remark) { remark.closest('label')?.classList.add('complete-remark'); setPlainLabel(remark.closest('label'),'หมายเหตุ'); remark.placeholder='รายละเอียดที่ Store ต้องแจ้ง'; }
  qs('.v8-item-amount',row)?.classList.add('complete-amount');

  const summary = document.createElement('div');
  summary.className = 'complete-master-summary';
  productLabel.insertAdjacentElement('afterend',summary);
  refreshMasterSummary(row);

  article.addEventListener('input',() => {
    clearTimeout(articleTimers.get(article));
    const timer = setTimeout(() => searchArticle(article,row),220);
    articleTimers.set(article,timer);
  });
  article.addEventListener('change',() => {
    summary.innerHTML = '<span class="complete-master-empty">กำลังดึงข้อมูลจาก Master…</span>';
    setTimeout(() => refreshMasterSummary(row),180);
    setTimeout(() => refreshMasterSummary(row),520);
  });
  article.addEventListener('keydown',e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      article.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(() => claim?.focus(),280);
    }
  });
}

function decorateStoreForm() {
  const page = qs('#page-store-new');
  if (!page) return;
  ensureArticleList();
  const intro = qs('.page-intro p',page);
  if (intro) intro.textContent = 'Store กรอกข้อมูลที่เกิดขึ้นจริง โดยใช้ Article เป็นข้อมูลหลัก ระบบจะดึงชื่อสินค้า Barcode ราคา และรายละเอียดจาก Master ให้อัตโนมัติ';
  const itemHead = qs('.card-head .muted',qs('#storeItemRows',page)?.closest('.card') || page);
  if (itemHead) itemHead.textContent = 'กรอก Article เป็นหลัก แล้วใส่จำนวนที่เกี่ยวข้องกับการเคลม ระบบเติมข้อมูล Master ให้เอง';
  qsa('.v8-item-row',page).forEach(decorateItemRow);
}

function focusNewArticle() {
  setTimeout(() => {
    const rows = qsa('.v8-item-row');
    qs('.siArticle',rows[rows.length-1])?.focus();
  },60);
}

function startCompleteUi() {
  installCompleteIdentity();
  decorateStoreForm();
  document.addEventListener('click',e => { if (e.target.closest('#addStoreItem')) focusNewArticle(); },true);
  new MutationObserver(records => {
    let shouldDecorate = false;
    for (const r of records) {
      for (const n of r.addedNodes || []) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('.v8-item-row') || n.querySelector?.('.v8-item-row') || n.id === 'page-store-new') shouldDecorate = true;
      }
    }
    if (shouldDecorate) decorateStoreForm();
  }).observe(document.body,{childList:true,subtree:true});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',startCompleteUi,{once:true});
else startCompleteUi();
