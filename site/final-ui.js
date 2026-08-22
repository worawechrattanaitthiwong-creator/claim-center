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
}

applyCompleteReleaseUi();

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => {
    if (!app.hidden) applyCompleteReleaseUi();
  }).observe(app, { attributes:true, attributeFilter:['hidden'] });
}

new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (node.nodeType === 1) scrubVisibleVersionLabels(node);
    }
  }
}).observe(document.body, { subtree:true, childList:true });
