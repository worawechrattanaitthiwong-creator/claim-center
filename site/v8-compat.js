const Compat = {
  prepared: null,
  options: {},
  user: null,
  saving: false,
  syncing: false
};

const q = (s, r=document) => r.querySelector(s);
const qa = (s, r=document) => [...r.querySelectorAll(s)];
const priorFetch = window.fetch.bind(window);

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function flash(title, message='', kind='') {
  const host = q('#toastHost');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `<b>${escHtml(title)}</b>${message ? `<div>${escHtml(message)}</div>` : ''}`;
  host.append(node);
  setTimeout(() => node.remove(), 4200);
}

function setBusy(on, title='กำลังประมวลผล', text='กรุณารอสักครู่') {
  const el = q('#busy');
  if (!el) return;
  if (on) {
    if (q('#busyTitle')) q('#busyTitle').textContent = title;
    if (q('#busyText')) q('#busyText').textContent = text;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

async function jsonFetch(path, opt={}) {
  const init = { method: opt.method || 'GET', headers: { ...(opt.headers || {}) } };
  if (opt.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opt.body);
  }
  const response = await priorFetch(path, init);
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const err = new Error(data.message || `HTTP ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Keep the existing app, but remember the prepared Claim payload so the main Claim page
// can save with the original one-decision-for-the-whole-claim workflow.
window.fetch = async (input, init={}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const response = await priorFetch(input, init);
  if (url.includes('/api/claims/prepare') && response.ok) {
    response.clone().json().then(data => {
      if (data?.status === 'success' && data?.draftToken && Array.isArray(data?.rows)) {
        Compat.prepared = {
          draftToken: data.draftToken,
          claimNo: data.claimNo || '',
          rows: data.rows
        };
        updateLegacySummary();
      }
    }).catch(()=>{});
  }
  return response;
};

function optionValues(category) {
  return (Compat.options[category] || []).filter(x => x && x.value).map(x => String(x.value));
}

function setSelectOptions(el, category, fallback=[], defaultValue='') {
  if (!el) return;
  const old = el.value;
  const values = optionValues(category);
  const list = values.length ? values : fallback;
  el.innerHTML = '<option value="">— เลือก —</option>' + list.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
  if (old && list.includes(old)) el.value = old;
  else if (defaultValue && list.includes(defaultValue)) el.value = defaultValue;
}

function syncVisibleDropdowns() {
  setSelectOptions(q('#globalReason'), 'claims_reason');
  setSelectOptions(q('#globalStatus'), 'status', ['Accept','Pending','Reject'], 'Pending');
  setSelectOptions(q('#globalWho'), 'who', ['DC','TP','QC'], 'DC');
  setSelectOptions(q('#globalCause'), 'cause_group');
  setSelectOptions(q('#globalRoot'), 'root_cause');
  setSelectOptions(q('#legacyCheck'), 'check_result');
  setSelectOptions(q('#legacyRemarkList'), 'remark_list');
  setSelectOptions(q('#legacySc'), 'adjust_code');
  setSelectOptions(q('#legacyCompleteSc'), 'status_sc');

  qa('#decisionRows .statusSel').forEach(el => setSelectOptions(el, 'status', ['Accept','Pending','Reject'], 'Pending'));
  qa('#decisionRows .whoSel').forEach(el => setSelectOptions(el, 'who', ['DC','TP','QC'], 'DC'));

  const subject = q('#storeClaimSubject');
  if (subject) {
    const old = subject.value;
    const category = optionValues('store_topic').length ? 'store_topic' : 'claims_reason';
    setSelectOptions(subject, category);
    if (old && optionValues(category).includes(old)) subject.value = old;
  }
  qa('.siReason').forEach(el => setSelectOptions(el, 'claims_reason'));

  setSelectOptions(q('#dReason'), 'claims_reason');
  setSelectOptions(q('#dCause'), 'cause_group');
  setSelectOptions(q('#dRoot'), 'root_cause');
  setSelectOptions(q('#dCheck'), 'check_result');
  setSelectOptions(q('#dRemarkList'), 'remark_list');
}

async function loadUnifiedOptions(showError=false) {
  if (Compat.syncing) return;
  Compat.syncing = true;
  try {
    const data = await jsonFetch('/api/options');
    Compat.options = data.data || {};
    syncVisibleDropdowns();
  } catch (e) {
    if (showError) flash('Dropdown', e.message, 'error');
  } finally {
    Compat.syncing = false;
  }
}

function installLegacyClaimWorkspace() {
  const page = q('#page-workbench');
  const bulk = q('#bulkDecision');
  const grid = q('#bulkDecision .form-grid');
  if (!page || !bulk || !grid || page.dataset.compatLegacy === '1') return;
  page.dataset.compatLegacy = '1';
  page.dataset.title = 'Claim Workspace';
  page.dataset.eyebrow = 'CREATE · REVIEW · DECIDE · SAVE';

  const intro = q('.page-intro', page);
  if (intro) {
    const eyebrow = q('.eyebrow', intro);
    const h1 = q('h1', intro);
    const p = q('p', intro);
    if (eyebrow) eyebrow.textContent = 'CCD CLAIM WORKFLOW';
    if (h1) h1.textContent = 'สร้างและตรวจเคลมด้วย Logic เดิม';
    if (p) p.textContent = 'วางข้อมูล → ตรวจ Master → เลือก Decision ชุดเดียว → บันทึกทุกสินค้า โดยระบบใหม่ Store/DC ยังทำงานต่อครบ';
  }

  const apply = q('#applyAll');
  if (apply) apply.hidden = true;
  const bulkHead = q('#bulkDecision .card-head h3');
  if (bulkHead) bulkHead.textContent = 'Decision สำหรับทั้ง Claim';

  grid.insertAdjacentHTML('beforeend', `
    <label>Check<select id="legacyCheck"></select></label>
    <label>Remark List<select id="legacyRemarkList"></select></label>
    <label>SC<select id="legacySc"></select></label>
    <label>Complet SC<select id="legacyCompleteSc"></select></label>
    <label class="span-2">Remark<textarea id="legacyRemark" rows="3" placeholder="รายละเอียดเพิ่มเติม…"></textarea></label>
  `);

  const itemHead = q('#itemDecision .card-head h3');
  if (itemHead) itemHead.textContent = 'รายการสินค้าที่จะบันทึก';
  const summary = q('#decisionSummary');
  if (summary) summary.textContent = 'Decision ด้านบนจะใช้กับสินค้าทุกรายการ';
  const saveBarSmall = q('#itemDecision .save-bar small');
  if (saveBarSmall) saveBarSmall.textContent = 'คงข้อมูลรายการสินค้าและ Master check แบบระบบใหม่ แต่ใช้ Decision รวมแบบระบบเดิม';

  if (!q('#compat-style')) {
    const style = document.createElement('style');
    style.id = 'compat-style';
    style.textContent = `
      #itemDecision table th:nth-child(5),#itemDecision table th:nth-child(6),#itemDecision table th:nth-child(7),#itemDecision table th:nth-child(8),
      #itemDecision table td:nth-child(5),#itemDecision table td:nth-child(6),#itemDecision table td:nth-child(7),#itemDecision table td:nth-child(8){display:none!important}
      #bulkDecision .form-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
      #bulkDecision .span-2{grid-column:span 5}
      .compat-dropdown-note{margin:0 0 14px;padding:12px 14px;border:1px solid var(--border,#d7dce5);border-radius:12px;background:var(--soft,#f6f8fb);font-size:13px}
      @media(max-width:1100px){#bulkDecision .form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#bulkDecision .span-2{grid-column:span 2}}
      @media(max-width:700px){#bulkDecision .form-grid{grid-template-columns:1fr}#bulkDecision .span-2{grid-column:auto}}
    `;
    document.head.append(style);
  }

  const rows = q('#decisionRows');
  if (rows) new MutationObserver(() => {
    syncVisibleDropdowns();
    updateLegacySummary();
  }).observe(rows, { childList:true, subtree:true });

  const detail = q('#detailFields');
  if (detail) new MutationObserver(() => syncVisibleDropdowns()).observe(detail, { childList:true, subtree:true });

  const storeItems = q('#storeItemRows');
  if (storeItems) new MutationObserver(() => syncVisibleDropdowns()).observe(storeItems, { childList:true, subtree:true });

  loadUnifiedOptions();
}

function updateLegacySummary() {
  const count = Compat.prepared?.rows?.length || 0;
  const summary = q('#decisionSummary');
  if (summary && count) summary.textContent = `พร้อมบันทึก ${count} รายการ · ใช้ Decision ด้านบนกับทั้ง Claim`;
}

function readLegacyDecision() {
  return {
    shipDate: q('#globalShip')?.value || '',
    reason: q('#globalReason')?.value || '',
    status: q('#globalStatus')?.value || '',
    who: q('#globalWho')?.value || '',
    causeGroup: q('#globalCause')?.value || '',
    rootCause: q('#globalRoot')?.value || '',
    checkResult: q('#legacyCheck')?.value || '',
    remarkList: q('#legacyRemarkList')?.value || '',
    sc: q('#legacySc')?.value || '',
    completeSc: q('#legacyCompleteSc')?.value || '',
    remark: q('#legacyRemark')?.value || ''
  };
}

async function saveLegacyClaim(confirmDuplicate=false) {
  if (Compat.saving) return;
  const prepared = Compat.prepared;
  if (!prepared?.draftToken || !prepared?.rows?.length) {
    flash('ยังไม่มีข้อมูลพร้อมบันทึก', 'กรุณาตรวจ Master ก่อน', 'error');
    return;
  }
  const decision = readLegacyDecision();
  if (!decision.status) return flash('กรุณาเลือก Status', '', 'error');
  if (!decision.who) return flash('กรุณาเลือก WHO', '', 'error');

  Compat.saving = true;
  setBusy(true, 'กำลังบันทึก Claim', 'ใช้ Decision ชุดเดียวกับสินค้าทุกรายการ');
  try {
    const rows = prepared.rows.map(row => ({
      ...row,
      decision: { ...decision, referenceNo: '' }
    }));
    const data = await jsonFetch('/api/claims/save', {
      method: 'POST',
      body: {
        draftToken: prepared.draftToken,
        rows,
        global: decision,
        decisions: rows.map(() => ({ ...decision, referenceNo: '' })),
        confirmDuplicate
      }
    });
    sessionStorage.setItem('claimCenterCompatFlash', `บันทึก ${data.claimNo || prepared.claimNo} สำเร็จ · ${rows.length} รายการ`);
    Compat.prepared = null;
    location.reload();
  } catch (e) {
    if (e.status === 409 && e.data?.requiresConfirmation && !confirmDuplicate) {
      Compat.saving = false;
      setBusy(false);
      if (confirm(e.message + '\nยืนยันบันทึกซ้ำหรือไม่?')) return saveLegacyClaim(true);
      return;
    }
    flash('บันทึกไม่สำเร็จ', e.message, 'error');
  } finally {
    Compat.saving = false;
    setBusy(false);
  }
}

function installSaveOverride() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('#saveClaim');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    saveLegacyClaim(false);
  }, true);
}

function installReliableLogin() {
  const form = q('#loginForm');
  if (!form || form.dataset.compatLogin === '1') return;
  form.dataset.compatLogin = '1';
  form.addEventListener('submit', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const username = q('#loginUsername')?.value?.trim() || '';
    const password = q('#loginPassword')?.value || '';
    if (!username || !password) return flash('เข้าสู่ระบบ', 'กรอก Username และ Password', 'error');
    setBusy(true, 'กำลังเข้าสู่ระบบ', 'กำลังตรวจสอบบัญชี');
    try {
      await jsonFetch('/api/auth/login', { method:'POST', body:{ username, password } });
      await jsonFetch('/api/auth/me');
      sessionStorage.setItem('claimCenterCompatFlash', 'เข้าสู่ระบบสำเร็จ');
      location.reload();
    } catch (e2) {
      flash('เข้าสู่ระบบไม่สำเร็จ', e2.message, 'error');
    } finally {
      setBusy(false);
    }
  }, true);
}

function rebrandDecisionMaster() {
  const nav = q('#v8NavDropdown');
  if (nav) nav.innerHTML = '<span>⌄</span>Decision Master';
  const page = q('#page-dropdowns');
  if (page) {
    page.dataset.title = 'Decision Master';
    page.dataset.eyebrow = 'DROPDOWN GOVERNANCE';
    const h1 = q('h1', page);
    const p = q('.page-intro p', page);
    if (h1) h1.textContent = 'จัดการ Dropdown ที่ใช้ทั้งระบบ';
    if (p) p.textContent = 'เพิ่ม แก้ไข ปิดใช้งาน หรือลบตัวเลือกจากจุดเดียว แล้ว Claim Workspace, Store และหน้ารายละเอียดจะใช้ชุดเดียวกัน';
    const card = q('.card', page);
    if (card && !q('.compat-dropdown-note', card)) {
      card.insertAdjacentHTML('afterbegin', '<div class="compat-dropdown-note"><b>เชื่อมทั้งระบบ:</b> Claims Reason · Status · WHO · Cause Group · ROOT CAUSE · Check · Remark List · SC · Complet SC · หัวข้อ Store</div>');
    }
  }

  const addForm = q('#v8OptionAdd');
  if (addForm && addForm.dataset.compatSync !== '1') {
    addForm.dataset.compatSync = '1';
    addForm.addEventListener('submit', () => setTimeout(() => loadUnifiedOptions(true), 500));
  }
  const rows = q('#v8OptionRows');
  if (rows && rows.dataset.compatSync !== '1') {
    rows.dataset.compatSync = '1';
    rows.addEventListener('click', () => setTimeout(() => loadUnifiedOptions(true), 500));
    new MutationObserver(() => setTimeout(() => loadUnifiedOptions(), 50)).observe(rows, { childList:true, subtree:true });
  }
}

async function identifyUserAndKeepAccess() {
  try {
    const data = await jsonFetch('/api/auth/me');
    Compat.user = data.user || null;
    const type = Compat.user?.userType || Compat.user?.user_type || '';
    const role = Compat.user?.role || '';
    const canDropdown = role === 'admin' || type === 'admin' || type === 'dc';
    const nav = q('#v8NavDropdown');
    if (nav) nav.hidden = !canDropdown;
  } catch {}
}

function restoreFlash() {
  const message = sessionStorage.getItem('claimCenterCompatFlash');
  if (!message) return;
  sessionStorage.removeItem('claimCenterCompatFlash');
  setTimeout(() => flash('Claim Center', message, 'success'), 300);
}

function bootCompat() {
  installReliableLogin();
  installLegacyClaimWorkspace();
  installSaveOverride();
  rebrandDecisionMaster();
  identifyUserAndKeepAccess();
  loadUnifiedOptions();
  restoreFlash();

  // V8 adds some controls after its own boot. Re-apply only the compatibility labels/sync,
  // without replacing the new Store/DC features.
  setTimeout(() => { rebrandDecisionMaster(); syncVisibleDropdowns(); identifyUserAndKeepAccess(); }, 500);
  setTimeout(() => { rebrandDecisionMaster(); syncVisibleDropdowns(); }, 1500);
}

bootCompat();
