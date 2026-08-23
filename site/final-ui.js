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
  const barcode = row.querySelector('.siBarcode')?.value.trim() || '';
  const product = row.querySelector('.siProduct')?.value.trim() || '';
  const barcodeEl = summary.querySelector('[data-store-barcode]');
  const descriptionEl = summary.querySelector('[data-store-description]');
  if (!barcodeEl || !descriptionEl) return;

  barcodeEl.textContent = barcode || '—';
  barcodeEl.title = barcode || '';
  if (!product) {
    descriptionEl.textContent = article ? 'กำลังตรวจสอบข้อมูลสินค้า…' : '';
    descriptionEl.removeAttribute('title');
    summary.classList.remove('ready');
    return;
  }

  descriptionEl.textContent = product;
  descriptionEl.title = product;
  summary.classList.add('ready');
}

function setStoreItemSummaryPending(row) {
  const summary = row.querySelector('.store-master-summary');
  if (!summary) return;
  const barcodeEl = summary.querySelector('[data-store-barcode]');
  const descriptionEl = summary.querySelector('[data-store-description]');
  if (barcodeEl) barcodeEl.textContent = '—';
  if (descriptionEl) descriptionEl.textContent = 'กำลังตรวจสอบข้อมูลสินค้า…';
  summary.classList.remove('ready');
}

function setCellInput(row, selector, className, ariaLabel) {
  const input = row.querySelector(selector);
  const label = labelFor(row, selector);
  if (!input || !label) return { input:null, label:null };
  label.classList.add('store-grid-field', className);
  input.setAttribute('aria-label', ariaLabel);
  input.setAttribute('title', ariaLabel);
  return { input, label };
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
    articleLabel.classList.add('store-grid-field', 'store-article-field');
    articleInput.required = true;
    articleInput.placeholder = 'Article';
    articleInput.autocomplete = 'off';
    articleInput.setAttribute('aria-label', 'Article');
    articleInput.setAttribute('title', 'Article');
  }

  if (productInput) productInput.required = false;

  ['.siProduct','.siBarcode','.siPrice','.siPrep','.siPack','.siSupplier','.siMasterStatus','.siSegment'].forEach(selector => {
    labelFor(row, selector)?.classList.add('store-master-hidden');
  });

  const delivery = setCellInput(row, '.siDelivery', 'store-delivery-field', 'Delivery Qty');
  const received = setCellInput(row, '.siReceived', 'store-received-field', 'Received Qty');
  const claim = setCellInput(row, '.siClaim', 'store-claim-field', 'Claim Qty');
  setCellInput(row, '.siReason', 'store-reason-field', 'Claims Reason');
  setCellInput(row, '.siRemark', 'store-remark-field', 'Remark');
  [delivery.input, received.input, claim.input].filter(Boolean).forEach(input => input.setAttribute('inputmode', 'decimal'));
  amount?.classList.add('store-amount-field');

  if (articleLabel && articleInput && !articleLabel.querySelector('.store-master-summary')) {
    const summary = document.createElement('span');
    summary.className = 'store-master-summary';
    summary.innerHTML = '<span data-store-barcode>—</span><span data-store-description></span>';
    articleLabel.insertBefore(summary, articleInput);
  }

  if (articleInput) {
    let timer = 0;
    articleInput.addEventListener('input', () => {
      clearTimeout(timer);
      if (articleInput.value.trim().length >= 2) {
        setStoreItemSummaryPending(row);
        timer = window.setTimeout(() => {
          articleInput.dispatchEvent(new Event('change', { bubbles:true }));
          window.setTimeout(() => refreshStoreItemSummary(row), 450);
        }, 420);
      } else refreshStoreItemSummary(row);
    });
    articleInput.addEventListener('change', () => {
      setStoreItemSummaryPending(row);
      window.setTimeout(() => refreshStoreItemSummary(row), 450);
    });
    articleInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        articleInput.blur();
        window.setTimeout(() => claim.input?.focus(), 120);
      }
    });
  }

  refreshStoreItemSummary(row);
}

function installItemsHeader(host) {
  if (!host || host.querySelector('.store-items-header')) return;
  const header = document.createElement('div');
  header.className = 'store-items-header';
  header.innerHTML = '<span>#</span><span>Article</span><span>Delivery Qty</span><span>Received Qty</span><span>Claim Qty</span><span>Claims Reason</span><span>Remark</span><span>Amount</span><span></span>';
  host.prepend(header);
}

function installBulkRowButtons(itemCard) {
  const add = itemCard?.querySelector('#addStoreItem');
  if (!add || itemCard.querySelector('#storeAddTen')) return;
  add.textContent = '+ เพิ่มแถว';
  const addTen = document.createElement('button');
  addTen.id = 'storeAddTen';
  addTen.type = 'button';
  addTen.className = 'btn ghost small';
  addTen.textContent = '+ 10 แถว';
  const actions = document.createElement('div');
  actions.className = 'store-add-actions';
  add.parentNode.insertBefore(actions, add);
  actions.append(add, addTen);
  addTen.onclick = () => {
    for (let i = 0; i < 10; i += 1) add.click();
    window.setTimeout(() => {
      const rows = [...document.querySelectorAll('#storeItemRows .v8-item-row')];
      rows.at(-10)?.querySelector('.siArticle')?.focus();
    }, 80);
  };
  const syncVisibility = () => { addTen.hidden = add.hidden; actions.hidden = add.hidden; };
  syncVisibility();
  new MutationObserver(syncVisibility).observe(add, { attributes:true, attributeFilter:['hidden'] });
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
    if (desc) desc.textContent = 'กรอกข้อมูลเคลมเพื่อส่งให้ DC ตรวจสอบ';
  }

  const transport = form.querySelector('.transport-hero');
  if (transport && !transport.classList.contains('store-transport-compact')) {
    transport.classList.add('store-transport-compact');
    const label = transport.querySelector('label');
    const input = transport.querySelector('#storeClaimTransport');
    setLeadingLabelText(label, 'Transport No. ');
    if (input) input.placeholder = 'Transport No.';
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

    labelFor(coreGrid, '#storeClaimDc')?.classList.add('store-background-hidden');

    const truckLabel = labelFor(coreGrid, '#storeClaimVehicle');
    const driverLabel = labelFor(coreGrid, '#storeClaimDriver');
    const receivedLabel = labelFor(coreGrid, '#storeClaimReceivedDate');
    if (truckLabel) {
      setLeadingLabelText(truckLabel, 'Truck No. ');
      truckLabel.classList.add('store-truck-field');
      if (receivedLabel) coreGrid.insertBefore(truckLabel, receivedLabel);
    }
    if (driverLabel) {
      setLeadingLabelText(driverLabel, 'Driver name ');
      driverLabel.classList.add('store-driver-field');
      if (receivedLabel) coreGrid.insertBefore(driverLabel, receivedLabel);
    }

    const optionalSelectors = ['#storeClaimDn','#storeClaimRoute','#storeClaimPallet','#storeClaimBasket','#storeClaimDetails'];
    const optionalLabels = optionalSelectors.map(selector => labelFor(coreGrid, selector)).filter(Boolean);
    if (optionalLabels.length) {
      const details = document.createElement('details');
      details.className = 'store-optional-fields';
      details.innerHTML = '<summary>ข้อมูลเพิ่มเติม</summary><div class="store-optional-grid"></div>';
      const optionalGrid = details.querySelector('.store-optional-grid');
      optionalLabels.forEach(label => optionalGrid.append(label));
      coreCard.append(details);
    }
  }

  const rowsHost = document.querySelector('#storeItemRows');
  const itemCard = rowsHost?.closest('article.card');
  if (itemCard) {
    const eyebrow = itemCard.querySelector('.card-head .eyebrow');
    const heading = itemCard.querySelector('.card-head h3');
    const desc = itemCard.querySelector('.card-head p');
    if (eyebrow) eyebrow.textContent = 'ITEMS';
    if (heading) heading.textContent = 'รายการสินค้า';
    if (desc) desc.textContent = '1 Article ต่อ 1 แถว · ข้อมูลสินค้าดึงจาก Master อัตโนมัติ';
    installBulkRowButtons(itemCard);
  }

  installItemsHeader(rowsHost);
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
      new MutationObserver(syncBadge).observe(badge, { childList:true, characterData:true,subtree:true });
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
