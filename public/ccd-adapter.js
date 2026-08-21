/* Claim CCD compatibility layer.
 * Loaded before public/app.js. It keeps the original Claim Center business logic,
 * but aligns saved/exported data with Claim CCD.xlsm and makes dropdowns editable.
 */

const CCD_CATEGORY_META = [
  ['claims_reason', 'Claims Reason'],
  ['status', 'Status'],
  ['who', 'WHO'],
  ['cause_group', 'Cause Group'],
  ['root_cause', 'ROOT CAUSE'],
  ['check_result', 'Check'],
  ['adjust_code', 'Adjust Code'],
  ['status_sc', 'Status SC'],
  ['remark_list', 'Remark List']
];

const OPTION_FIELD_MAP = {
  reason: 'claims_reason',
  status: 'status',
  who: 'who',
  rootCause: 'root_cause',
  checkResult: 'check_result',
  sc: 'adjust_code',
  completeSc: 'status_sc'
};

const ccdState = {
  options: Object.fromEntries(CCD_CATEGORY_META.map(([key]) => [key, []])),
  optionRows: [],
  rowValues: [],
  editExtras: new Map(),
  acceptedStatusExtras: new Set(),
  acceptedWhoExtras: new Set(),
  observer: null,
  syncing: false
};

const nativeFetch = window.fetch.bind(window);
installFetchBridge();
installValidationCompatibility();
setupCcdDom();

function installFetchBridge() {
  window.fetch = async function ccdFetch(input, init = {}) {
    const url = typeof input === 'string' ? new URL(input, location.href) : new URL(input.url, location.href);
    const method = String(init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();

    if (url.pathname === '/api/claims/bulk' && method === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (Array.isArray(body.rows)) {
          const headers = new Headers(init.headers || {});
          const offset = Number(headers.get('X-Claim-Chunk-Offset') || 0);
          body.rows = body.rows.map((row, localIndex) => {
            const extra = ccdState.rowValues[offset + localIndex] || {};
            return {
              ...row,
              causeGroup: extra.causeGroup ?? row.causeGroup ?? '',
              remarkList: extra.remarkList ?? row.remarkList ?? ''
            };
          });
          init = { ...init, headers, body: JSON.stringify(body) };
        }
      } catch { /* let the application/server report malformed JSON */ }
    }

    const response = await nativeFetch(input, init);

    if ((url.pathname === '/api/auth/login' && method === 'POST') ||
        (url.pathname === '/api/auth/me' && method === 'GET')) {
      if (response.ok) queueMicrotask(() => loadOptions().catch(() => {}));
    }

    if (method === 'GET' && (url.pathname === '/api/claims' || /^\/api\/claims\/group\//.test(url.pathname)) && response.ok) {
      if (/^\/api\/claims\/group\//.test(url.pathname)) {
        ccdState.rowValues = [];
        ccdState.editExtras.clear();
      }
      captureClaimExtras(response.clone()).catch(() => {});
    }

    return response;
  };
}

function installValidationCompatibility() {
  const originalIncludes = Array.prototype.includes;
  Array.prototype.includes = function ccdIncludes(value, fromIndex) {
    if (this.length === 3 && this[0] === 'Accept' && this[1] === 'Reject' && this[2] === 'Pending') {
      const allowed = new Set(optionValues('status'));
      ccdState.acceptedStatusExtras.forEach((item) => allowed.add(item));
      if (allowed.has(value)) return true;
    }
    if (this.length === 2 && this[0] === 'DC' && this[1] === 'TP') {
      const allowed = new Set(optionValues('who'));
      ccdState.acceptedWhoExtras.forEach((item) => allowed.add(item));
      if (allowed.has(value)) return true;
    }
    return originalIncludes.call(this, value, fromIndex);
  };
}

function setupCcdDom() {
  addCcdStyles();
  addOptionsNavigation();
  addBatchFields();
  relabelExistingFields();

  document.querySelector('#applyBatchButton')?.addEventListener('click', () => {
    const causeGroup = document.querySelector('#batchCauseGroup')?.value || '';
    const remarkList = document.querySelector('#batchRemarkList')?.value || '';
    const rows = document.querySelectorAll('#editorBody tr');
    rows.forEach((_, index) => {
      ccdState.rowValues[index] = { ...(ccdState.rowValues[index] || {}), causeGroup, remarkList };
    });
    queueMicrotask(syncEditorExtras);
  });

  document.querySelector('#previewButton')?.addEventListener('click', () => {
    ccdState.rowValues = [];
    ccdState.editExtras.clear();
  }, { capture: true });

  document.querySelector('#optionsNavButton')?.addEventListener('click', () => {
    loadOptions().catch((error) => notify(error.message || 'โหลด Dropdown ไม่สำเร็จ'));
  });

  document.querySelector('#optionsGrid')?.addEventListener('click', handleOptionDelete);
  document.querySelector('#optionsGrid')?.addEventListener('submit', handleOptionAdd);

  ccdState.observer = new MutationObserver(() => syncEditorExtras());
  const editor = document.querySelector('#editorTable');
  if (editor) ccdState.observer.observe(editor, { childList: true, subtree: true });
}

function addOptionsNavigation() {
  const adminNav = document.querySelector('#adminNav');
  const nav = adminNav?.parentElement;
  if (!nav || document.querySelector('#optionsNavButton')) return;
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.view = 'options';
  button.id = 'optionsNavButton';
  button.innerHTML = '<span class="nav-icon">⌄</span><span>ตั้งค่า Dropdown</span>';
  nav.insertBefore(button, adminNav);

  const workspace = document.querySelector('.workspace');
  if (!workspace || document.querySelector('#view-options')) return;
  const section = document.createElement('section');
  section.className = 'view';
  section.id = 'view-options';
  section.dataset.title = 'ตั้งค่า Dropdown';
  section.dataset.eyebrow = 'CLAIM SETTINGS';
  section.innerHTML = `
    <div class="page-intro compact-intro">
      <div><span class="section-kicker">CLAIM CCD LIST</span><h1>ตั้งค่า Dropdown</h1>
      <p>รายการอ้างอิงจากชีต List ใน Claim CCD.xlsm ผู้ใช้งานที่เข้าสู่ระบบสามารถเพิ่มหรือลบค่าได้เอง</p></div>
      <button class="button ghost compact" id="reloadOptionsButton" type="button">↻ โหลดใหม่</button>
    </div>
    <div id="optionsGrid" class="ccd-options-grid"></div>`;
  workspace.appendChild(section);
  section.querySelector('#reloadOptionsButton')?.addEventListener('click', () => loadOptions());
}

function addBatchFields() {
  const grid = document.querySelector('.batch-grid');
  if (!grid || document.querySelector('#batchCauseGroup')) return;
  const root = document.querySelector('#batchRootCause')?.closest('label');
  const cause = document.createElement('label');
  cause.className = 'field';
  cause.innerHTML = '<span>Cause Group</span><select id="batchCauseGroup"><option value="">– เลือก –</option></select>';
  grid.insertBefore(cause, root || null);

  const remarkField = document.querySelector('#batchRemark')?.closest('label');
  const remarkList = document.createElement('label');
  remarkList.className = 'field';
  remarkList.innerHTML = '<span>Remark List</span><select id="batchRemarkList"><option value="">– เลือก –</option></select>';
  grid.insertBefore(remarkList, remarkField || null);
}

function relabelExistingFields() {
  setFieldLabel('#batchReplyDate', 'Ship Date');
  setFieldLabel('#batchSc', 'Adjust Code');
  setFieldLabel('#batchCompleteSc', 'Status SC');
}

function setFieldLabel(selector, text) {
  const label = document.querySelector(selector)?.closest('label');
  const span = label?.querySelector('span');
  if (span) span.textContent = text;
}

async function loadOptions() {
  const response = await nativeFetch('/api/options', { credentials: 'same-origin' });
  if (!response.ok) return;
  const body = await response.json();
  ccdState.optionRows = Array.isArray(body.data) ? body.data : [];
  for (const [category] of CCD_CATEGORY_META) {
    ccdState.options[category] = ccdState.optionRows.filter((row) => row.category === category);
  }
  refreshBatchOptions();
  renderOptionsManager();
  syncEditorExtras();
}

function refreshBatchOptions() {
  refreshSelect(document.querySelector('#batchReason'), optionValues('claims_reason'));
  refreshSelect(document.querySelector('#batchStatus'), optionValues('status'));
  refreshSelect(document.querySelector('#batchWho'), optionValues('who'));
  refreshSelect(document.querySelector('#batchCauseGroup'), optionValues('cause_group'));
  refreshSelect(document.querySelector('#batchRootCause'), optionValues('root_cause'));
  refreshSelect(document.querySelector('#batchCheck'), optionValues('check_result'));
  refreshSelect(document.querySelector('#batchSc'), optionValues('adjust_code'));
  refreshSelect(document.querySelector('#batchCompleteSc'), optionValues('status_sc'));
  refreshSelect(document.querySelector('#batchRemarkList'), optionValues('remark_list'));
}

function optionValues(category) {
  return (ccdState.options[category] || []).map((row) => row.value);
}

function refreshSelect(select, values, preferred) {
  if (!select) return;
  const current = preferred ?? select.value ?? '';
  const unique = [...new Set(values.filter((value) => value !== null && value !== undefined).map(String))];
  select.innerHTML = '<option value="">– เลือก –</option>';
  for (const value of unique) select.appendChild(new Option(value, value));
  if (current && !unique.includes(current)) {
    const legacy = new Option(`${current} (ค่าเดิม)`, current);
    legacy.dataset.legacy = '1';
    select.appendChild(legacy);
  }
  select.value = current;
}

function syncEditorExtras() {
  if (ccdState.syncing) return;
  ccdState.syncing = true;
  try {
    const headRow = document.querySelector('#editorHead tr');
    if (headRow && !headRow.querySelector('[data-ccd-head]')) {
      for (const label of ['Cause Group', 'Remark List']) {
        const th = document.createElement('th');
        th.dataset.ccdHead = label;
        th.textContent = label;
        headRow.appendChild(th);
      }
    }

    document.querySelectorAll('#editorHead th').forEach((th) => {
      if (th.textContent.trim() === 'SC') th.textContent = 'Adjust Code';
      if (th.textContent.trim() === 'Complet SC') th.textContent = 'Status SC';
    });

    const rows = [...document.querySelectorAll('#editorBody tr')];
    rows.forEach((tr, index) => {
      const transport = tr.querySelector('[data-field="transportNo"]')?.value || '';
      const article = tr.querySelector('[data-field="article"]')?.value || '';
      const cached = ccdState.editExtras.get(`${transport}|${article}`) || {};
      if (!ccdState.rowValues[index]) {
        ccdState.rowValues[index] = { causeGroup: cached.causeGroup || '', remarkList: cached.remarkList || '' };
      } else if ((cached.causeGroup || cached.remarkList) && !ccdState.rowValues[index]._edited) {
        ccdState.rowValues[index] = { causeGroup: cached.causeGroup || '', remarkList: cached.remarkList || '' };
      }

      refreshExistingRowOptions(tr);

      if (!tr.querySelector('[data-ccd-field="causeGroup"]')) {
        tr.appendChild(extraSelectCell(index, 'causeGroup', optionValues('cause_group'), ccdState.rowValues[index].causeGroup));
        tr.appendChild(extraSelectCell(index, 'remarkList', optionValues('remark_list'), ccdState.rowValues[index].remarkList));
      } else {
        refreshSelect(tr.querySelector('[data-ccd-field="causeGroup"]'), optionValues('cause_group'), ccdState.rowValues[index].causeGroup);
        refreshSelect(tr.querySelector('[data-ccd-field="remarkList"]'), optionValues('remark_list'), ccdState.rowValues[index].remarkList);
      }
    });

    if (rows.length && !document.querySelector('#batchCauseGroup')?.value) {
      const first = ccdState.rowValues[0] || {};
      if (first.causeGroup) document.querySelector('#batchCauseGroup').value = first.causeGroup;
      if (first.remarkList) document.querySelector('#batchRemarkList').value = first.remarkList;
    }
  } finally {
    ccdState.syncing = false;
  }
}

function refreshExistingRowOptions(tr) {
  for (const [field, category] of Object.entries(OPTION_FIELD_MAP)) {
    const select = tr.querySelector(`select[data-field="${field}"]`);
    if (select) refreshSelect(select, optionValues(category));
  }
}

function extraSelectCell(index, field, values, value) {
  const td = document.createElement('td');
  const select = document.createElement('select');
  select.dataset.ccdField = field;
  select.dataset.ccdRow = String(index);
  refreshSelect(select, values, value || '');
  select.addEventListener('change', () => {
    const rowIndex = Number(select.dataset.ccdRow);
    ccdState.rowValues[rowIndex] = { ...(ccdState.rowValues[rowIndex] || {}), [field]: select.value, _edited: true };
  });
  td.appendChild(select);
  return td;
}

async function captureClaimExtras(response) {
  const body = await response.json();
  const rows = [];
  if (Array.isArray(body?.groups)) body.groups.forEach((group) => Array.isArray(group.rows) && rows.push(...group.rows));
  if (Array.isArray(body?.data)) rows.push(...body.data);
  for (const row of rows) {
    const key = `${row.transportNo || ''}|${row.article || ''}`;
    ccdState.editExtras.set(key, { causeGroup: row.causeGroup || '', remarkList: row.remarkList || '' });
    if (row.status) ccdState.acceptedStatusExtras.add(row.status);
    if (row.who) ccdState.acceptedWhoExtras.add(row.who);
  }
  queueMicrotask(syncEditorExtras);
}

function renderOptionsManager() {
  const grid = document.querySelector('#optionsGrid');
  if (!grid) return;
  grid.innerHTML = CCD_CATEGORY_META.map(([category, label]) => {
    const rows = ccdState.options[category] || [];
    const items = rows.length ? rows.map((row) => `
      <div class="ccd-option-row">
        <span>${escapeHtml(row.value).replace(/\n/g, '<br>')}</span>
        <button type="button" class="icon-button danger-text" data-option-delete="${row.id}" data-category="${category}" title="ลบ">×</button>
      </div>`).join('') : '<p class="muted ccd-empty">ยังไม่มีรายการ</p>';
    return `<section class="panel ccd-option-card">
      <div class="panel-heading"><div><h3>${escapeHtml(label)}</h3><p>${rows.length} รายการ</p></div></div>
      <div class="ccd-option-list">${items}</div>
      <form class="ccd-option-add" data-option-form="${category}">
        <input name="value" placeholder="เพิ่ม ${escapeAttr(label)}" required>
        <button class="button secondary compact" type="submit">＋ เพิ่ม</button>
      </form>
    </section>`;
  }).join('');
}

async function handleOptionAdd(event) {
  const form = event.target.closest('[data-option-form]');
  if (!form) return;
  event.preventDefault();
  const category = form.dataset.optionForm;
  const input = form.elements.value;
  const value = input.value.trim();
  if (!value) return;
  try {
    const response = await nativeFetch('/api/options', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, value })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'เพิ่มรายการไม่สำเร็จ');
    input.value = '';
    await loadOptions();
    notify('เพิ่ม Dropdown แล้ว');
  } catch (error) { notify(error.message, true); }
}

async function handleOptionDelete(event) {
  const button = event.target.closest('[data-option-delete]');
  if (!button) return;
  const id = button.dataset.optionDelete;
  const category = button.dataset.category;
  if (!confirm('ลบรายการ Dropdown นี้ใช่หรือไม่? ข้อมูลเก่าที่เคยบันทึกจะไม่ถูกแก้ไข')) return;
  try {
    const response = await nativeFetch(`/api/options/${encodeURIComponent(category)}/${id}`, {
      method: 'DELETE', credentials: 'same-origin'
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'ลบรายการไม่สำเร็จ');
    await loadOptions();
    notify('ลบ Dropdown แล้ว');
  } catch (error) { notify(error.message, true); }
}

function notify(message, error = false) {
  const host = document.querySelector('#toastHost') || document.body;
  const el = document.createElement('div');
  el.className = `ccd-toast ${error ? 'error' : ''}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function addCcdStyles() {
  if (document.querySelector('#ccdAdapterStyles')) return;
  const style = document.createElement('style');
  style.id = 'ccdAdapterStyles';
  style.textContent = `
    .ccd-options-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px}
    .ccd-option-card{min-width:0}.ccd-option-card .panel-heading{padding-bottom:12px}
    .ccd-option-list{display:grid;gap:7px;max-height:330px;overflow:auto;padding:0 2px 10px}
    .ccd-option-row{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--line,#e3e7ef);border-radius:10px;padding:8px 10px;background:var(--surface,#fff)}
    .ccd-option-row span{min-width:0;overflow-wrap:anywhere;font-size:.88rem}.ccd-option-add{display:flex;gap:8px;margin-top:10px}
    .ccd-option-add input{min-width:0;flex:1}.ccd-empty{padding:12px 0}.ccd-toast{position:fixed;right:22px;bottom:22px;z-index:99999;background:#16213d;color:#fff;padding:11px 15px;border-radius:10px;box-shadow:0 12px 30px #0003}.ccd-toast.error{background:#8b1e2d}
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }
