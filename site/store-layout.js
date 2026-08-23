function storeLabel(selector, root=document) {
  return root.querySelector(selector)?.closest('label') || null;
}

function palletSource() {
  return document.querySelector('#storeClaimPallet');
}

function syncPalletRows(value) {
  const next = value ?? palletSource()?.value ?? '';
  document.querySelectorAll('#storeItemRows .store-row-pallet').forEach(input => {
    if (input.value !== next) input.value = next;
  });
}

function installPalletSourceSync() {
  const source = palletSource();
  if (!source || source.dataset.storeRowSync === '1') return;
  source.dataset.storeRowSync = '1';
  const sync = () => syncPalletRows(source.value);
  source.addEventListener('input', sync);
  source.addEventListener('change', sync);
}

function enhanceOptionalInformation() {
  const details = document.querySelector('.store-optional-fields');
  if (!details) return;
  details.classList.add('store-optional-system');

  const summary = details.querySelector(':scope > summary');
  if (summary) summary.textContent = 'ข้อมูลเพิ่มเติม';

  const grid = details.querySelector('.store-optional-grid');
  if (grid) grid.classList.add('store-optional-system-grid');

  const palletLabel = storeLabel('#storeClaimPallet');
  if (palletLabel) palletLabel.classList.add('store-pallet-source-hidden');

  const detailLabel = storeLabel('#storeClaimDetails');
  if (detailLabel) detailLabel.classList.add('store-optional-wide');
}

function updateItemHeader() {
  const header = document.querySelector('#storeItemRows .store-items-header');
  if (!header) return;
  const cells = [...header.children];
  if (cells[1] && cells[1].textContent !== 'Pallet No.') cells[1].textContent = 'Pallet No.';
}

function enhanceStoreRowLayout(row) {
  if (!row || row.dataset.storeLayoutReady === '1') {
    syncPalletRows();
    return;
  }
  if (row.dataset.finalStoreItem !== '1') {
    window.setTimeout(() => enhanceStoreRowLayout(row), 60);
    return;
  }

  const grid = row.querySelector('.v8-item-grid');
  const articleInput = row.querySelector('.siArticle');
  const articleLabel = articleInput?.closest('label');
  const lineNo = row.querySelector('.v8-line-no');
  const masterSummary = articleLabel?.querySelector('.store-master-summary');
  const deliveryLabel = row.querySelector('.siDelivery')?.closest('label');
  if (!grid || !articleInput || !articleLabel || !lineNo || !masterSummary || !deliveryLabel) {
    window.setTimeout(() => enhanceStoreRowLayout(row), 80);
    return;
  }

  row.dataset.storeLayoutReady = '1';
  row.classList.add('store-layout-row');

  const meta = document.createElement('div');
  meta.className = 'store-row-meta';
  row.insertBefore(meta, row.firstChild);
  meta.append(lineNo, articleLabel);

  articleLabel.querySelector('.required')?.setAttribute('aria-hidden', 'true');
  articleLabel.append(articleInput, masterSummary);
  articleInput.placeholder = 'Article';

  const palletLabel = document.createElement('label');
  palletLabel.className = 'store-grid-field store-pallet-field';
  const palletInput = document.createElement('input');
  palletInput.type = 'text';
  palletInput.className = 'store-row-pallet';
  palletInput.placeholder = 'Pallet No.';
  palletInput.autocomplete = 'off';
  palletInput.setAttribute('aria-label', 'Pallet No.');
  palletInput.setAttribute('title', 'Pallet No.');
  palletLabel.append(palletInput);
  grid.insertBefore(palletLabel, deliveryLabel);

  palletInput.value = palletSource()?.value || '';
  palletInput.addEventListener('input', () => {
    const source = palletSource();
    if (source && source.value !== palletInput.value) source.value = palletInput.value;
    syncPalletRows(palletInput.value);
  });
  palletInput.addEventListener('change', () => {
    const source = palletSource();
    if (source && source.value !== palletInput.value) source.value = palletInput.value;
    syncPalletRows(palletInput.value);
  });
}

function applyStoreLayout() {
  const form = document.querySelector('#storeClaimForm');
  if (!form) return;
  installPalletSourceSync();
  enhanceOptionalInformation();
  updateItemHeader();
  document.querySelectorAll('#storeItemRows .v8-item-row').forEach(enhanceStoreRowLayout);
  syncPalletRows();
}

applyStoreLayout();
window.setTimeout(applyStoreLayout, 150);
window.setTimeout(applyStoreLayout, 700);
window.setTimeout(applyStoreLayout, 1400);

new MutationObserver(records => {
  let relevant = false;
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('#storeClaimForm,.v8-item-row,.store-optional-fields') || node.querySelector?.('#storeClaimForm,.v8-item-row,.store-optional-fields')) {
        relevant = true;
        break;
      }
    }
    if (relevant) break;
  }
  if (relevant) window.setTimeout(applyStoreLayout, 40);
}).observe(document.body, { subtree:true, childList:true });
