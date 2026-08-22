const V8 = {
  user: null,
  options: {},
  optionRows: [],
  editingCase: null,
  activeCase: null,
  registryClaim: null,
  bootedFor: '',
  productCache: new Map(),
  masterTimer: null,
  storeMaster: null
};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

const baseFetch = window.fetch.bind(window);
window.fetch = async (input, init={}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (url.includes('/api/claims/save') && init?.body && sessionStorage.getItem('claimCenterStoreCaseId')) {
    try {
      const body = JSON.parse(init.body);
      body.storeCaseId = sessionStorage.getItem('claimCenterStoreCaseId');
      init = { ...init, body: JSON.stringify(body) };
    } catch {}
  }
  const response = await baseFetch(input, init);
  if (url.includes('/api/claims/save') && response.ok) {
    response.clone().json().then(d => {
      if (d?.status === 'success') sessionStorage.removeItem('claimCenterStoreCaseId');
    }).catch(()=>{});
  }
  return response;
};

async function api(path, opt={}) {
  const init = { method: opt.method || 'GET', headers: { ...(opt.headers || {}) } };
  if (opt.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opt.body);
  }
  const r = await baseFetch(path, init);
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(d.message || `HTTP ${r.status}`);
    e.status = r.status;
    e.data = d;
    throw e;
  }
  return d;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function statusBadge(s) {
  return `<span class="status ${esc(String(s||'').toUpperCase())}">${esc(statusThai(s))}</span>`;
}
function statusThai(s) {
  const map = {
    SUBMITTED:'รอ DC ตรวจ', UNDER_REVIEW:'กำลังตรวจ', PENDING:'รอตรวจเพิ่ม', ACCEPT:'รับเคลม',
    REJECT:'ไม่รับเคลม', PARTIAL:'รับบางรายการ', DISPUTED:'โต้แย้ง', CLOSED:'ปิดเคส',
    RETURNED_TO_STORE:'ส่งกลับ Store แก้ไข'
  };
  return map[String(s||'').toUpperCase()] || s || '—';
}
function toast(title, msg='', kind='') {
  const host = $('#toastHost');
  if (!host) return;
  const n = document.createElement('div');
  n.className = `toast ${kind}`;
  n.innerHTML = `<b>${esc(title)}</b>${msg ? `<div>${esc(msg)}</div>` : ''}`;
  host.append(n);
  setTimeout(() => n.remove(), 4200);
}
function busy(on, title='กำลังประมวลผล', text='กรุณารอสักครู่') {
  const el = $('#busy');
  if (!el) return;
  if (on) {
    $('#busyTitle').textContent = title;
    $('#busyText').textContent = text;
    el.hidden = false;
  } else el.hidden = true;
}
function selectOptions(category, selected='', includeEmpty=true) {
  const rows = V8.options[category] || [];
  return `${includeEmpty ? '<option value="">— เลือก —</option>' : ''}${rows.map(x => `<option value="${esc(x.value)}" ${x.value===selected?'selected':''}>${esc(x.value)}</option>`).join('')}`;
}
function isAdmin() { return V8.user?.role === 'admin' || V8.user?.userType === 'admin'; }
function isStore() { return V8.user?.userType === 'store'; }
function isDc() { return V8.user?.userType === 'dc'; }
function isTrainer() { return V8.user?.userType === 'trainer'; }
function canReview() { return isAdmin() || isDc(); }
function canEditDropdown() { return isAdmin() || isDc(); }

function installCorporateUi() {
  const build = $('#buildBadge');
  if (build) build.textContent = 'Online';
  const loginBuild = $('#loginBuild');
  if (loginBuild) {
    const syncLoginBuild = () => {
      const current = loginBuild.textContent || '';
      if (/ไม่สามารถ/.test(current)) return;
      if (current !== 'พร้อมใช้งาน') loginBuild.textContent = 'พร้อมใช้งาน';
    };
    const obs = new MutationObserver(syncLoginBuild);
    obs.observe(loginBuild, { childList:true, characterData:true, subtree:true });
    setTimeout(syncLoginBuild, 300);
  }
  const preview = $('#exportPreview');
  if (preview) {
    const scrubPreview = () => {
      const before = preview.textContent || '';
      const after = before.replace(/\s*·\s*43 columns/gi, '');
      if (after !== before) preview.textContent = after;
    };
    new MutationObserver(scrubPreview).observe(preview, { childList:true, characterData:true, subtree:true });
  }
  const storeSwitch = $('#portalSwitch [data-mode="store"]');
  if (storeSwitch) storeSwitch.textContent = 'Store Data';
  installStoreForm();
  installExtraNavigation();
  installRegistryDialog();
  installQueueTransportFilter();
  installCorporateTextGuard();
  installObservers();
}

function installQueueTransportFilter() {
  const page = $('#page-queue');
  const intro = $('#page-queue .page-intro');
  if (!page || !intro || $('#v8QueueFilter')) return;
  intro.insertAdjacentHTML('afterend', `
    <form id="v8QueueFilter" class="filter-card v8-transport-filter">
      <label><span>ค้นหาด้วย Transport</span><input id="v8QueueTransport" autocomplete="off" placeholder="Transport No."></label>
      <button class="btn primary" type="submit">ค้นหา Ticket</button>
      <button id="v8QueueClear" class="btn ghost" type="button">ล้างการค้นหา</button>
    </form>`);
  $('#v8QueueFilter').addEventListener('submit', e => { e.preventDefault(); renderQueueV8(); });
  $('#v8QueueClear').onclick = () => { $('#v8QueueTransport').value=''; renderQueueV8(); };
}

function installCorporateTextGuard() {
  const clean = root => {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT','STYLE','CODE','PRE'].includes(parent.tagName)) continue;
      const before = node.nodeValue || '';
      const after = before
        .replace(/A:AQ\s*43\s*(?:columns|คอลัมน์)/gi,'โครงสร้างข้อมูลมาตรฐาน')
        .replace(/43\s*(?:columns|คอลัมน์)(?:\s*A:AQ)?/gi,'โครงสร้างข้อมูลมาตรฐาน')
        .replace(/D1\s*Connected/gi,'ระบบพร้อมใช้งาน')
        .replace(/\bCollaboration\s+V7\b/gi,'')
        .replace(/\bStore\/DC\s+Workflow\s+V8\b/gi,'');
      if (after !== before) node.nodeValue = after;
    }
  };
  clean(document.body);
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') clean(r.target.parentElement || document.body);
      for (const n of r.addedNodes || []) if (n.nodeType === 1) clean(n);
    }
  }).observe(document.body, {subtree:true,childList:true,characterData:true});
}

function installStoreForm() {
  const page = $('#page-store-new');
  if (!page || page.dataset.v8Ready) return;
  page.dataset.v8Ready = '1';
  page.innerHTML = `
    <div class="page-intro">
      <div><span class="eyebrow">STORE SUBMISSION</span><h1 id="v8StoreFormTitle">แจ้งเคลมให้ DC ตรวจสอบ</h1>
      <p>กรอกครั้งเดียว ระบบดึงชื่อสินค้า ราคา และข้อมูลสาขาจาก Master เพื่อให้ DC รับข้อมูลไปตรวจต่อได้ทันที</p></div>
      <button id="v8CancelStoreEdit" class="btn ghost" type="button" hidden>ยกเลิกการแก้ไข</button>
    </div>
    <form id="storeClaimForm" class="v8-store-form">
      <article class="transport-hero">
        <label>Transport No. <span class="required">*</span>
          <input id="storeClaimTransport" class="transport-input" autocomplete="off" placeholder="เลข Transport ที่ใช้คุยร่วมกัน" required>
        </label>
        <div><span>Ticket Key</span><strong>1 Transport = 1 Ticket</strong><small>จำนวนสินค้าแสดงเป็นข้อมูลประกอบ</small></div>
      </article>

      <article class="card">
        <div class="card-head"><div><span class="eyebrow">STORE & DELIVERY</span><h3>ข้อมูลสาขาและการรับสินค้า</h3></div><span id="v8StoreMasterBadge" class="chip">รอข้อมูล Store</span></div>
        <div class="form-grid v8-four">
          <label>Store Code<input id="storeClaimStore" autocomplete="off" placeholder="Store Code" required></label>
          <label>Store Name<input id="v8StoreName" readonly placeholder="ดึงจาก Master Store"></label>
          <label>วันที่รับสินค้า <span class="required">*</span><input id="storeClaimReceivedDate" type="date" required></label>
          <label>วันที่แจ้งเคลม <span class="required">*</span><input id="storeClaimDate" type="date" required></label>
          <label>Claim DC<input id="storeClaimDc" placeholder="ผู้รับผิดชอบ / DC"></label>
          <label>Truck No.<input id="storeClaimVehicle" placeholder="ทะเบียน / Truck No."></label>
          <label>Driver name<input id="storeClaimDriver" placeholder="ชื่อพนักงานขับรถ"></label>
          <label>DN No.<input id="storeClaimDn" placeholder="DN No."></label>
          <label>Route<input id="storeClaimRoute" placeholder="Route"></label>
          <label>Pallet No.<input id="storeClaimPallet" placeholder="Pallet No."></label>
          <label>Tote / Basket No.<input id="storeClaimBasket" placeholder="Tote / Basket No."></label>
          <label>หัวข้อการเคลม <span class="required">*</span><select id="storeClaimSubject" required></select></label>
          <label class="span-2">รายละเอียดเพิ่มเติม<textarea id="storeClaimDetails" rows="3" placeholder="รายละเอียดที่ช่วยให้ DC ตรวจสอบได้ถูกต้อง"></textarea></label>
        </div>
        <div id="v8StoreMasterDetails" class="v8-master-strip" hidden></div>
      </article>

      <article class="card">
        <div class="card-head">
          <div><span class="eyebrow">ITEMS · MASTER CONNECTED</span><h3>รายการสินค้า</h3><p class="muted">ไม่จำเป็นต้องจำ Article — ค้นด้วยชื่อสินค้า/Barcode แล้วระบบจะเติม Article และราคาให้จาก Master</p></div>
          <button id="addStoreItem" type="button" class="btn ghost small">+ เพิ่มรายการ</button>
        </div>
        <datalist id="v8ProductList"></datalist>
        <div id="storeItemRows" class="v8-store-items"></div>
        <div class="v8-total"><span>มูลค่าเคลมโดยประมาณ</span><strong id="v8StoreTotal">฿0.00</strong></div>
      </article>

      <div class="v8-form-actions">
        <button id="v8ResetStore" class="btn ghost" type="button">ล้างข้อมูล</button>
        <button id="v8StoreSubmit" class="btn primary" type="submit">ส่ง Ticket ให้ DC</button>
      </div>
    </form>`;

  $('#storeClaimDate').value = today();
  $('#storeClaimReceivedDate').value = today();
  $('#addStoreItem').onclick = () => addStoreItemV8();
  $('#v8ResetStore').onclick = () => resetStoreForm();
  $('#v8CancelStoreEdit').onclick = () => resetStoreForm();
  $('#storeClaimForm').addEventListener('submit', submitStoreV8);
  $('#storeClaimStore').addEventListener('change', loadStoreMasterInfo);
  $('#storeClaimStore').addEventListener('blur', loadStoreMasterInfo);
  addStoreItemV8();
}

function installExtraNavigation() {
  const ops = $('#opsNav'), store = $('#storeNav'), content = $('.content');
  if (!ops || !store || !content || $('#v8NavDropdown')) return;

  const control = $$('#opsNav small').find(x => x.textContent.trim()==='CONTROL');
  const dropdownBtn = document.createElement('button');
  dropdownBtn.id = 'v8NavDropdown';
  dropdownBtn.className = 'nav v8-dc-admin';
  dropdownBtn.dataset.v8Page = 'dropdowns';
  dropdownBtn.innerHTML = '<span>⌄</span>Dropdown Settings';
  const backupOps = document.createElement('button');
  backupOps.id = 'v8NavBackupOps';
  backupOps.className = 'nav v8-backup-ops';
  backupOps.dataset.v8Page = 'backup';
  backupOps.innerHTML = '<span>⇄</span>Backup & Restore';
  const dataControl = document.createElement('button');
  dataControl.id = 'v8NavDataControl';
  dataControl.className = 'nav v8-admin-only';
  dataControl.dataset.v8Page = 'data-control';
  dataControl.innerHTML = '<span>⚙</span>Data Control';

  if (control) {
    control.insertAdjacentElement('afterend', dropdownBtn);
    dropdownBtn.insertAdjacentElement('afterend', backupOps);
    backupOps.insertAdjacentElement('afterend', dataControl);
  } else {
    ops.append(dropdownBtn, backupOps, dataControl);
  }

  const backupStore = document.createElement('button');
  backupStore.id = 'v8NavBackupStore';
  backupStore.className = 'nav v8-store-backup';
  backupStore.dataset.v8Page = 'backup';
  backupStore.innerHTML = '<span>⇄</span>Backup & Restore';
  store.append(backupStore);

  content.insertAdjacentHTML('beforeend', `
    <section id="page-dropdowns" class="page v8-page" data-title="Dropdown Settings" data-eyebrow="OPERATION OPTIONS">
      <div class="page-intro"><div><span class="eyebrow">DROPDOWN MANAGEMENT</span><h1>จัดการตัวเลือกที่ใช้ในระบบ</h1>
      <p>DC และ Admin เพิ่ม แก้ไข ปิดใช้งาน หรือลบหัวข้อได้เอง โดย Store จะเห็นเฉพาะตัวเลือกที่ Active</p></div><button id="v8RefreshOptions" class="btn ghost">↻ Refresh</button></div>
      <article class="card">
        <form id="v8OptionAdd" class="filter-card">
          <select id="v8OptionCategory"></select><input id="v8OptionValue" placeholder="ชื่อหัวข้อ / ตัวเลือก" required>
          <input id="v8OptionOrder" type="number" value="999" placeholder="ลำดับ"><button class="btn primary">+ เพิ่มตัวเลือก</button>
        </form>
        <div class="table-wrap"><table><thead><tr><th>หมวด</th><th>ตัวเลือก</th><th>ลำดับ</th><th>สถานะ</th><th></th></tr></thead><tbody id="v8OptionRows"></tbody></table></div>
      </article>
    </section>

    <section id="page-backup" class="page v8-page" data-title="Backup & Restore" data-eyebrow="DATA RECOVERY">
      <div class="page-intro"><div><span class="eyebrow">BACKUP & RESTORE</span><h1>สำรองข้อมูลตามสิทธิ์ของคุณ</h1>
      <p id="v8BackupScope">ระบบจะสำรองเฉพาะข้อมูลที่บัญชีนี้มีสิทธิ์ดูแล</p></div></div>
      <div class="grid two">
        <article class="card v8-backup-card"><span class="eyebrow">BACKUP</span><h3>ดาวน์โหลดข้อมูล</h3><p>เก็บไฟล์ JSON ไว้สำหรับกู้คืนเมื่อจำเป็น</p><button id="v8BackupDownload" class="btn primary">ดาวน์โหลด Backup</button></article>
        <article class="card v8-backup-card"><span class="eyebrow">RESTORE</span><h3>กู้คืนข้อมูล</h3><p>ระบบตรวจสอบสิทธิ์ก่อนคืนข้อมูล และไม่เขียนทับงานที่อยู่ระหว่างตรวจโดย Store</p><input id="v8BackupFile" type="file" accept=".json,application/json"><button id="v8BackupRestore" class="btn ghost">Restore จากไฟล์</button></article>
      </div>
      <article class="card"><b>หลักการกู้คืน</b><p id="v8BackupNote" class="muted">Store กู้คืน Ticket ของสาขาตัวเอง ส่วน DC กู้คืนข้อมูลที่ตนบันทึกหรือแก้ไข</p></article>
    </section>

    <section id="page-data-control" class="page v8-page" data-title="Data Control" data-eyebrow="ADMINISTRATOR">
      <div class="page-intro"><div><span class="eyebrow">ADMIN DATA CONTROL</span><h1>ลบข้อมูลเป็นหมวด หรือทั้งหมด</h1>
      <p>ใช้เฉพาะเมื่อจำเป็น บัญชีผู้ใช้และ Audit Log จะไม่ถูกลบ</p></div></div>
      <article class="card danger-zone">
        <div class="v8-purge-grid">
          <label><input type="checkbox" name="v8Purge" value="store_submissions"> ข้อมูลที่ Store ส่งแจ้ง + Claim ที่มาจาก Store</label>
          <label><input type="checkbox" name="v8Purge" value="dc_claims"> ข้อมูล Claim ที่ DC บันทึก</label>
          <label><input type="checkbox" name="v8Purge" value="master_store"> Master Store</label>
          <label><input type="checkbox" name="v8Purge" value="master_article"> Master Article</label>
          <label><input type="checkbox" name="v8Purge" value="dropdowns"> Dropdown Options</label>
          <label class="v8-all"><input type="checkbox" name="v8Purge" value="all_business"> ข้อมูลธุรกิจทั้งหมด</label>
        </div>
        <label>ยืนยันการลบ<input id="v8PurgeConfirm" placeholder="พิมพ์ DELETE หรือ DELETE ALL"></label>
        <button id="v8PurgeBtn" class="btn danger">ลบข้อมูลที่เลือก</button>
        <div id="v8PurgeResult" class="muted"></div>
      </article>
    </section>
  `);

  $$('[data-v8-page]').forEach(btn => btn.addEventListener('click', e => {
    e.preventDefault();
    showV8Page(btn.dataset.v8Page);
  }));

  $('#v8RefreshOptions').onclick = loadOptionsEditor;
  $('#v8OptionAdd').addEventListener('submit', addOptionV8);
  $('#v8OptionRows').addEventListener('click', optionTableAction);
  $('#v8BackupDownload').onclick = downloadBackup;
  $('#v8BackupRestore').onclick = restoreBackup;
  $('#v8PurgeBtn').onclick = purgeData;
}

function installRegistryDialog() {
  if ($('#v8RegistryDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="v8RegistryDialog" class="v8-wide-dialog">
      <div class="dialog-head"><div><span class="eyebrow">CLAIM REGISTRY</span><h3 id="v8RegistryTitle">Claim</h3></div><button id="v8RegistryClose" class="icon-btn">×</button></div>
      <div id="v8RegistryBody"></div>
    </dialog>`);
  $('#v8RegistryClose').onclick = () => $('#v8RegistryDialog').close();
  $('#v8RegistryBody').addEventListener('click', registryDialogAction);
}

function installObservers() {
  const app = $('#app');
  if (app) {
    new MutationObserver(() => { if (!app.hidden) bootUser(); }).observe(app, { attributes:true, attributeFilter:['hidden'] });
    if (!app.hidden) bootUser();
  }

  $$('.page').forEach(page => {
    new MutationObserver(() => {
      if (page.classList.contains('active')) onPageActive(page.id.replace('page-',''));
    }).observe(page, { attributes:true, attributeFilter:['class'] });
  });

  const switcher = $('#portalSwitch');
  if (switcher) switcher.addEventListener('click', () => setTimeout(applyRoleUi, 0));

  const registryForm = $('#registryFilter');
  if (registryForm) registryForm.addEventListener('submit', e => {
    if (!V8.user) return;
    e.preventDefault(); e.stopImmediatePropagation();
    renderRegistryV8();
  }, true);

  bindOverrideButton('#refreshQueue', renderQueueV8);
  bindOverrideButton('#refreshStoreCases', renderStoreCasesV8);
}

function bindOverrideButton(selector, fn) {
  const el = $(selector);
  if (!el) return;
  el.addEventListener('click', e => {
    if (!V8.user) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fn();
  }, true);
}

async function bootUser() {
  try {
    const m = await api('/api/v8/me');
    V8.user = m.user;
    if (V8.bootedFor !== m.user.username) {
      V8.bootedFor = m.user.username;
      await refreshOptions();
      applyRoleUi();
      if (isStore()) {
        $('#storeClaimStore').value = V8.user.storeCode;
        $('#storeClaimStore').readOnly = true;
        await loadStoreMasterInfo();
      } else {
        $('#storeClaimStore').readOnly = false;
      }
    }
    const active = $('.page.active');
    if (active) onPageActive(active.id.replace('page-',''));
  } catch {}
}

function applyRoleUi() {
  if (!V8.user) return;
  const storeNewNav = $('#storeNav [data-page="store-new"]');
  if (storeNewNav) storeNewNav.hidden = !(isStore() || isAdmin());

  $('#v8NavDropdown').hidden = !canEditDropdown();
  $('#v8NavDataControl').hidden = !isAdmin();
  $('#v8NavBackupOps').hidden = !(isDc() || isAdmin());
  $('#v8NavBackupStore').hidden = !isStore();

  if (isTrainer()) {
    const work = $('#opsNav [data-page="workbench"]');
    if (work) work.hidden = true;
  }

  const switchStore = $('#portalSwitch [data-mode="store"]');
  if (switchStore && !isStore()) {
    switchStore.textContent = isAdmin() ? 'Store Admin' : 'Store Data · Read only';
    switchStore.title = isAdmin() ? 'จัดการข้อมูล Store' : 'ดูข้อมูล Store เท่านั้น ไม่สามารถส่งหรือแก้ไขแทน Store ได้';
  }

  const submit = $('#v8StoreSubmit');
  if (submit) submit.hidden = !(isStore() || isAdmin());
  const add = $('#addStoreItem');
  if (add) add.hidden = !(isStore() || isAdmin());

  const scope = $('#v8BackupScope');
  if (scope) {
    if (isStore()) scope.textContent = `Backup สำหรับ Store ${V8.user.storeCode} เท่านั้น`;
    else if (isAdmin()) scope.textContent = 'Admin Backup ครอบคลุม Store, Claim และ Master ที่ระบบอนุญาตให้กู้คืน';
    else scope.textContent = `Backup ข้อมูล DC ที่เกี่ยวข้องกับ ${V8.user.displayName || V8.user.username}`;
  }
}

async function refreshOptions() {
  try {
    const r = await api('/api/v8/options?all=1');
    V8.optionRows = Array.isArray(r.data) ? r.data : [];
    V8.options = r.grouped || {};
    const topic = $('#storeClaimSubject');
    if (topic) topic.innerHTML = (V8.options.store_topic||[]).length ? selectOptions('store_topic') : selectOptions('claims_reason');
    $$('.siReason').forEach(s => {
      const val = s.value;
      s.innerHTML = selectOptions('claims_reason', val);
    });
  } catch (e) {
    toast('Dropdown', e.message, 'error');
  }
}

function addStoreItemV8(v={}) {
  const host = $('#storeItemRows');
  if (!host) return;
  const row = document.createElement('article');
  row.className = 'v8-item-row';
  row.innerHTML = `
    <div class="v8-item-head"><span class="v8-line-no">รายการ</span><button type="button" class="icon-btn siRemove" title="ลบรายการ">×</button></div>
    <div class="v8-item-grid">
      <label>Article <small>ไม่บังคับ</small><input class="siArticle" value="${esc(v.article||'')}" placeholder="เว้นได้ ถ้าเลือกชื่อสินค้าจาก Master"></label>
      <label class="v8-product-field">ชื่อสินค้า <span class="required">*</span><input class="siProduct" list="v8ProductList" value="${esc(v.description||v.productName||'')}" placeholder="พิมพ์ชื่อสินค้า / Barcode / Article"></label>
      <label>Barcode<input class="siBarcode" value="${esc(v.barcode||'')}" placeholder="Barcode"></label>
      <label>ราคา / หน่วย<input class="siPrice" value="${esc(v.skuCost??v.master?.sku_cost??'')}" readonly placeholder="จาก Master"></label>
      <label>หน่วยเตรียม<input class="siPrep" value="${esc(v.prepUnit||v.master?.prep_unit||'')}" readonly placeholder="จาก Master"></label>
      <label>Pack Size<input class="siPack" value="${esc(v.packSize||v.master?.pack_size||'')}" readonly placeholder="จาก Master"></label>
      <label class="span-2">Supplier<input class="siSupplier" value="${esc(v.supplierName||v.master?.supplier_name||'')}" readonly placeholder="จาก Master"></label>
      <label>Master Status<input class="siMasterStatus" value="${esc(v.masterStatus||v.master?.master_status||'')}" readonly></label>
      <label>Segment<input class="siSegment" value="${esc(v.segment||v.master?.segment||v.segDescription||'')}" readonly></label>
      <label>Delivery Qty<input class="siDelivery" type="number" step="0.001" value="${esc(v.deliveryQty??'')}"></label>
      <label>Received Qty<input class="siReceived" type="number" step="0.001" value="${esc(v.receivedQty??'')}"></label>
      <label>Claim Qty <span class="required">*</span><input class="siClaim" type="number" step="0.001" min="0" value="${esc(v.claimQty??v.qty??1)}" required></label>
      <label>Claims Reason<select class="siReason">${selectOptions('claims_reason', v.claimsReason||v.reason||'')}</select></label>
      <label class="span-2">Remark<input class="siRemark" value="${esc(v.remark||'')}" placeholder="รายละเอียดรายการ"></label>
      <div class="v8-item-amount"><span>Amount</span><b class="siAmount">฿${money.format(Number(v.amount||0))}</b></div>
    </div>`;
  row._v8Matches = [];
  $('.siRemove', row).onclick = () => { row.remove(); renumberItems(); updateStoreTotal(); };
  $('.siArticle', row).addEventListener('change', () => resolveMasterForRow(row, 'article'));
  $('.siBarcode', row).addEventListener('change', () => resolveMasterForRow(row, 'barcode'));
  $('.siProduct', row).addEventListener('input', () => searchMasterForRow(row));
  $('.siProduct', row).addEventListener('change', () => resolveMasterForRow(row, 'description'));
  $('.siClaim', row).addEventListener('input', () => updateItemAmount(row));
  host.append(row);
  renumberItems();
  if (v.description && v.skuCost !== undefined) updateItemAmount(row);
}

function renumberItems() {
  $$('.v8-item-row').forEach((r,i) => $('.v8-line-no', r).textContent = `รายการ ${i+1}`);
}
function updateItemAmount(row) {
  const price = Number($('.siPrice',row).value || 0);
  const qty = Number($('.siClaim',row).value || 0);
  $('.siAmount',row).textContent = '฿' + money.format(price * qty);
  updateStoreTotal();
}
function updateStoreTotal() {
  const total = $$('.v8-item-row').reduce((s,row) => s + Number($('.siPrice',row).value||0) * Number($('.siClaim',row).value||0), 0);
  if ($('#v8StoreTotal')) $('#v8StoreTotal').textContent = '฿' + money.format(total);
}
function searchMasterForRow(row) {
  clearTimeout(V8.masterTimer);
  V8.masterTimer = setTimeout(async () => {
    const q = $('.siProduct',row).value.trim();
    if (q.length < 2) return;
    try {
      const r = await api('/api/v8/master/articles?q=' + encodeURIComponent(q));
      row._v8Matches = r.data || [];
      const list = $('#v8ProductList');
      if (list) list.innerHTML = row._v8Matches.map(x => `<option value="${esc(x.description)}">${esc(x.article)} · ฿${money.format(x.sku_cost||0)} · ${esc(x.prep_unit||'')} ${esc(x.supplier_name||'')}</option>`).join('');
    } catch {}
  }, 220);
}
async function resolveMasterForRow(row, mode) {
  const q = mode === 'article' ? $('.siArticle',row).value.trim() : mode === 'barcode' ? $('.siBarcode',row).value.trim() : $('.siProduct',row).value.trim();
  if (!q) return;
  try {
    const r = await api('/api/v8/master/articles?q=' + encodeURIComponent(q));
    const data = r.data || [];
    row._v8Matches = data;
    let hit = data.find(x => mode==='article' ? String(x.article)===q : mode==='barcode' ? String(x.barcode)===q : String(x.description).toLowerCase()===q.toLowerCase());
    if (!hit && data.length === 1) hit = data[0];
    if (hit) {
      $('.siArticle',row).value = hit.article || '';
      $('.siBarcode',row).value = hit.barcode || '';
      $('.siProduct',row).value = hit.description || '';
      $('.siPrice',row).value = Number(hit.sku_cost||0).toFixed(2);
      $('.siPrep',row).value = hit.prep_unit || '';
      $('.siPack',row).value = hit.pack_size || '';
      $('.siSupplier',row).value = hit.supplier_name || '';
      $('.siMasterStatus',row).value = hit.master_status || '';
      $('.siSegment',row).value = hit.segment || hit.seg_description || '';
      row.dataset.master = '1';
      row._v8Master = hit;
      updateItemAmount(row);
    }
  } catch (e) {
    toast('Master Article', e.message, 'error');
  }
}

async function loadStoreMasterInfo() {
  const code = $('#storeClaimStore')?.value.trim();
  if (!code || !V8.user) return;
  try {
    const r = await api('/api/v8/store/info?store=' + encodeURIComponent(code));
    const m = r.data || {};
    V8.storeMaster = m;
    $('#v8StoreName').value = m.thai_name || m.store_name || m.english_name || '';
    const badge = $('#v8StoreMasterBadge');
    if (badge) badge.textContent = `${m.lanes || m.format_type || 'Store'} · ${m.store_type || 'Master verified'}`;
    const detail = $('#v8StoreMasterDetails');
    if (detail) {
      const pairs = [
        ['สถานะสาขา',m.store_status],['Region',m.region],['Zone',m.zone_th],['Sub zone',m.sub_zone],
        ['Lanes',m.lanes||m.format_type],['Via Hub',m.via_hub_location_id],['Max truck',m.max_truck_type],['เช็ค 100%',m.check_100]
      ].filter(x=>x[1]);
      detail.innerHTML = pairs.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
      detail.hidden = !pairs.length;
    }
  } catch (e) {
    V8.storeMaster = null;
    $('#v8StoreName').value = '';
    if ($('#v8StoreMasterBadge')) $('#v8StoreMasterBadge').textContent = 'ไม่พบใน Master Store';
    if ($('#v8StoreMasterDetails')) { $('#v8StoreMasterDetails').hidden = true; $('#v8StoreMasterDetails').innerHTML=''; }
  }
}

function collectStorePayload() {
  const items = $$('.v8-item-row').map(row => ({
    article: $('.siArticle',row).value,
    productName: $('.siProduct',row).value,
    description: $('.siProduct',row).value,
    barcode: $('.siBarcode',row).value,
    skuCost: $('.siPrice',row).value,
    deliveryQty: $('.siDelivery',row).value,
    receivedQty: $('.siReceived',row).value,
    claimQty: $('.siClaim',row).value,
    claimsReason: $('.siReason',row).value,
    remark: $('.siRemark',row).value,
    prepUnit: $('.siPrep',row).value, packSize: $('.siPack',row).value, supplierName: $('.siSupplier',row).value,
    masterStatus: $('.siMasterStatus',row).value, segment: $('.siSegment',row).value
  })).filter(x => x.article || x.productName || x.barcode);
  return {
    storeCode: $('#storeClaimStore').value,
    transportNo: $('#storeClaimTransport').value,
    receivedDate: $('#storeClaimReceivedDate').value,
    claimDate: $('#storeClaimDate').value,
    claimDc: $('#storeClaimDc').value,
    vehicleNo: $('#storeClaimVehicle').value,
    driver: $('#storeClaimDriver').value,
    dnNo: $('#storeClaimDn').value,
    route: $('#storeClaimRoute').value,
    palletNo: $('#storeClaimPallet').value,
    basketNo: $('#storeClaimBasket').value,
    subject: $('#storeClaimSubject').value,
    details: $('#storeClaimDetails').value,
    items
  };
}

async function submitStoreV8(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!(isStore() || isAdmin())) return toast('Read only', 'บัญชีนี้ดูข้อมูล Store ได้อย่างเดียว', 'error');
  const payload = collectStorePayload();
  if (V8.editingCase) payload.version = V8.editingCase.version;
  busy(true, V8.editingCase ? 'กำลังบันทึกการแก้ไข Ticket' : 'กำลังส่ง Ticket ให้ DC', 'ตรวจสอบข้อมูลกับ Master');
  try {
    const path = V8.editingCase ? `/api/v8/store/cases/${V8.editingCase.id}` : '/api/v8/store/cases';
    const r = await api(path, { method: V8.editingCase ? 'PATCH' : 'POST', body: payload });
    const c = r.data || r;
    toast(V8.editingCase ? 'แก้ไข Ticket แล้ว' : 'ส่ง Ticket แล้ว', `${c.case_no||c.caseNo||''} · Transport ${c.transport_no||c.transportNo||payload.transportNo}`, 'success');
    resetStoreForm();
    showExistingPage('store-cases');
    setTimeout(renderStoreCasesV8, 100);
  } catch (err) {
    toast('บันทึกไม่สำเร็จ', err.message, 'error');
  } finally { busy(false); }
}

function resetStoreForm() {
  V8.editingCase = null;
  const form = $('#storeClaimForm');
  if (!form) return;
  form.reset();
  $('#storeClaimDate').value = today();
  $('#storeClaimReceivedDate').value = today();
  $('#storeItemRows').innerHTML = '';
  addStoreItemV8();
  $('#v8StoreFormTitle').textContent = 'แจ้งเคลมให้ DC ตรวจสอบ';
  $('#v8StoreSubmit').textContent = 'ส่ง Ticket ให้ DC';
  $('#v8CancelStoreEdit').hidden = true;
  V8.storeMaster = null;
  if ($('#v8StoreMasterDetails')) { $('#v8StoreMasterDetails').hidden=true; $('#v8StoreMasterDetails').innerHTML=''; }
  if (isStore()) {
    $('#storeClaimStore').value = V8.user.storeCode;
    $('#storeClaimStore').readOnly = true;
    loadStoreMasterInfo();
  } else $('#storeClaimStore').readOnly = false;
  updateStoreTotal();
}

function showV8Page(name) {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${name}`));
  $$('.nav').forEach(n => n.classList.toggle('active', n.dataset.v8Page === name));
  const p = $(`#page-${name}`);
  if ($('#pageTitle')) $('#pageTitle').textContent = p?.dataset.title || name;
  if ($('#pageEyebrow')) $('#pageEyebrow').textContent = p?.dataset.eyebrow || '';
  onPageActive(name);
}
function showExistingPage(name) {
  const btn = $(`.nav[data-page="${name}"]`);
  if (btn && !btn.hidden) btn.click();
  else {
    $$('.page').forEach(p => p.classList.toggle('active', p.id===`page-${name}`));
    onPageActive(name);
  }
}
function onPageActive(name) {
  if (!V8.user) return;
  if (name === 'queue') setTimeout(renderQueueV8, 80);
  if (name === 'registry') setTimeout(renderRegistryV8, 80);
  if (name === 'store-cases') setTimeout(renderStoreCasesV8, 80);
  if (name === 'store-home') setTimeout(renderStoreHomeV8, 80);
  if (name === 'store-new') {
    refreshOptions();
    if (isStore()) loadStoreMasterInfo();
  }
  if (name === 'dropdowns') loadOptionsEditor();
}

async function renderQueueV8() {
  if (!V8.user || isStore()) return;
  try {
    const transport = $('#v8QueueTransport')?.value?.trim() || '';
    const r = await api('/api/v8/dc/queue' + (transport ? `?transport=${encodeURIComponent(transport)}` : ''));
    if ($('#queueBadge')) $('#queueBadge').textContent = (r.summary.submitted||0) + (r.summary.disputed||0);
    const stats = $('#queueStats');
    if (stats) stats.innerHTML = [
      ['Tickets', r.summary.tickets, 'นับ Transport เป็นหลัก'],
      ['รอ DC ตรวจ', r.summary.submitted, 'Ticket ใหม่'],
      ['กำลังตรวจ', r.summary.working, 'Under Review / Pending'],
      ['Items', r.summary.items, 'จำนวนรายการประกอบ']
    ].map(x => `<article><span>${x[0]}</span><b>${x[1]||0}</b><small>${x[2]}</small></article>`).join('');
    const host = $('#queueList');
    if (host) host.innerHTML = (r.data||[]).map(ticketCard).join('') || '<div class="card muted">ไม่มี Ticket จาก Store</div>';
  } catch (e) { toast('Store Queue', e.message, 'error'); }
}

function ticketCard(c) {
  return `<article class="case-card v8-case-card" data-v8-case="${c.id}">
    <div class="v8-ticket-main">
      <span class="eyebrow">TRANSPORT / TICKET</span>
      <div class="v8-transport">${esc(c.transport_no||'—')}</div>
      <div class="v8-ticket-sub"><b>${esc(c.case_no)}</b><span>Store ${esc(c.store_code)} ${esc(c.store_name||'')}</span></div>
    </div>
    <div class="v8-ticket-facts">
      <div><span>สินค้า</span><b>${Number(c.item_count||0)} รายการ</b></div>
      <div><span>มูลค่า</span><b>฿${money.format(c.amount||0)}</b></div>
      <div><span>วันที่แจ้ง</span><b>${esc(c.claim_date||c.ship_date||'—')}</b></div>
    </div>
    <div class="v8-ticket-status">${statusBadge(c.status)}${c.correction_note?`<small>${esc(c.correction_note)}</small>`:''}</div>
    <button class="btn ghost small">เปิด Ticket →</button>
  </article>`;
}

async function renderStoreCasesV8() {
  if (!V8.user) return;
  try {
    const r = await api('/api/v8/store/cases');
    const host = $('#storeCaseList');
    if (host) host.innerHTML = (r.data||[]).map(ticketCard).join('') || '<div class="card muted">ยังไม่มี Ticket</div>';
  } catch (e) { toast('Store cases', e.message, 'error'); }
}
async function renderStoreHomeV8() {
  if (!V8.user) return;
  try {
    const [s,c] = await Promise.all([api('/api/v8/store/summary'), api('/api/v8/store/cases')]);
    const x = s.data || {};
    if ($('#storeWelcome')) $('#storeWelcome').textContent = isStore() ? `Store ${V8.user.storeCode} · Ticket ตาม Transport` : 'Store View · Read Only';
    const cards = $('#storeSummaryCards');
    if (cards) cards.innerHTML = [
      ['Tickets',x.tickets],['Items',x.items],['มูลค่า','฿'+money.format(x.amount||0)],['ส่งกลับแก้',x.returned]
    ].map(v => `<article><span>${v[0]}</span><strong>${v[1]||0}</strong></article>`).join('');
    const recent = $('#storeRecent');
    if (recent) recent.innerHTML = (c.data||[]).slice(0,8).map(ticketCard).join('') || '<div class="muted">ยังไม่มี Ticket</div>';
  } catch (e) { toast('Store View', e.message, 'error'); }
}

document.addEventListener('click', e => {
  const card = e.target.closest('[data-v8-case]');
  if (card) {
    e.preventDefault(); e.stopImmediatePropagation();
    openCaseV8(Number(card.dataset.v8Case));
  }
}, true);

async function openCaseV8(id) {
  busy(true, 'กำลังเปิด Ticket');
  try {
    const [c,m] = await Promise.all([
      api(`/api/v8/store/cases/${id}`),
      api(`/api/v7/store/cases/${id}/messages`).catch(()=>({data:[]}))
    ]);
    V8.activeCase = c.data;
    renderCaseV8(c.data, m.data||[]);
    $('#caseDialog').showModal();
  } catch (e) { toast('เปิด Ticket ไม่ได้', e.message, 'error'); }
  finally { busy(false); }
}

function renderCaseV8(c, messages=[]) {
  const editableStore = (isStore() && ['SUBMITTED','RETURNED_TO_STORE'].includes(c.status)) || isAdmin();
  const review = canReview();
  const masterStore = c.masterStore || {};
  $('#caseTitle').textContent = `Transport ${c.transport_no} · ${c.case_no}`;
  const rows = c.items || [];
  const storeMasterFacts = [
    ['Store type',masterStore.store_type],['สถานะสาขา',masterStore.store_status],['Region',masterStore.region],['Zone',masterStore.zone_th],
    ['Sub zone',masterStore.sub_zone],['Lanes',masterStore.lanes||masterStore.format_type],['Via Hub',masterStore.via_hub_location_id],
    ['Max truck',masterStore.max_truck_type],['เช็ค 100%',masterStore.check_100]
  ].filter(x=>x[1]);
  $('#caseContent').innerHTML = `
    <div class="v8-dialog-transport"><span>TRANSPORT / TICKET</span><strong>${esc(c.transport_no)}</strong><div>${statusBadge(c.status)}</div></div>
    <div class="v8-review-note"><b>Ticket นี้ส่งเข้าหน้า Claim ได้โดยตรง</b><span>DC ไม่ต้องคัดลอกจาก Excel — ข้อมูล Store, Transport, วันที่ และรายการสินค้าถูกเชื่อมต่อไว้แล้ว</span></div>
    ${c.status==='RETURNED_TO_STORE' ? `<div class="v8-return-note"><b>DC ส่งกลับให้แก้ไข</b><p>${esc(c.correction_note||'')}</p></div>` : ''}
    <div class="v8-detail-grid">
      ${detail('Store', `${c.store_code} ${c.store_name||masterStore.thai_name||''}`)}
      ${detail('วันที่รับสินค้า', c.received_date||'—')}
      ${detail('วันที่แจ้งเคลม', c.claim_date||c.ship_date||'—')}
      ${detail('Claim DC', c.claim_dc||'—')}
      ${detail('Truck No.', c.vehicle_no||'—')}
      ${detail('Driver', c.driver||'—')}
      ${detail('DN No.', c.dn_no||'—')}
      ${detail('Route', c.route||'—')}
      ${detail('Pallet No.', c.pallet_no||'—')}
      ${detail('Tote / Basket', c.basket_no||'—')}
      ${detail('หัวข้อ', c.subject||'—')}
      ${detail('จำนวนสินค้า', `${rows.length} รายการ`)}
      ${detail('มูลค่า', '฿'+money.format(c.amount||0))}
      ${detail('ผู้รับผิดชอบ', c.assigned_to||'—')}
    </div>
    ${storeMasterFacts.length ? `<section class="v8-master-review"><div class="eyebrow">MASTER STORE</div><div class="v8-master-strip">${storeMasterFacts.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></section>` : ''}
    <div class="v8-details-text"><b>รายละเอียดจาก Store</b><p>${esc(c.details||'—')}</p></div>
    <div class="table-wrap v8-review-table"><table>
      <thead><tr><th>#</th><th>Master</th><th>Article</th><th>Barcode</th><th>Description</th><th>Unit</th><th>Pack</th><th>Supplier</th><th>Segment</th><th>Weight</th><th>Delivery</th><th>Received</th><th>Claim</th><th>Reason</th><th>SKU Cost</th><th>Amount</th><th>Remark</th></tr></thead>
      <tbody>${rows.map((i,n)=>{const m=i.master||{};return `<tr>
        <td>${n+1}</td><td><span class="chip ${m.master_matched===false?'danger':''}">${m?'Master OK':'ตรวจ Master'}</span></td>
        <td><b>${esc(i.article||'—')}</b></td><td>${esc(i.barcode||'—')}</td><td>${esc(i.description||'')}</td>
        <td>${esc(m.prep_unit||i.prepUnit||'—')}</td><td>${esc(m.pack_size||i.packSize||'—')}</td><td>${esc(m.supplier_name||i.supplierName||'—')}</td>
        <td>${esc(m.segment||m.seg_description||i.segDescription||'—')}</td><td>${esc(m.manage_weight||i.manageWeight||'—')}</td>
        <td>${esc(i.deliveryQty||'')}</td><td>${esc(i.receivedQty||'')}</td><td><b>${esc(i.claimQty||'')}</b></td><td>${esc(i.claimsReason||'—')}</td>
        <td>฿${money.format(i.skuCost||m.sku_cost||0)}</td><td>฿${money.format(i.amount||0)}</td><td>${esc(i.remark||'')}</td></tr>`}).join('')}</tbody>
    </table></div>
    <div class="v8-case-actions">
      ${editableStore ? '<button class="btn ghost" data-v8-edit-case>แก้ไขข้อมูล</button><button class="btn danger ghost" data-v8-delete-case>ลบ Ticket</button>' : ''}
      ${review ? `<button class="btn primary" data-v8-process>นำ Ticket เข้า Claim Workspace</button>
        <select id="v8CaseStatus"><option>UNDER_REVIEW</option><option>PENDING</option><option>ACCEPT</option><option>REJECT</option><option>PARTIAL</option><option>CLOSED</option></select>
        <button class="btn ghost" data-v8-status>อัปเดตสถานะ</button>` : ''}
    </div>
    ${review ? `<div class="v8-return-box"><label>ส่งกลับ Store แก้ไข<textarea id="v8ReturnReason" rows="2" placeholder="ระบุข้อมูลที่ผิดหรือสิ่งที่ต้องแก้ให้ชัดเจน"></textarea></label><button class="btn warning" data-v8-return>ส่งกลับ Store พร้อมอัปเดตสถานะ</button></div>` : ''}
    <div class="chat">
      <div class="messages">${messages.map(x=>`<div class="msg ${x.sender_username===V8.user.username?'mine':''}"><b>${esc(x.sender_name||x.sender_username)} · ${esc(x.sender_side)}</b><p>${esc(x.message)}</p><small>${esc(x.created_at)}</small></div>`).join('')}</div>
      ${!isTrainer() ? '<form id="v8ChatForm" class="chat-compose"><input id="v8ChatText" placeholder="พิมพ์ข้อความติดตาม Ticket…"><button class="btn primary">ส่ง</button></form>' : '<div class="muted">Trainer: ดูข้อมูลและการสนทนาได้อย่างเดียว</div>'}
    </div>`;
}

function detail(k,v) { return `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`; }

$('#caseContent')?.addEventListener('click', async e => {
  const c = V8.activeCase;
  if (!c) return;
  if (e.target.matches('[data-v8-edit-case]')) {
    $('#caseDialog').close();
    editStoreCaseV8(c);
  } else if (e.target.matches('[data-v8-delete-case]')) {
    if (!confirm(`ลบ Ticket Transport ${c.transport_no} หรือไม่?`)) return;
    try {
      await api(`/api/v8/store/cases/${c.id}`, {method:'DELETE'});
      $('#caseDialog').close();
      toast('ลบ Ticket แล้ว', c.transport_no, 'success');
      if (isStore()) renderStoreCasesV8(); else renderQueueV8();
    } catch (err) { toast('ลบไม่ได้', err.message, 'error'); }
  } else if (e.target.matches('[data-v8-return]')) {
    const reason = $('#v8ReturnReason').value.trim();
    if (!reason) return toast('ส่งกลับ Store', 'กรุณาระบุสิ่งที่ต้องแก้ไข', 'error');
    try {
      const r = await api(`/api/v8/store/cases/${c.id}/return`, {method:'POST', body:{reason,version:c.version}});
      V8.activeCase = r.data;
      renderCaseV8(r.data, []);
      toast('ส่งกลับ Store แล้ว', reason, 'success');
      renderQueueV8();
    } catch (err) { toast('ส่งกลับไม่สำเร็จ', err.message, 'error'); }
  } else if (e.target.matches('[data-v8-status]')) {
    try {
      const r = await api(`/api/v8/store/cases/${c.id}/status`, {method:'POST', body:{status:$('#v8CaseStatus').value,version:c.version}});
      V8.activeCase = r.data;
      renderCaseV8(r.data, []);
      toast('อัปเดตสถานะแล้ว', statusThai(r.data.status), 'success');
      renderQueueV8();
    } catch (err) { toast('อัปเดตสถานะไม่ได้', err.message, 'error'); }
  } else if (e.target.matches('[data-v8-process]')) {
    processStoreCase(c);
  }
});

$('#caseContent')?.addEventListener('submit', async e => {
  if (e.target.id !== 'v8ChatForm') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const msg = $('#v8ChatText').value.trim();
  if (!msg) return;
  try {
    const r = await api(`/api/v7/store/cases/${V8.activeCase.id}/messages`, {method:'POST',body:{message:msg}});
    renderCaseV8(V8.activeCase, r.data||[]);
  } catch (err) { toast('ส่งข้อความไม่ได้', err.message, 'error'); }
}, true);

function editStoreCaseV8(c) {
  V8.editingCase = c;
  const switchStore = $('#portalSwitch [data-mode="store"]');
  if (!isStore() && switchStore) switchStore.click();
  setTimeout(() => {
    showExistingPage('store-new');
    $('#v8StoreFormTitle').textContent = `แก้ไข Ticket · Transport ${c.transport_no}`;
    $('#v8StoreSubmit').textContent = 'บันทึกการแก้ไข';
    $('#v8CancelStoreEdit').hidden = false;
    $('#storeClaimStore').value = c.store_code;
    $('#storeClaimStore').readOnly = isStore();
    $('#storeClaimTransport').value = c.transport_no||'';
    $('#storeClaimReceivedDate').value = c.received_date||'';
    $('#storeClaimDate').value = c.claim_date||c.ship_date||'';
    $('#storeClaimDc').value = c.claim_dc||'';
    $('#storeClaimVehicle').value = c.vehicle_no||'';
    $('#storeClaimDriver').value = c.driver||'';
    $('#storeClaimDn').value = c.dn_no||'';
    $('#storeClaimRoute').value = c.route||'';
    $('#storeClaimPallet').value = c.pallet_no||'';
    $('#storeClaimBasket').value = c.basket_no||'';
    $('#storeClaimSubject').value = c.subject||'';
    $('#storeClaimDetails').value = c.details||'';
    $('#storeItemRows').innerHTML = '';
    (c.items||[]).forEach(addStoreItemV8);
    if (!(c.items||[]).length) addStoreItemV8();
    loadStoreMasterInfo();
    updateStoreTotal();
  }, 80);
}

function processStoreCase(c) {
  if (!canReview()) return;
  sessionStorage.setItem('claimCenterStoreCaseId', String(c.id));
  const rows = (c.items||[]).map(i => [
    c.store_code,c.store_name,c.claim_dc,c.received_date,c.claim_date||c.ship_date,c.transport_no,c.vehicle_no,c.driver,c.dn_no,c.route,c.pallet_no,c.basket_no,
    i.article,i.barcode,i.description,i.deliveryQty,i.receivedQty,i.claimQty
  ]);
  const text = rows.map(r => r.map(v => String(v??'')).join('\t')).join('\n');
  $('#caseDialog').close();
  const ops = $('#portalSwitch [data-mode="ops"]');
  if (ops) ops.click();
  setTimeout(() => {
    showExistingPage('workbench');
    const paste = $('#claimPaste');
    paste.value = text;
    paste.dispatchEvent(new Event('input', {bubbles:true}));
    toast('โหลดข้อมูลจาก Store แล้ว', `Transport ${c.transport_no} · ${rows.length} รายการ`, 'success');
    setTimeout(() => $('#prepareBtn')?.click(), 100);
  }, 80);
}

async function renderRegistryV8() {
  if (!V8.user) return;
  try {
    const params = new URLSearchParams({
      claim: $('#regClaim')?.value||'',
      transport: $('#regTransport')?.value||'',
      store: $('#regStore')?.value||'',
      status: $('#regStatus')?.value||''
    });
    const r = await api('/api/v8/registry?' + params);
    const host = $('#registryList');
    if (!host) return;
    host.innerHTML = (r.data||[]).map(g => `<article class="case-card v8-reg-card" data-v8-claim="${esc(g.claim_no)}">
      <div class="v8-ticket-main"><span class="eyebrow">TRANSPORT</span><div class="v8-transport small">${esc(g.transport_no||'—')}</div>
      <div class="v8-ticket-sub"><b>${esc(g.claim_no)}</b><span>Store ${esc(g.store_code)} ${esc(g.store_name||'')}</span></div></div>
      <div class="v8-ticket-facts"><div><span>Items</span><b>${g.item_count}</b></div><div><span>Amount</span><b>฿${money.format(g.total_amount||0)}</b></div><div><span>Status</span><b>${esc(g.statuses||'—')}</b></div></div>
      <button class="btn ghost small">${isAdmin()?'ดู / แก้ไข':'ดูรายละเอียด'} →</button>
    </article>`).join('') || '<div class="card muted">ไม่พบข้อมูล</div>';
  } catch (e) { toast('Claim Registry', e.message, 'error'); }
}

document.addEventListener('click', e => {
  const card = e.target.closest('[data-v8-claim]');
  if (!card) return;
  e.preventDefault(); e.stopImmediatePropagation();
  openRegistryClaim(card.dataset.v8Claim);
}, true);

async function openRegistryClaim(claimNo) {
  busy(true, 'กำลังเปิด Claim');
  try {
    const r = await api('/api/v8/registry/' + encodeURIComponent(claimNo));
    V8.registryClaim = r;
    renderRegistryDialog(r);
    $('#v8RegistryDialog').showModal();
  } catch (e) { toast('Claim Registry', e.message, 'error'); }
  finally { busy(false); }
}

function renderRegistryDialog(r) {
  const rows = r.rows || [], manage = r.canManage;
  const first = rows[0] || {};
  $('#v8RegistryTitle').textContent = `${r.claimNo} · Transport ${first.transport_no||'—'}`;
  $('#v8RegistryBody').innerHTML = `
    <div class="v8-dialog-transport"><span>TRANSPORT</span><strong>${esc(first.transport_no||'—')}</strong><div>Store ${esc(first.store_code||'')} ${esc(first.store_name||'')}</div></div>
    <div class="v8-review-note"><b>ประวัติ Claim</b><span>${manage?'Admin สามารถแก้ไขหรือลบข้อมูลเดิมได้':'ข้อมูลหน้านี้เป็น Read only'}</span></div>
    <div class="table-wrap v8-reg-edit"><table>
      <thead><tr><th>#</th><th>Store</th><th>Store Name</th><th>Transport</th><th>รับสินค้า</th><th>แจ้งเคลม</th><th>Ship Date</th><th>Claim DC</th><th>Article</th><th>Barcode</th><th>Description</th><th>Delivery</th><th>Received</th><th>Claim</th><th>SKU Cost</th><th>Amount</th><th>Reason</th><th>Status</th><th>WHO</th><th>Cause</th><th>ROOT CAUSE</th><th>Check</th><th>Remark List</th><th>SC</th><th>Complet SC</th><th>Remark</th>${manage?'<th></th>':''}</tr></thead>
      <tbody>${rows.map((x,i)=>registryEditRow(x,i,manage)).join('')}</tbody>
    </table></div>
    ${manage ? '<div class="v8-form-actions"><button class="btn danger ghost" data-v8-reg-delete-case>ลบ Claim ทั้งชุด</button><button class="btn primary" data-v8-reg-save>บันทึกการแก้ไข</button></div>' : '<div class="muted">สิทธิ์ Read Only</div>'}`;
}
function registryEditRow(x,i,manage) {
  const dis = manage ? '' : 'disabled';
  return `<tr data-reg-id="${x.id}">
    <td>${i+1}</td>
    <td><input class="rStore" value="${esc(x.store_code)}" ${dis}></td>
    <td><input class="rStoreName wide" value="${esc(x.store_name)}" ${dis}></td>
    <td><input class="rTransport" value="${esc(x.transport_no)}" ${dis}></td>
    <td><input class="rReceived" type="date" value="${esc(x.received_date)}" ${dis}></td>
    <td><input class="rClaimDate" type="date" value="${esc(x.claim_date)}" ${dis}></td>
    <td><input class="rShipDate" type="date" value="${esc(x.ship_date)}" ${dis}></td>
    <td><input class="rClaimDc" value="${esc(x.claim_dc)}" ${dis}></td>
    <td><input class="rArticle" value="${esc(x.article)}" ${dis}></td>
    <td><input class="rBarcode" value="${esc(x.barcode)}" ${dis}></td>
    <td><input class="rDescription wide" value="${esc(x.description)}" ${dis}></td>
    <td><input class="rDelivery" type="number" step="0.001" value="${esc(x.delivery_qty)}" ${dis}></td>
    <td><input class="rReceivedQty" type="number" step="0.001" value="${esc(x.received_qty)}" ${dis}></td>
    <td><input class="rQty" type="number" step="0.001" value="${esc(x.claim_qty)}" ${dis}></td>
    <td><input class="rSku" type="number" step="0.01" value="${esc(x.sku_cost)}" ${dis}></td>
    <td><input class="rAmount" type="number" step="0.01" value="${esc(x.amount_claim)}" ${dis}></td>
    <td><select class="rReason" ${dis}>${selectOptions('claims_reason',x.claims_reason)}</select></td>
    <td><select class="rStatus" ${dis}>${selectOptions('status',x.update_status)}</select></td>
    <td><select class="rWho" ${dis}>${selectOptions('who',x.who)}</select></td>
    <td><select class="rCause" ${dis}>${selectOptions('cause_group',x.cause_group)}</select></td>
    <td><select class="rRoot" ${dis}>${selectOptions('root_cause',x.root_cause)}</select></td>
    <td><select class="rCheck" ${dis}>${selectOptions('check_result',x.check_result)}</select></td>
    <td><select class="rRemarkList" ${dis}>${selectOptions('remark_list',x.remark_list)}</select></td>
    <td><select class="rSc" ${dis}>${selectOptions('adjust_code',x.sc)}</select></td>
    <td><select class="rCompleteSc" ${dis}>${selectOptions('status_sc',x.complete_sc)}</select></td>
    <td><input class="rRemark wide" value="${esc(x.remark)}" ${dis}></td>
    ${manage?'<td><button class="btn danger ghost small" data-v8-reg-delete-item>ลบรายการ</button></td>':''}
  </tr>`;
}

async function registryDialogAction(e) {
  const r = V8.registryClaim;
  if (!r) return;
  if (e.target.matches('[data-v8-reg-save]')) {
    const rows = $$('[data-reg-id]', $('#v8RegistryBody')).map(tr => ({
      id: Number(tr.dataset.regId),
      fields: {
        storeCode:$('.rStore',tr).value, storeName:$('.rStoreName',tr).value, transportNo:$('.rTransport',tr).value,
        receivedDate:$('.rReceived',tr).value, claimDate:$('.rClaimDate',tr).value, shipDate:$('.rShipDate',tr).value, claimDc:$('.rClaimDc',tr).value,
        article:$('.rArticle',tr).value, barcode:$('.rBarcode',tr).value, description:$('.rDescription',tr).value,
        deliveryQty:$('.rDelivery',tr).value, receivedQty:$('.rReceivedQty',tr).value, claimQty:$('.rQty',tr).value,
        skuCost:$('.rSku',tr).value, amountClaim:$('.rAmount',tr).value, claimsReason:$('.rReason',tr).value,
        updateStatus:$('.rStatus',tr).value, who:$('.rWho',tr).value, causeGroup:$('.rCause',tr).value, rootCause:$('.rRoot',tr).value,
        checkResult:$('.rCheck',tr).value, remarkList:$('.rRemarkList',tr).value, sc:$('.rSc',tr).value, completeSc:$('.rCompleteSc',tr).value,
        remark:$('.rRemark',tr).value
      }
    }));
    busy(true,'กำลังบันทึก Claim Registry');
    try {
      const x = await api('/api/v8/registry/'+encodeURIComponent(r.claimNo), {method:'PATCH',body:{rows}});
      V8.registryClaim=x; renderRegistryDialog(x); renderRegistryV8(); toast('บันทึกแล้ว',r.claimNo,'success');
    } catch (err) { toast('แก้ไขไม่ได้',err.message,'error'); }
    finally { busy(false); }
  } else if (e.target.matches('[data-v8-reg-delete-item]')) {
    const tr=e.target.closest('[data-reg-id]');
    if (!confirm('ลบรายการนี้หรือไม่?')) return;
    try {
      await api('/api/v8/registry/item/'+tr.dataset.regId,{method:'DELETE'});
      tr.remove(); renderRegistryV8(); toast('ลบรายการแล้ว','','success');
    } catch(err){toast('ลบไม่ได้',err.message,'error')}
  } else if (e.target.matches('[data-v8-reg-delete-case]')) {
    if (!confirm(`ลบ Claim ${r.claimNo} ทั้งชุดหรือไม่?`)) return;
    try {
      await api('/api/v8/registry/'+encodeURIComponent(r.claimNo),{method:'DELETE'});
      $('#v8RegistryDialog').close(); renderRegistryV8(); toast('ลบ Claim แล้ว',r.claimNo,'success');
    } catch(err){toast('ลบไม่ได้',err.message,'error')}
  }
}

const CATEGORY_LABELS = {
  store_topic:'หัวข้อ Store', claims_reason:'Claims Reason', status:'Status', who:'WHO', cause_group:'Cause Group',
  root_cause:'ROOT CAUSE', check_result:'Check Result', adjust_code:'Adjust Code', status_sc:'Status SC', remark_list:'Remark List', claim_dc:'Claim DC'
};

async function loadOptionsEditor() {
  if (!canEditDropdown()) return;
  try {
    await refreshOptions();
    const cat = $('#v8OptionCategory');
    cat.innerHTML = Object.entries(CATEGORY_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
    renderOptionRows();
  } catch {}
}
function renderOptionRows() {
  const host=$('#v8OptionRows');
  if (!host) return;
  host.innerHTML=(V8.optionRows||[]).map(x=>`<tr data-opt-id="${x.id}">
    <td><select class="oCat">${Object.entries(CATEGORY_LABELS).map(([k,v])=>`<option value="${k}" ${k===x.category?'selected':''}>${v}</option>`).join('')}</select></td>
    <td><input class="oVal" value="${esc(x.value)}"></td>
    <td><input class="oOrder" type="number" value="${x.sort_order||0}"></td>
    <td><label class="switch-label"><input class="oActive" type="checkbox" ${x.active?'checked':''}> Active</label></td>
    <td><button class="btn ghost small" data-opt-save>บันทึก</button> <button class="btn danger ghost small" data-opt-delete>ลบ</button></td>
  </tr>`).join('');
}
async function addOptionV8(e) {
  e.preventDefault();
  try {
    const r=await api('/api/v8/options',{method:'POST',body:{category:$('#v8OptionCategory').value,value:$('#v8OptionValue').value,sortOrder:$('#v8OptionOrder').value}});
    V8.optionRows=r.data||[]; V8.options=r.grouped||{}; $('#v8OptionValue').value=''; renderOptionRows(); await refreshOptions(); toast('เพิ่ม Dropdown แล้ว','ตัวเลือกถูกอัปเดตให้ทุกหน้าที่เกี่ยวข้อง','success');
  } catch(err){toast('เพิ่มไม่ได้',err.message,'error')}
}
async function optionTableAction(e) {
  const tr=e.target.closest('[data-opt-id]'); if(!tr)return;
  const id=tr.dataset.optId;
  if(e.target.matches('[data-opt-save]')){
    try{
      const r=await api('/api/v8/options/'+id,{method:'PATCH',body:{category:$('.oCat',tr).value,value:$('.oVal',tr).value,sortOrder:$('.oOrder',tr).value,active:$('.oActive',tr).checked}});
      V8.optionRows=r.data||[];V8.options=r.grouped||{};renderOptionRows();await refreshOptions();toast('บันทึก Dropdown แล้ว','ตัวเลือกถูกอัปเดตให้ทุกหน้าที่เกี่ยวข้อง','success');
    }catch(err){toast('บันทึกไม่ได้',err.message,'error')}
  } else if(e.target.matches('[data-opt-delete]')){
    if(!confirm('ลบตัวเลือกนี้หรือไม่?'))return;
    try{const r=await api('/api/v8/options/'+id,{method:'DELETE'});V8.optionRows=r.data||[];V8.options=r.grouped||{};renderOptionRows();await refreshOptions();toast('ลบ Dropdown แล้ว','ตัวเลือกถูกอัปเดตให้ทุกหน้าที่เกี่ยวข้อง','success')}catch(err){toast('ลบไม่ได้',err.message,'error')}
  }
}

async function downloadBackup() {
  busy(true,'กำลังสำรองข้อมูล');
  try {
    const r=await api('/api/v8/backup');
    const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ClaimCenter_Backup_${r.scope.replace(/[^a-zA-Z0-9_-]/g,'_')}_${today().replaceAll('-','')}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup สำเร็จ',r.scope,'success');
  } catch(e){toast('Backup ไม่สำเร็จ',e.message,'error')}
  finally{busy(false)}
}
async function restoreBackup() {
  const f=$('#v8BackupFile')?.files?.[0];
  if(!f)return toast('Restore','เลือกไฟล์ Backup ก่อน','error');
  if(!confirm('ยืนยันกู้คืนข้อมูลจากไฟล์นี้หรือไม่?'))return;
  busy(true,'กำลังกู้คืนข้อมูล','ระบบจะตรวจสอบสิทธิ์ก่อนเขียนข้อมูล');
  try{
    const backup=JSON.parse(await f.text());
    const r=await api('/api/v8/backup/restore',{method:'POST',body:{backup}});
    toast('Restore สำเร็จ',`${r.restored} records`,'success');
  }catch(e){toast('Restore ไม่สำเร็จ',e.message,'error')}
  finally{busy(false)}
}

async function purgeData() {
  if(!isAdmin())return;
  const scopes=$$('input[name="v8Purge"]:checked').map(x=>x.value);
  if(!scopes.length)return toast('Data Control','เลือกข้อมูลที่จะลบก่อน','error');
  const confirmation=$('#v8PurgeConfirm').value.trim();
  const required=scopes.includes('all_business')?'DELETE ALL':'DELETE';
  if(confirmation!==required)return toast('Data Control',`กรุณาพิมพ์ ${required} เพื่อยืนยัน`,'error');
  if(!confirm('การลบข้อมูลนี้ย้อนกลับไม่ได้ คุณได้ Backup แล้วและยืนยันดำเนินการต่อหรือไม่?'))return;
  busy(true,'กำลังลบข้อมูลที่เลือก');
  try{
    const r=await api('/api/v8/admin/purge',{method:'POST',body:{scopes,confirmation}});
    $('#v8PurgeResult').textContent=`ลบสำเร็จ: ${Object.entries(r.counts||{}).map(([k,v])=>`${k} ${v}`).join(' · ')} · บัญชีผู้ใช้และ Audit Log ยังอยู่`;
    $('#v8PurgeConfirm').value='';$$('input[name="v8Purge"]').forEach(x=>x.checked=false);toast('ลบข้อมูลสำเร็จ','','success');
  }catch(e){toast('Data Control',e.message,'error')}
  finally{busy(false)}
}

installCorporateUi();
