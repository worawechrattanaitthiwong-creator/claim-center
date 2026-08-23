function claimLabel(selector) {
  return document.querySelector(selector)?.closest('label') || null;
}

function arrangeStoreIdentity() {
  const form = document.querySelector('#storeClaimForm');
  const hero = form?.querySelector('.store-transport-compact');
  if (!form || !hero) return;

  let grid = hero.querySelector('.store-identity-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'store-identity-grid';
    hero.insertBefore(grid, hero.firstChild);
  }

  const transportLabel = claimLabel('#storeClaimTransport');
  const storeCodeLabel = claimLabel('#storeClaimStore');
  const storeNameLabel = claimLabel('#v8StoreName');

  if (transportLabel) {
    transportLabel.classList.add('store-identity-transport');
    if (transportLabel.parentElement !== grid) grid.append(transportLabel);
  }
  if (storeCodeLabel) {
    storeCodeLabel.classList.add('store-identity-code');
    if (storeCodeLabel.parentElement !== grid) grid.append(storeCodeLabel);
  }
  if (storeNameLabel) {
    storeNameLabel.classList.add('store-identity-name');
    if (storeNameLabel.parentElement !== grid) grid.append(storeNameLabel);
  }
}

arrangeStoreIdentity();
window.setTimeout(arrangeStoreIdentity, 120);
window.setTimeout(arrangeStoreIdentity, 600);
window.setTimeout(arrangeStoreIdentity, 1200);

new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.matches?.('#storeClaimForm,.store-transport-compact') || node.querySelector?.('#storeClaimForm,.store-transport-compact')) {
        window.setTimeout(arrangeStoreIdentity, 30);
        return;
      }
    }
  }
}).observe(document.body, { subtree:true, childList:true });
