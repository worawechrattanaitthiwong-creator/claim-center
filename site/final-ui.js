const COMPLETE_LABEL = 'เวอร์ชันสมบูรณ์';
const COMPLETE_TITLE = 'Claim Center · Store & DC Operations';

function scrubVisibleVersionLabels(root=document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ['SCRIPT','STYLE','CODE','PRE'].includes(parent.tagName)) continue;
    const before = node.nodeValue || '';
    const after = before
      .replace(/Claim Center\s+V\d+(?:\.\d+)*/gi, 'Claim Center')
      .replace(/Collaboration\s+V\d+(?:\.\d+)*/gi, 'Collaboration')
      .replace(/Store\/DC\s+Workflow\s+V\d+(?:\.\d+)*/gi, 'Store/DC Workflow');
    if (after !== before) node.nodeValue = after;
  }
}

function labelFor(root, selector) {
  return root.querySelector(selector)?.closest('label') || null;
}

function setLeadingLabelText(label, text) {
  if (!label) return;
  const first = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
  if (first) first.nodeValue = text;
  else label.insertBefore(document.createTextNode(text), label.firstChild);
}

function refreshStoreItemSummary(row) {
  const summary = row.querySelector('.store-master-summary');
  if (!summary) return;
  const article = row.querySelector('.siArticle')?.value.trim() || '';
  const product = row.querySelector('.siProduct')?.value.trim() || '';
  const barcode = row.querySelector('.siBarcode')?.value.trim() || '';
  const price = row.querySelector('.siPrice')?.value.trim() || '';
  const prep = row.querySelector('.siPrep')?.value.trim() || '';
  const pack = row.querySelector('.siPack')?.value.trim() || '';
  const supplier = row.querySelector('.siSupplier')?.value.trim() || '';

  const productEl = summary.querySelector('[data-master-product]');
  const metaEl = summary.querySelector('[data-master-meta]');
  const priceEl = summary.querySelector('[data-master-price]');
  if (!product) {
    productEl.textContent = article ? 'กำลังตรวจสอบ Article กับ Master…' : 'กรอก Article เพื่อดึงข้อมูลสินค้า';
    metaEl.textContent = '';
    priceEl.textContent = '—';
    summary.classList.remove('ready');
    return;
  }

  productEl.textContent = product;
  metaEl.textContent = [barcode && `Barcode ${barcode}`, prep, pack && `Pack ${pack}`, supplier].filter(Boolean).join(' · ');
  priceEl.textContent = price ? `฿${Number(price || 0).toLocaleString('th-TH', { minimumFractionDigits:2, maximumFractionDigits:2 })}` : '฿0.00';
  summary.classList.add('ready');
}

function enhanceStoreItemRow(row) {
  if (!row || row.dataset.finalStoreItem === '1') return;
  row.dataset.finalStoreItem = '1';
  row.classList.add('store-simple-item');

  const grid = row.querySelector('.v8-item-grid');
  if (!grid) return;

  const articleInput = row.querySelector('.siArticle');
  const articleLabel = labelFor(row, '.siArticle');
  const productInput = row.querySelector('.siProduct');
  const claimLabel = labelFor(row, '.siClaim');
  const reasonLabel = labelFor(row, '.siReason');
  const remarkLabel = labelFor(row, '.siRemark');
  const deliveryLabel = labelFor(row, '.siDelivery');
  const receivedLabel = labelFor(row, '.siReceived');
  const amount = row.querySelector('.v8-item-amount');

  if (articleLabel && articleInput) {
    setLeadingLabelText(articleLabel, 'Article ');
    articleLabel.querySelector('small')?.remove();
    if (!articleLabel.querySelector('.required')) {
      const required = document.createElement('span');
      required.className = 'required';
      required.textContent = '*';
      articleLabel.insertBefore(required, articleInput);
    }
    articleLabel.classList.add('store-article-field');
    articleInput.required = true;
    articleInput.placeholder = 'กรอก Article';
    articleInput.autocomplete = 'off';
  }

  if (productInput) productInput.required = false;

  ['.siProduct','.siBarcode','.siPrice','.siPrep','.siPack','.siSupplier','.siMasterStatus','.siSegment'].forEach(selector => {
    labelFor(row, selector)?.classList.add('store-master-hidden');
  });

  claimLabel?.classList.add('store-claim-field');
  reasonLabel?.classList.add('store-reason-field');
  remarkLabel?.classList.add('store-remark-field');
  amount?.classList.add('store-amount-field');

  if (!row.querySelector('.store-master-summary')) {
    const summary = document.createElement('div');
    summary.className = 'store-master-summary';
    summary.innerHTML = `
      <div class="store-master-main">
        <small>ข้อมูลจาก Master</small>
        <b data-master-product>กรอก Article เพื่อดึงข้อมูลสินค้า</b>
        <span data-master-meta></span>
      </div>
      <div class="store-master-price"><small>ราคา / หน่วย</small><strong data-master-price>—</strong></div>`;
    articleLabel?.insertAdjacentElement('afterend', summary);
  }

  if ((deliveryLabel || receivedLabel) && !row.querySelector('.store-item-more')) {
    const details = document.createElement('details');
    details.className = 'store-item-more';
    details.innerHTML = '<summary>ข้อมูลจำนวนรับ-ส่งเพิ่มเติม</summary><div class="store-item-more-grid"></div>';
    const moreGrid = details.querySelector('.store-item-more-grid');
    if (deliveryLabel) moreGrid.append(deliveryLabel);
    if (receivedLabel) moreGrid.append(receivedLabel);
    grid.append(details);
  }

  if (articleInput) {
    let timer = 0;
    articleInput.addEventListener('input', () => {
      row.querySelector('.store-master-summary')?.classList.remove('ready');
      clearTimeout(timer);
      if (articleInput.value.trim().length >= 2) {
        timer = window.setTimeout(() => {
          articleInput.dispatchEvent(new Event('change', { bubbles:true }));
          window.setTimeout(() => refreshStoreItemSummary(row), 450);
        }, 420);
      } else refreshStoreItemSummary(row);
    });
    articleInput.addEventListener('change', () => window.setTimeout(() => refreshStoreItemSummary(row), 450));
    articleInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        articleInput.blur();
      }
    });
  }

  row.querySelector('.siClaim')?.addEventListener('input', () => refreshStoreItemSummary(row));
  refreshStoreItemSummary(row);
}

function enhanceStoreSubmission() {
  const page = document.querySelector('#page-store-new');
  const form = document.querySelector('#storeClaimForm');
  if (!page || !form) return;

  const intro = page.querySelector('.page-intro');
  if (intro) {
    const title = intro.querySelector('h1');
    const desc = intro.querySelector('p');
    if (title) title.textContent = 'แจ้งเคลม';
    if (desc) desc.textContent = 'กรอกข้อมูลที่จำเป็นสำหรับ DC ตรวจสอบและนำเข้าระบบ';
  }

  const transport = form.querySelector('.transport-hero');
  if (transport && !transport.classList.contains('store-transport-compact')) {
    transport.classList.add('store-transport-compact');
    const label = transport.querySelector('label');
    const input = transport.querySelector('#storeClaimTransport');
    setLeadingLabelText(label, 'Transport No. ');
    if (input) input.placeholder = 'กรอก Transport No.';
    const info = transport.querySelector(':scope > div');
    if (info) info.hidden = true;
  }

  const coreCard = form.querySelector(':scope > article.card');
  const coreGrid = coreCard?.querySelector('.form-grid');
  if (coreCard && coreGrid && coreCard.dataset.finalStoreCore !== '1') {
    coreCard.dataset.finalStoreCore = '1';
    coreCard.classList.add('store-core-card');
    coreGrid.classList.add('store-core-grid');
    const eyebrow = coreCard.querySelector('.card-head .eyebrow');
    const heading = coreCard.querySelector('.card-head h3');
    if (eyebrow) eyebrow.textContent = 'CLAIM INFORMATION';
    if (heading) heading.textContent = 'ข้อมูลเคลม';

    const optionalSelectors = ['#storeClaimDc','#storeClaimVehicle','#storeClaimDriver','#storeClaimDn','#storeClaimRoute','#storeClaimPallet','#storeClaimBasket','#storeClaimDetails'];
    const optionalLabels = optionalSelectors.map(selector => labelFor(coreGrid, selector)).filter(Boolean);
    if (optionalLabels.length) {
      const details = document.createElement('details');
      details.className = 'store-optional-fields';
      details.innerHTML = '<summary>ข้อมูลเพิ่มเติม (ไม่บังคับ)</summary><div class="store-optional-grid"></div>';
      const optionalGrid = details.querySelector('.store-optional-grid');
      optionalLabels.forEach(label => optionalGrid.append(label));
      coreCard.append(details);
    }
  }

  const itemCard = document.querySelector('#storeItemRows')?.closest('article.card');
  if (itemCard) {
    const eyebrow = itemCard.querySelector('.card-head .eyebrow');
    const heading = itemCard.querySelector('.card-head h3');
    const desc = itemCard.querySelector('.card-head p');
    const add = itemCard.querySelector('#addStoreItem');
    if (eyebrow) eyebrow.textContent = 'ITEMS';
    if (heading) heading.textContent = 'รายการสินค้า';
    if (desc) desc.textContent = 'กรอก Article และจำนวนเคลม ระบบจะดึงชื่อสินค้า Barcode และราคาจาก Master อัตโนมัติ';
    if (add) add.textContent = '+ เพิ่มสินค้า';
  }

  document.querySelectorAll('#storeItemRows .v8-item-row').forEach(enhanceStoreItemRow);
}

function applyCompleteReleaseUi() {
  document.title = COMPLETE_TITLE;
  document.documentElement.dataset.claimRelease = 'complete';

  const badge = document.querySelector('#buildBadge');
  if (badge) {
    const syncBadge = () => {
      if (badge.textContent !== COMPLETE_LABEL) badge.textContent = COMPLETE_LABEL;
    };
    syncBadge();
    if (!badge.dataset.completeReleaseObserver) {
      badge.dataset.completeReleaseObserver = '1';
      new MutationObserver(syncBadge).observe(badge, { childList:true, characterData:true, subtree:true });
    }
  }

  const logout = document.querySelector('#logout');
  if (logout) {
    logout.setAttribute('aria-label', 'ออกจากระบบ');
    logout.setAttribute('title', 'ออกจากระบบ');
  }

  scrubVisibleVersionLabels(document.body);
  enhanceStoreSubmission();
}

applyCompleteReleaseUi();

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => {
    if (!app.hidden) applyCompleteReleaseUi();
  }).observe(app, { attributes:true, attributeFilter:['hidden'] });
}

new MutationObserver(records => {
  let shouldEnhanceStore = false;
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (node.nodeType === 1) {
        scrubVisibleVersionLabels(node);
        if (node.matches?.('#storeClaimForm,.v8-item-row') || node.querySelector?.('#storeClaimForm,.v8-item-row')) shouldEnhanceStore = true;
      }
    }
  }
  if (shouldEnhanceStore) enhanceStoreSubmission();
}).observe(document.body, { subtree:true, childList:true });

window.setTimeout(enhanceStoreSubmission, 250);
window.setTimeout(enhanceStoreSubmission, 900);
