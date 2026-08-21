const BASE_FIELDS = [
  'storeCode', 'storeName', 'claimDc', 'receivedDate', 'reportedDate', 'transportNo',
  'vehicleNo', 'driver', 'dnNo', 'route', 'palletNo', 'basketNo', 'article',
  'barcode', 'description', 'sentQty', 'receivedQty', 'claimQty'
];

const BASE_HEADERS = [
  'Store Code', 'Store Name', 'Claim DC', 'วันที่รับสินค้า', 'วันที่แจ้งเคลม',
  'Transport No.', 'ทะเบียนรถ', 'Driver', 'DN No.', 'Route', 'Pallet No.',
  'Basket No.', 'Article', 'Barcode', 'Description', 'Qty ส่ง', 'Qty รับ', 'Qty เคลม'
];

const CLAIM_REASONS = [
  '1. สินค้าขาดส่ง', '2. สินค้าส่งเกิน', '3. สินค้าส่งผิดรายการ',
  '4. สินค้าไม่ได้คุณภาพ', '5. สินค้าชำรุดจากการขนส่ง',
  '6. สินค้าหมดอายุ', '8. สินค้าถูกแกะกิน'
];

const CHECK_OPTIONS = [
  'Store wrong claim (Not missing pallet) - Not exceeding 5,000',
  'Store wrong claim ( สาขารับตะกร้าครบตาม Rams )',
  'Store wrong claim (Claim Delay)', 'DC Accept', 'TP Accept', 'TP Reject',
  'Transfer', 'ตรวจสอบ', 'Cancel Claim', 'Reject ตามเอกสาร',
  'พบสินค้าตกค้างที่ DC', 'เอกสารไม่สมบูรณ์', 'อื่นๆ'
];

const ROOT_CAUSES = [
  'Short Delivery', 'Over Delivery', 'Damage Delivery', 'Left Over',
  'Not Missing pallet', 'Delivery wrong branch', 'Claim over timeline', 'Other',
  'Product already send to store', 'TP Reject', 'DC Left over', 'Store Cancelled',
  'Not missing basket', 'Store wrong policy', 'DC Damage', 'DC Other',
  'DC Short Delivery', 'TP Accident', 'TP Damage', 'TP Other', 'TP Short Delivery'
];

const CHECK_TO_ROOT = {
  'Store wrong claim (Not missing pallet) - Not exceeding 5,000': 'Not Missing pallet',
  'Store wrong claim ( สาขารับตะกร้าครบตาม Rams )': 'Not missing basket',
  'Store wrong claim (Claim Delay)': 'Claim over timeline',
  'TP Reject': 'TP Reject', 'Transfer': 'Delivery wrong branch',
  'Cancel Claim': 'Store Cancelled', 'Reject ตามเอกสาร': 'Product already send to store',
  'พบสินค้าตกค้างที่ DC': 'DC Left over', 'เอกสารไม่สมบูรณ์': 'Store wrong policy',
  'อื่นๆ': 'Other'
};

const EDITOR_EXTRA_COLUMNS = [
  { field: 'reason', label: 'สาเหตุการเคลม', type: 'select', options: CLAIM_REASONS },
  { field: 'amount', label: 'Amount', type: 'number' },
  { field: 'replyDate', label: 'ตอบกลับสาขา', type: 'date' },
  { field: 'status', label: 'Update status', type: 'select', options: ['Accept', 'Reject', 'Pending'] },
  { field: 'who', label: 'WHO', type: 'select', options: ['DC', 'TP'] },
  { field: 'rootCause', label: 'ROOT CAUSE', type: 'select', options: ROOT_CAUSES },
  { field: 'checkResult', label: 'Check', type: 'select', options: CHECK_OPTIONS },
  { field: 'remark', label: 'Remark', type: 'text' },
  { field: 'sc', label: 'SC', type: 'select', options: ['Adjust Code 15', 'Adjust Code 16', 'Normal'] },
  { field: 'completeSc', label: 'Complet SC', type: 'select', options: ['Complete', 'Pending', 'ยังไม่ส่งข้อมูล SC'] }
];

const AUTO_COLUMNS = [
  ['formatType', 'Format'], ['storeType', 'Type'], ['claimNo', 'Claim No.'],
  ['referenceNo', 'Reference No.'], ['listEggs', 'List Eggs'], ['check100', 'Check 100%'],
  ['manageWeight', 'Manage Weight'], ['skuCost', 'SKU Cost'], ['segDescription', 'Segment']
];

const state = {
  user: null,
  currentView: 'create',
  editorRows: [],
  editorMode: 'new',
  masterRefs: null,
  claims: [],
  claimOffset: 0,
  claimHasMore: false,
  referenceType: 'DC',
  references: [],
  pivotData: [],
  pivotRootsExpanded: false,
  formSubmit: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', init);

function init() {
  fillSelect('#batchReason', CLAIM_REASONS);
  fillSelect('#batchCheck', CHECK_OPTIONS);
  fillSelect('#batchRootCause', ROOT_CAUSES);
  fillSelect('#pivotMonth', Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}. ${new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2026, index, 1))}` })));
  $('#todayText').textContent = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date());
  bindEvents();
  restoreSession();
}

function bindEvents() {
  $('#loginForm').addEventListener('submit', login);
  $('#toggleLoginPassword').addEventListener('click', () => togglePassword($('#loginPassword')));
  $('#logoutButton').addEventListener('click', logout);
  $('#changePasswordButton').addEventListener('click', openChangePassword);
  $('#profileMenuButton').addEventListener('click', () => { $('#profileMenu').hidden = !$('#profileMenu').hidden; });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.sidebar-foot')) $('#profileMenu').hidden = true;
  });

  $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#mobileMenuButton').addEventListener('click', openSidebar);
  $('#mobileScrim').addEventListener('click', closeSidebar);
  $('#newClaimButton').addEventListener('click', startNewClaim);

  $('#pasteArea').addEventListener('input', updatePasteCount);
  $('#clearPasteButton').addEventListener('click', () => { $('#pasteArea').value = ''; updatePasteCount(); });
  $('#previewButton').addEventListener('click', previewPastedData);
  $('#backToPasteButton').addEventListener('click', showPasteStep);
  $('#applyBatchButton').addEventListener('click', applyBatchValues);
  $('#batchCheck').addEventListener('change', () => {
    const mapped = CHECK_TO_ROOT[$('#batchCheck').value];
    if (mapped) $('#batchRootCause').value = mapped;
  });
  $('#editorBody').addEventListener('input', handleEditorInput);
  $('#editorBody').addEventListener('change', handleEditorInput);
  $('#saveClaimsButton').addEventListener('click', saveClaims);

  $('#claimSearchForm').addEventListener('submit', (event) => { event.preventDefault(); loadClaims(true); });
  $('#resetSearchButton').addEventListener('click', resetSearch);
  $('#refreshClaimsButton').addEventListener('click', () => loadClaims(true));
  $('#loadMoreButton').addEventListener('click', () => loadClaims(false));
  $('#claimGroups').addEventListener('click', handleClaimAction);
  $('#claimGroups').addEventListener('change', handleClaimToggle);
  $('#exportButton').addEventListener('click', exportExcel);

  $$('.tab[data-ref-type]').forEach((button) => button.addEventListener('click', () => {
    state.referenceType = button.dataset.refType;
    $$('.tab[data-ref-type]').forEach((item) => item.classList.toggle('active', item === button));
    loadReferences();
  }));
  $('#referenceSearch').addEventListener('input', renderReferences);
  $('#addReferenceButton').addEventListener('click', openAddReference);
  $('#referenceBody').addEventListener('click', handleReferenceDelete);

  $('#performanceDate').addEventListener('change', loadPerformance);
  $('#resetPerformanceButton').addEventListener('click', () => { $('#performanceDate').value = ''; loadPerformance(); });
  for (const selector of ['#pivotYear', '#pivotMonth', '#pivotFormat', '#separateFranchise']) $(selector).addEventListener('change', renderPivot);
  $('#reloadPivotButton').addEventListener('click', () => loadPivot(true));
  $('#togglePivotRootsButton').addEventListener('click', toggleAllPivotRoots);
  $('#pivotBody').addEventListener('click', handlePivotToggle);
  $('#exportPivotButton').addEventListener('click', exportPivot);

  $('#saveStoreMasterButton').addEventListener('click', saveStoreMaster);
  $('#saveProductMasterButton').addEventListener('click', saveProductMaster);
  $('#scanMissingStoresButton').addEventListener('click', scanMissingStores);
  $('#addUserButton').addEventListener('click', openAddUser);
  $('#userBody').addEventListener('click', handleUserDelete);

  $('#closeDetailsButton').addEventListener('click', () => $('#detailsDialog').close());
  $('#dynamicForm').addEventListener('submit', submitDynamicForm);
  $$('#dynamicForm [value="cancel"]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault(); $('#formDialog').close('cancel');
  }));
}

async function restoreSession() {
  try {
    const response = await api('/api/auth/me');
    enterApp(response.user);
  } catch {
    showLogin();
  }
}

async function login(event) {
  event.preventDefault();
  setLoading(true, 'กำลังเข้าสู่ระบบ');
  try {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { username: $('#loginUsername').value.trim(), password: $('#loginPassword').value }
    });
    $('#loginForm').reset();
    enterApp(response.user);
    toast('เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับ ${response.user.username}`);
  } catch (error) {
    toast('เข้าสู่ระบบไม่สำเร็จ', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
  state.user = null;
  showLogin();
}

function enterApp(user) {
  state.user = user;
  $('#loginScreen').hidden = true;
  $('#appShell').hidden = false;
  $('#displayUser').textContent = user.username;
  $('#displayRole').textContent = user.role === 'admin' ? 'Administrator' : 'User';
  $('#userAvatar').textContent = user.username.slice(0, 2).toUpperCase();
  $('#adminNav').hidden = user.role !== 'admin';
  switchView('create');
  loadClaims(true, true);
}

function showLogin() {
  $('#appShell').hidden = true;
  $('#loginScreen').hidden = false;
  setTimeout(() => $('#loginUsername').focus(), 50);
}

function switchView(view) {
  if (!state.user) return;
  if (['masters', 'users'].includes(view) && state.user.role !== 'admin') return;
  state.currentView = view;
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const section = $(`#view-${view}`);
  $('#pageTitle').textContent = section?.dataset.title || 'Claim Center';
  $('#pageEyebrow').textContent = section?.dataset.eyebrow || 'WORKSPACE';
  closeSidebar();
  if (view === 'claims') loadClaims(true);
  if (view === 'references') loadReferences();
  if (view === 'performance') loadPerformance();
  if (view === 'pivot') loadPivot();
  if (view === 'users') loadUsers();
}

function openSidebar() { $('#sidebar').classList.add('open'); $('#mobileScrim').classList.add('open'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#mobileScrim').classList.remove('open'); }

function updatePasteCount() {
  const rows = $('#pasteArea').value.split(/\r?\n/).filter((line) => line.trim()).length;
  $('#pasteRowCount').textContent = `${rows.toLocaleString()} แถว`;
}

async function previewPastedData() {
  const raw = $('#pasteArea').value.trim();
  if (!raw) return toast('ยังไม่มีข้อมูล', 'กรุณาวางข้อมูลจาก Excel ก่อน', 'error');
  const arrays = parseDelimited(raw).filter((row) => row.some((cell) => cell.trim()));
  const invalid = arrays.findIndex((row) => row.length < 18);
  if (invalid >= 0) return toast('รูปแบบไม่ครบ', `แถวที่ ${invalid + 1} มีเพียง ${arrays[invalid].length} คอลัมน์ (ต้องมี 18)`, 'error');

  state.editorRows = arrays.map((cells) => rowFromCells(cells.slice(0, 18)));
  state.editorMode = 'new';
  setLoading(true, 'กำลังตรวจสอบ Master Data');
  try {
    await resolveEditorMasters();
    showEditorStep();
    toast('นำเข้าข้อมูลแล้ว', `พบ ${state.editorRows.length.toLocaleString()} รายการ`);
  } catch (error) {
    toast('ตรวจสอบข้อมูลไม่สำเร็จ', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function rowFromCells(cells) {
  const row = {};
  BASE_FIELDS.forEach((field, index) => { row[field] = String(cells[index] ?? '').trim(); });
  row.storeCode = digits(row.storeCode);
  row.claimDc = digits(row.claimDc).slice(0, 5);
  row.article = row.article.replace(/'/g, '');
  row.barcode = row.barcode.replace(/'/g, '');
  row.palletNo = sanitizePallet(row.palletNo);
  row.basketNo = '';
  row.receivedDate = normalizeDate(row.receivedDate);
  row.reportedDate = normalizeDate(row.reportedDate);
  Object.assign(row, {
    reason: '', amount: '', replyDate: '', status: '', who: '', rootCause: '',
    checkResult: '', remark: '', sc: '', completeSc: '', storeCheck100: '',
    formatType: '', storeType: '', claimNo: '', referenceNo: '-', listEggs: '',
    check100: '', manageWeight: '', skuCost: 0, segDescription: '', refId: ''
  });
  return row;
}

async function resolveEditorMasters() {
  const stores = [...new Set(state.editorRows.map((row) => row.storeCode).filter(Boolean))];
  const articles = [...new Set(state.editorRows.flatMap((row) => [row.article, row.barcode]).filter(Boolean))];
  const response = await api('/api/masters/resolve', { method: 'POST', body: { stores, articles } });
  state.masterRefs = response.data;
  for (const row of state.editorRows) {
    if (row.barcode && response.data.mapBarcodeToArticle[row.barcode]) row.article = response.data.mapBarcodeToArticle[row.barcode];
    else if (!row.barcode && response.data.mapArticleToBarcode[row.article]) row.barcode = response.data.mapArticleToBarcode[row.article];
    row.formatType ||= formatForStore(row.storeCode, response.data.formatType[row.storeCode]);
    row.storeType ||= response.data.storeType[row.storeCode] || '';
    row.listEggs ||= response.data.listEggs[row.article] || response.data.listEggs[row.barcode] || '';
    row.check100 ||= response.data.check100[row.storeCode] || '';
    row.manageWeight ||= response.data.manageWeight[row.article] || response.data.manageWeight[row.barcode] || '';
    row.skuCost = state.editorMode === 'edit' ? Number(row.skuCost || 0) : Number(response.data.skuCost[row.article] || response.data.skuCost[row.barcode] || 0);
    row.segDescription ||= response.data.segDescription[row.article] || '';
    if (state.editorMode === 'new' && row.amount === '') row.amount = roundMoney(row.skuCost * (parseNumber(row.claimQty) || 0));
  }
  updatePreviewNumbers();
}

function showEditorStep() {
  $('#pastePanel').hidden = true;
  $('#claimEditor').hidden = false;
  $('#editorModeBadge').textContent = state.editorMode === 'edit' ? 'EDIT' : 'NEW';
  setStep(2);
  renderEditorTable();
  syncBatchFromFirstRow();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPasteStep() {
  if (state.editorMode === 'edit') return startNewClaim();
  $('#pastePanel').hidden = false;
  $('#claimEditor').hidden = true;
  setStep(1);
}

function startNewClaim() {
  state.editorRows = [];
  state.editorMode = 'new';
  state.masterRefs = null;
  $('#pasteArea').value = '';
  updatePasteCount();
  resetBatchForm();
  showPasteStep();
  switchView('create');
}

function applyBatchValues() {
  if (!state.editorRows.length) return;
  const values = batchValues();
  for (const row of state.editorRows) {
    for (const [field, value] of Object.entries(values)) {
      if (value !== '') row[field] = value;
    }
    if (row.checkResult && CHECK_TO_ROOT[row.checkResult] && !values.rootCause) row.rootCause = CHECK_TO_ROOT[row.checkResult];
  }
  updatePreviewNumbers();
  renderEditorTable();
  toast('ใช้ค่ากับทุกรายการแล้ว', `${state.editorRows.length} รายการได้รับการอัปเดต`);
}

function batchValues() {
  return {
    reason: $('#batchReason').value,
    replyDate: $('#batchReplyDate').value,
    status: $('#batchStatus').value,
    who: $('#batchWho').value,
    checkResult: $('#batchCheck').value,
    rootCause: $('#batchRootCause').value,
    sc: $('#batchSc').value,
    completeSc: $('#batchCompleteSc').value,
    remark: $('#batchRemark').value.trim()
  };
}

function syncBatchFromFirstRow() {
  const first = state.editorRows[0] || {};
  $('#batchReason').value = first.reason || '';
  $('#batchReplyDate').value = first.replyDate || '';
  $('#batchStatus').value = first.status || '';
  $('#batchWho').value = first.who || '';
  $('#batchCheck').value = first.checkResult || '';
  $('#batchRootCause').value = first.rootCause || '';
  $('#batchSc').value = first.sc || '';
  $('#batchCompleteSc').value = first.completeSc || '';
  $('#batchRemark').value = first.remark || '';
}

function resetBatchForm() {
  for (const selector of ['#batchReason', '#batchReplyDate', '#batchStatus', '#batchWho', '#batchCheck', '#batchRootCause', '#batchSc', '#batchCompleteSc', '#batchRemark']) $(selector).value = '';
  $('#bypassDate').checked = false;
}

function renderEditorTable() {
  const baseHead = BASE_HEADERS.map((label, index) => `<th class="${index === 0 ? 'sticky' : ''}">${escapeHtml(label)}</th>`).join('');
  const extraHead = EDITOR_EXTRA_COLUMNS.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const autoHead = AUTO_COLUMNS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('');
  $('#editorHead').innerHTML = `<tr><th class="sticky">#</th>${baseHead}${extraHead}${autoHead}</tr>`;
  $('#editorBody').innerHTML = state.editorRows.map((row, rowIndex) => {
    const base = BASE_FIELDS.map((field, index) => editorInput(rowIndex, field, row[field], baseInputType(field), index === 0 ? 'sticky' : '', field === 'basketNo')).join('');
    const extras = EDITOR_EXTRA_COLUMNS.map((column) => {
      if (column.type === 'select') return editorSelect(rowIndex, column.field, row[column.field], column.options);
      return editorInput(rowIndex, column.field, row[column.field], column.type);
    }).join('');
    const autos = AUTO_COLUMNS.map(([field]) => `<td><span class="auto-cell" title="${escapeAttr(row[field] ?? '')}">${escapeHtml(displayValue(row[field]))}</span></td>`).join('');
    return `<tr data-row="${rowIndex}"><td class="sticky"><strong>${rowIndex + 1}</strong></td>${base}${extras}${autos}</tr>`;
  }).join('');
  updateEditorSummary();
}

function editorInput(rowIndex, field, value, type = 'text', cellClass = '', readonly = false) {
  return `<td class="${cellClass}"><input data-row="${rowIndex}" data-field="${field}" type="${type}" value="${escapeAttr(value ?? '')}" ${readonly ? 'readonly tabindex="-1"' : ''}></td>`;
}

function editorSelect(rowIndex, field, value, options) {
  const optionHtml = [''].concat(options).map((option) => `<option value="${escapeAttr(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option || '– เลือก –')}</option>`).join('');
  return `<td><select data-row="${rowIndex}" data-field="${field}">${optionHtml}</select></td>`;
}

function handleEditorInput(event) {
  const input = event.target.closest('[data-row][data-field]');
  if (!input) return;
  const row = state.editorRows[Number(input.dataset.row)];
  const field = input.dataset.field;
  row[field] = input.value;
  input.removeAttribute('aria-invalid');
  if (field === 'claimDc') row[field] = digits(row[field]).slice(0, 5);
  if (field === 'storeCode') row[field] = digits(row[field]).slice(0, 5);
  if (field === 'palletNo') row[field] = sanitizePallet(row[field]);
  if (field === 'checkResult' && CHECK_TO_ROOT[row.checkResult]) row.rootCause = CHECK_TO_ROOT[row.checkResult];
  if (field === 'claimQty' && state.editorMode === 'new') row.amount = roundMoney(Number(row.skuCost || 0) * (parseNumber(row.claimQty) || 0));
  if (['replyDate', 'status', 'who', 'storeCode', 'checkResult', 'claimQty'].includes(field)) {
    updatePreviewNumbers();
    renderEditorTable();
  } else {
    updateEditorSummary();
  }
}

function updatePreviewNumbers() {
  const refs = state.masterRefs;
  if (!refs) return;
  const claimCounters = {};
  const claimGroups = {};
  const referenceGroups = {};
  let dcCounter = Number(refs.lastRefCDC || 0);
  let tpCounter = Number(refs.lastRefTF || 0);
  for (const row of state.editorRows) {
    if (state.editorMode === 'new' && row.replyDate) {
      const prefix = claimPrefix(row.formatType);
      const date = claimDateKey(row.replyDate);
      const counterKey = `${prefix}${date}`;
      const groupKey = `${counterKey}|${row.transportNo}|${row.status}`;
      if (!claimGroups[groupKey]) {
        claimCounters[counterKey] = (claimCounters[counterKey] ?? Number(refs.lastRunningNumbers[counterKey] || 0)) + 1;
        claimGroups[groupKey] = claimCounters[counterKey];
      }
      row.claimNo = `${counterKey}${String(claimGroups[groupKey]).padStart(prefix === 'HYP' ? 7 : 6, '0')}`;
    }
    if (row.status === 'Accept' && ['DC', 'TP'].includes(row.who)) {
      const existingValid = row.who === 'DC' ? /^(CDC|CCD)\d{7}$/.test(row.referenceNo) : /^TF\d{7}$/.test(row.referenceNo);
      if (state.editorMode === 'edit' && existingValid) continue;
      const prefix = row.who === 'DC' ? 'CCD' : 'TF';
      const key = `${prefix}|${row.transportNo}`;
      if (!referenceGroups[key]) {
        const next = row.who === 'DC' ? ++dcCounter : ++tpCounter;
        referenceGroups[key] = `${prefix}${String(next).padStart(7, '0')}`;
      }
      row.referenceNo = referenceGroups[key];
    } else row.referenceNo = '-';
  }
}

function updateEditorSummary() {
  $('#editorRows').textContent = state.editorRows.length.toLocaleString();
  $('#editorTransport').textContent = new Set(state.editorRows.map((row) => row.transportNo).filter(Boolean)).size.toLocaleString();
  const total = state.editorRows.reduce((sum, row) => sum + (parseNumber(row.amount) || 0), 0);
  $('#editorTotal').textContent = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function saveClaims() {
  if (!state.editorRows.length) return;
  clearEditorErrors();
  const errors = validateEditorRows();
  if (errors.length) {
    $('#validationSummary').textContent = `พบ ${errors.length} รายการที่ต้องแก้ไข`;
    toast('ข้อมูลยังไม่ครบ', errors.slice(0, 3).map((item) => `แถว ${item.row}: ${item.message}`).join(' • '), 'error', 6500);
    return;
  }
  const confirmed = await confirmAction({
    title: state.editorMode === 'edit' ? 'ยืนยันการอัปเดต' : 'ยืนยันการบันทึก',
    message: `บันทึก ${state.editorRows.length.toLocaleString()} รายการ ยอดรวม ${state.editorRows.reduce((sum, row) => sum + Number(row.amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท?`,
    confirmText: state.editorMode === 'edit' ? 'อัปเดตข้อมูล' : 'บันทึกข้อมูล'
  });
  if (!confirmed) return;
  setStep(3);
  setLoading(true, state.editorMode === 'edit' ? 'กำลังอัปเดตข้อมูล' : 'กำลังบันทึกข้อมูล');
  try {
    const response = await api('/api/claims/bulk', { method: 'POST', body: { rows: state.editorRows, bypassDate: $('#bypassDate').checked } });
    toast('บันทึกสำเร็จ', `เพิ่มใหม่ ${response.inserted} • แก้ไข ${response.updated} • ย้อนหลัง ${response.archiveUpdated}`);
    startNewClaim();
    switchView('claims');
  } catch (error) {
    if (error.details) markServerErrors(error.details);
    toast('บันทึกไม่สำเร็จ', error.message, 'error', 6500);
    setStep(2);
  } finally {
    setLoading(false);
  }
}

function validateEditorRows() {
  const errors = [];
  const today = new Date();
  const minDate = new Date(today); minDate.setDate(today.getDate() - 15); minDate.setHours(0, 0, 0, 0);
  state.editorRows.forEach((row, index) => {
    const checks = [];
    if (!/^\d{5}$/.test(row.storeCode)) checks.push(['storeCode', 'Store Code ต้องเป็นตัวเลข 5 หลัก']);
    else if (!['1', '2', '3', '7'].includes(row.storeCode[0])) checks.push(['storeCode', 'Store Code ต้องขึ้นต้นด้วย 1, 2, 3 หรือ 7']);
    if (row.claimDc && !['92924', '91915', '91210', '91101'].includes(row.claimDc)) checks.push(['claimDc', 'Claim DC ไม่ถูกต้อง']);
    if (!/^\d+$/.test(row.transportNo)) checks.push(['transportNo', 'Transport No. ต้องเป็นตัวเลข']);
    if (/\d/.test(row.driver)) checks.push(['driver', 'Driver ห้ามมีตัวเลข']);
    if (!/^1\d{8}$/.test(row.article)) checks.push(['article', 'Article ต้องเป็น 9 หลักและขึ้นต้นด้วย 1']);
    if (row.barcode && !/^\d+$/.test(row.barcode)) checks.push(['barcode', 'Barcode ต้องเป็นตัวเลข']);
    ['sentQty', 'receivedQty', 'claimQty'].forEach((field) => { if (row[field] && !Number.isFinite(parseNumber(row[field]))) checks.push([field, 'Qty ต้องเป็นตัวเลข']); });
    if (!row.replyDate) checks.push(['replyDate', 'ต้องระบุวันที่ตอบกลับ']);
    else if (!$('#bypassDate').checked) {
      const date = new Date(`${row.replyDate}T00:00:00`);
      if (date.getFullYear() !== today.getFullYear() || date < minDate) checks.push(['replyDate', 'วันที่ผิดปีหรือย้อนหลังเกิน 15 วัน']);
    }
    if (!['Accept', 'Reject', 'Pending'].includes(row.status)) checks.push(['status', 'กรุณาเลือก Update status']);
    if (!['DC', 'TP'].includes(row.who)) checks.push(['who', 'กรุณาเลือก WHO']);
    if (!row.rootCause) checks.push(['rootCause', 'กรุณาระบุ ROOT CAUSE']);
    if (!row.checkResult) checks.push(['checkResult', 'กรุณาระบุ Check']);
    for (const [field, message] of checks) {
      errors.push({ row: index + 1, field, message });
      $(`#editorBody [data-row="${index}"][data-field="${field}"]`)?.setAttribute('aria-invalid', 'true');
    }
  });
  return errors;
}

function clearEditorErrors() { $$('#editorBody [aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid')); }
function markServerErrors(details) {
  for (const entry of details) {
    const rowIndex = Number(entry.row) - 1;
    $$(`#editorBody [data-row="${rowIndex}"]`).forEach((input) => input.setAttribute('aria-invalid', 'true'));
  }
}

async function loadClaims(reset = true, silent = false) {
  if (!state.user) return;
  if (reset) { state.claimOffset = 0; state.claims = []; }
  if (!silent) setLoading(true, 'กำลังโหลดรายการเคลม');
  try {
    const params = new URLSearchParams({ offset: String(state.claimOffset), limit: '60' });
    const filters = {
      date: $('#searchDate').value,
      reference: $('#searchReference').value.trim(),
      transport: $('#searchTransport').value.trim(),
      article: $('#searchArticle').value.trim(),
      store: $('#searchStore').value.trim()
    };
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const response = await api(`/api/claims?${params}`);
    state.claims = reset ? response.groups : state.claims.concat(response.groups);
    state.claimOffset += response.groups.length;
    state.claimHasMore = response.hasMore;
    $('#claimCount').textContent = response.totalGroups.toLocaleString();
    renderClaims(response.totalGroups);
  } catch (error) {
    if (!silent) toast('โหลดข้อมูลไม่สำเร็จ', error.message, 'error');
  } finally {
    if (!silent) setLoading(false);
  }
}

function renderClaims(totalGroups = state.claims.length) {
  $('#claimResultText').textContent = `พบ ${totalGroups.toLocaleString()} เคส • แสดง ${state.claims.length.toLocaleString()} เคส`;
  $('#claimsEmpty').hidden = state.claims.length !== 0;
  $('#loadMoreButton').hidden = !state.claimHasMore;
  $('#claimGroups').innerHTML = state.claims.map((group, index) => {
    const statusClass = group.status.toLowerCase();
    const detailRows = group.rows.map((row) => `<tr><td>${escapeHtml(row.article)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.claimQty)}</td><td>${money(row.amount)}</td><td>${escapeHtml(row.rootCause)}</td><td>${escapeHtml(row.checkResult)}</td><td>${escapeHtml(row.createdBy)}</td></tr>`).join('');
    return `<article class="claim-card" data-group-index="${index}">
      <div class="claim-card-main">
        <div class="claim-identity"><i class="claim-dot ${statusClass}"></i><div><strong>${escapeHtml(group.transportNo || '-')}</strong><span>${escapeHtml(group.claimNo || 'ยังไม่มี Claim No.')}</span></div></div>
        <div class="claim-metric store"><span>Store</span><strong>${escapeHtml(group.storeCode)} · ${escapeHtml(group.storeName)}</strong></div>
        <div class="claim-metric reference"><span>Reference</span><strong>${escapeHtml(group.referenceNo || '-')}</strong></div>
        <div class="claim-metric"><span>สถานะ / ผู้รับผิดชอบ</span><strong><span class="badge ${statusClass}">${escapeHtml(group.status)}</span> ${escapeHtml(group.who)}</strong></div>
        <div class="claim-metric amount"><span>${group.rows.length} รายการ</span><strong>${money(group.totalAmount)} ฿</strong></div>
        <div class="claim-actions">
          <button class="icon-button" data-action="toggle" title="เปิดรายการ">⌄</button>
          <button class="icon-button" data-action="view" title="รายละเอียด">↗</button>
          <button class="icon-button" data-action="edit" title="แก้ไข">✎</button>
          <button class="icon-button" data-action="delete" title="ลบ">×</button>
        </div>
      </div>
      <div class="claim-card-foot"><span>อัปเดตล่าสุด: ${escapeHtml(latestGroupDate(group))}</span><span class="email-toggle"><input type="checkbox" data-action="email" ${group.emailSent ? 'checked' : ''}> ส่งอีเมลแล้ว</span><button class="button ghost compact" data-action="draft">เปิด Email Draft</button></div>
      <div class="claim-details" hidden><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Article</th><th>Description</th><th>Qty Claim</th><th>Amount</th><th>Root Cause</th><th>Check</th><th>ผู้บันทึก</th></tr></thead><tbody>${detailRows}</tbody></table></div></div>
    </article>`;
  }).join('');
}

async function handleClaimAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('.claim-card');
  const group = state.claims[Number(card.dataset.groupIndex)];
  const action = button.dataset.action;
  if (action === 'toggle') {
    const details = $('.claim-details', card); details.hidden = !details.hidden; button.textContent = details.hidden ? '⌄' : '⌃';
  }
  if (action === 'view') showClaimDetails(group);
  if (action === 'edit') editClaimGroup(group);
  if (action === 'delete') deleteClaimGroup(group);
  if (action === 'draft') openEmailDraft(group.transportNo);
}

async function handleClaimToggle(event) {
  const input = event.target.closest('input[data-action="email"]');
  if (!input) return;
  const card = input.closest('.claim-card');
  const group = state.claims[Number(card.dataset.groupIndex)];
  try {
    await api(`/api/claims/transport/${encodeURIComponent(group.transportNo)}/email`, { method: 'PATCH', body: { checked: input.checked } });
    group.emailSent = input.checked;
    toast('อัปเดตสถานะอีเมลแล้ว', group.transportNo);
  } catch (error) {
    input.checked = !input.checked;
    toast('อัปเดตไม่สำเร็จ', error.message, 'error');
  }
}

function showClaimDetails(group) {
  $('#detailsTitle').textContent = `Transport ${group.transportNo}`;
  const headers = ['Store', 'Article', 'Description', 'Qty Claim', 'Amount', 'Status', 'WHO', 'Claim No.', 'Reference', 'Root Cause', 'Check', 'Remark', 'Created By', 'Updated By'];
  $('#detailsHead').innerHTML = `<tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr>`;
  $('#detailsBody').innerHTML = group.rows.map((row) => `<tr><td>${escapeHtml(row.storeCode)}</td><td>${escapeHtml(row.article)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.claimQty)}</td><td>${money(row.amount)}</td><td>${badge(row.status)}</td><td>${escapeHtml(row.who)}</td><td>${escapeHtml(row.claimNo)}</td><td>${escapeHtml(row.referenceNo)}</td><td>${escapeHtml(row.rootCause)}</td><td>${escapeHtml(row.checkResult)}</td><td>${escapeHtml(row.remark)}</td><td>${escapeHtml(row.createdBy)}</td><td>${escapeHtml(row.updatedBy || '-')}</td></tr>`).join('');
  $('#detailsDialog').showModal();
}

async function editClaimGroup(group) {
  setLoading(true, 'กำลังเตรียมข้อมูลแก้ไข');
  try {
    const response = await api(`/api/claims/group/${encodeURIComponent(group.transportNo)}?status=${encodeURIComponent(group.status)}&who=${encodeURIComponent(group.who)}`);
    state.editorRows = response.data.map((row) => ({ ...row, amount: Number(row.amount || 0), basketNo: '' }));
    state.editorMode = 'edit';
    await resolveEditorMasters();
    switchView('create');
    showEditorStep();
    toast('โหมดแก้ไข', `${group.transportNo} • ${state.editorRows.length} รายการ`);
  } catch (error) {
    toast('เปิดข้อมูลไม่สำเร็จ', error.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function deleteClaimGroup(group) {
  const ok = await confirmAction({ title: 'ลบรอบรถนี้?', message: `รายการทั้งหมดของ Transport ${group.transportNo} ในฐานข้อมูลปัจจุบันจะถูกลบ`, confirmText: 'ลบข้อมูล', danger: true });
  if (!ok) return;
  setLoading(true, 'กำลังลบข้อมูล');
  try {
    const response = await api(`/api/claims/transport/${encodeURIComponent(group.transportNo)}`, { method: 'DELETE' });
    toast('ลบข้อมูลแล้ว', `${response.deleted} รายการ`);
    loadClaims(true, true);
  } catch (error) { toast('ลบไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

async function openEmailDraft(transportNo) {
  try {
    const response = await api(`/api/claims/transport/${encodeURIComponent(transportNo)}/email-draft`);
    window.location.href = `mailto:?subject=${encodeURIComponent(response.data.subject)}&body=${encodeURIComponent(response.data.body)}`;
  } catch (error) { toast('สร้าง Email Draft ไม่สำเร็จ', error.message, 'error'); }
}

function resetSearch() {
  for (const selector of ['#searchDate', '#searchReference', '#searchTransport', '#searchArticle', '#searchStore']) $(selector).value = '';
  loadClaims(true);
}

async function exportExcel() {
  setLoading(true, 'กำลังเตรียมไฟล์ Export');
  try {
    const response = await api('/api/export');
    if (window.XLSX) {
      const workbook = XLSX.utils.book_new();
      for (const [name, rows] of Object.entries(response.data)) {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet['!views'] = [{ state: 'frozen', ySplit: 1 }];
        sheet['!cols'] = Array.from({ length: Math.max(...rows.map((row) => row.length)) }, () => ({ wch: 18 }));
        XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
      }
      XLSX.writeFile(workbook, `Claim_Export_${localIsoDate()}.xlsx`);
    } else {
      const rows = response.data['Claim All BU'];
      downloadBlob(`Claim_Export_${localIsoDate()}.csv`, '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    }
    toast('สร้างไฟล์แล้ว', 'ดาวน์โหลดข้อมูล Claim และ Reference เรียบร้อย');
  } catch (error) { toast('Export ไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

async function loadReferences() {
  setLoading(true, 'กำลังโหลด Reference');
  try {
    const response = await api(`/api/references?type=${state.referenceType}`);
    state.references = response.data;
    renderReferences();
  } catch (error) { toast('โหลด Reference ไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

function renderReferences() {
  const query = $('#referenceSearch').value.trim().toLowerCase();
  const rows = state.references.filter((row) => [row.ref_no, row.claim_no, row.store_code, row.remark].some((value) => String(value || '').toLowerCase().includes(query)));
  $('#referenceCount').textContent = `${rows.length.toLocaleString()} รายการ`;
  $('#referenceBody').innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.ref_no)}</strong></td><td>${escapeHtml(row.reply_date)}</td><td>${escapeHtml(row.claim_no)}</td><td>${escapeHtml(row.store_code)}</td><td>${escapeHtml(row.remark)}</td><td>${escapeHtml(row.source_label)}</td><td><button class="icon-button" data-ref-delete="${escapeAttr(row.ref_no)}">×</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted">ไม่พบข้อมูล</td></tr>';
}

function openAddReference() {
  openForm({
    eyebrow: 'REFERENCE', title: `เพิ่ม ${state.referenceType} Reference`, submitText: 'เพิ่ม Reference',
    fields: [
      { name: 'refNo', label: 'Reference No.', required: true },
      { name: 'date', label: 'วันที่', type: 'date', required: true },
      { name: 'claimNo', label: 'Claim No.' },
      { name: 'store', label: 'Store Code' },
      { name: 'remark', label: 'Remark', wide: true }
    ],
    onSubmit: async (data) => {
      await api('/api/references', { method: 'POST', body: { ...data, type: state.referenceType } });
      toast('เพิ่ม Reference แล้ว', data.refNo); loadReferences();
    }
  });
}

async function handleReferenceDelete(event) {
  const button = event.target.closest('[data-ref-delete]');
  if (!button) return;
  const refNo = button.dataset.refDelete;
  if (!await confirmAction({ title: 'ลบ Reference?', message: refNo, confirmText: 'ลบ', danger: true })) return;
  try {
    await api(`/api/references/${state.referenceType}/${encodeURIComponent(refNo)}`, { method: 'DELETE' });
    toast('ลบ Reference แล้ว', refNo); loadReferences();
  } catch (error) { toast('ลบไม่สำเร็จ', error.message, 'error'); }
}

async function loadPerformance() {
  setLoading(true, 'กำลังสรุปสถิติการทำงาน');
  try {
    const date = $('#performanceDate').value;
    const response = await api(`/api/performance${date ? `?date=${encodeURIComponent(date)}` : ''}`);
    $('#performanceTotal').textContent = response.totalOverall.toLocaleString();
    $('#performanceCaption').textContent = date ? `ประจำวันที่ ${formatThaiDate(date)}` : 'ข้อมูลทุกช่วงเวลา';
    $('#performanceBody').innerHTML = response.data.length ? response.data.map((item, index) => {
      const percent = response.totalOverall ? (item.total / response.totalOverall) * 100 : 0;
      return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.user)}</strong></td><td>${item.newCount.toLocaleString()}</td><td>${item.updateCount.toLocaleString()}</td><td><strong>${item.total.toLocaleString()}</strong></td><td><progress class="progress-track" title="${percent.toFixed(1)}%" value="${percent.toFixed(2)}" max="100"></progress></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="muted">ไม่พบกิจกรรมตามวันที่เลือก</td></tr>';
  } catch (error) { toast('โหลดสถิติไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

async function loadPivot(force = false) {
  if (state.pivotData.length && !force) return renderPivot();
  setLoading(true, 'กำลังประมวลผล Pivot');
  try {
    const response = await api('/api/pivot');
    state.pivotData = response.data;
    const years = [...new Set(response.data.map((row) => Number(String(row.date || '').slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a);
    if (!years.length) years.push(new Date().getFullYear());
    $('#pivotYear').innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
    renderPivot();
  } catch (error) { toast('โหลด Pivot ไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

function renderPivot() {
  if (!state.pivotData) return;
  const year = Number($('#pivotYear').value || new Date().getFullYear());
  const monthValue = $('#pivotMonth').value || 'all';
  const months = monthValue === 'all' ? Array.from({ length: 12 }, (_, index) => index + 1) : [Number(monthValue)];
  const separate = $('#separateFranchise').checked;
  if (!separate && $('#pivotFormat').value === 'FRANCHISE') $('#pivotFormat').value = 'MBC';
  const format = $('#pivotFormat').value;
  const tree = {};
  const grand = pivotMetric(months);
  let matchedRows = 0;

  for (const row of state.pivotData) {
    const date = new Date(`${row.date}T00:00:00`);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || !months.includes(date.getMonth() + 1)) continue;
    if (!pivotFormatMatches(row.format, format, separate)) continue;
    const who = String(row.who || '').toUpperCase().includes('TP') ? 'TP' : String(row.who || '').toUpperCase().includes('DC') ? 'DC' : '';
    if (!who) continue;
    const status = row.status || 'Pending';
    const reason = row.reason || 'ไม่ระบุสาเหตุ';
    const root = row.rootCause || 'ไม่ระบุ Root Cause';
    tree[who] ||= {};
    tree[who][status] ||= {};
    tree[who][status][reason] ||= { ...pivotMetric(months), roots: {} };
    tree[who][status][reason].roots[root] ||= pivotMetric(months);
    addPivotMetric(tree[who][status][reason], date.getMonth() + 1, row.amount);
    addPivotMetric(tree[who][status][reason].roots[root], date.getMonth() + 1, row.amount);
    addPivotMetric(grand, date.getMonth() + 1, row.amount);
    matchedRows += 1;
  }

  const monthNames = months.map((month) => new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2026, month - 1, 1)));
  $('#pivotHead').innerHTML = `<tr><th rowspan="2">Format: ${escapeHtml(format)}${format === 'MBC' && !separate ? ' (+FRANCHISE)' : ''}</th>${monthNames.map((name) => `<th colspan="2">${name}</th>`).join('')}<th rowspan="2">Total Case</th><th rowspan="2">Total Amount</th></tr><tr>${months.map(() => '<th>Case</th><th>Amount</th>').join('')}</tr>`;

  const body = [];
  let groupCounter = 0;
  for (const who of Object.keys(tree).sort()) {
    const whoMetric = mergePivotNodes(Object.values(tree[who]).flatMap((statuses) => Object.values(statuses)), months);
    body.push(pivotRow(who, whoMetric, months, 'pivot-who'));
    for (const status of Object.keys(tree[who]).sort()) {
      const statusMetric = mergePivotNodes(Object.values(tree[who][status]), months);
      body.push(pivotRow(`↳ ${status}`, statusMetric, months, 'pivot-status'));
      for (const reason of Object.keys(tree[who][status]).sort()) {
        const node = tree[who][status][reason];
        const groupId = `pivot-group-${groupCounter++}`;
        const toggle = Object.keys(node.roots).length ? `<button class="pivot-toggle" data-pivot-toggle="${groupId}">${state.pivotRootsExpanded ? '−' : '+'}</button>` : '';
        body.push(pivotRow(`${toggle}${escapeHtml(reason)}`, node, months, 'pivot-reason', true));
        for (const root of Object.keys(node.roots).sort()) {
          body.push(pivotRow(`– ${root}`, node.roots[root], months, 'pivot-root', false, groupId, !state.pivotRootsExpanded));
        }
      }
    }
  }
  body.push(pivotRow('Grand Total', grand, months, 'pivot-total'));
  $('#pivotBody').innerHTML = body.join('');
  $('#pivotNote').textContent = `${year} • ${monthValue === 'all' ? 'ทุกเดือน' : monthNames[0]} • ${matchedRows.toLocaleString()} รายการ • ${grand.totalCount.toLocaleString()} Cases • ${money(grand.totalAmount)} บาท`;
  $('#togglePivotRootsButton').textContent = state.pivotRootsExpanded ? 'Collapse Root Cause' : 'Expand Root Cause';
}

function pivotMetric(months) {
  return { totalCount: 0, totalAmount: 0, months: Object.fromEntries(months.map((month) => [month, { count: 0, amount: 0 }])) };
}

function addPivotMetric(metric, month, amount) {
  metric.totalCount += 1;
  metric.totalAmount += Number(amount || 0);
  metric.months[month].count += 1;
  metric.months[month].amount += Number(amount || 0);
}

function mergePivotNodes(nodes, months) {
  const metric = pivotMetric(months);
  for (const node of nodes) {
    metric.totalCount += node.totalCount;
    metric.totalAmount += node.totalAmount;
    months.forEach((month) => {
      metric.months[month].count += node.months[month]?.count || 0;
      metric.months[month].amount += node.months[month]?.amount || 0;
    });
  }
  return metric;
}

function pivotRow(label, metric, months, className, rawLabel = false, groupId = '', hidden = false) {
  const cells = months.map((month) => `<td>${metric.months[month]?.count ? metric.months[month].count.toLocaleString() : '-'}</td><td>${metric.months[month]?.amount ? money(metric.months[month].amount) : '-'}</td>`).join('');
  return `<tr class="${className}" ${groupId ? `data-pivot-group="${groupId}"` : ''} ${hidden ? 'hidden' : ''}><td>${rawLabel ? label : escapeHtml(label)}</td>${cells}<td>${metric.totalCount ? metric.totalCount.toLocaleString() : '-'}</td><td>${metric.totalAmount ? money(metric.totalAmount) : '-'}</td></tr>`;
}

function pivotFormatMatches(value, selected, separate) {
  const format = String(value || '').toUpperCase();
  const isFranchise = format.includes('FRANCHISE') || /(^|\W)FC($|\W)/.test(format) || format.includes('FCH');
  if (selected === 'HYPER') return format.includes('HYPER');
  if (selected === 'FRANCHISE') return separate && isFranchise;
  if (selected === 'MBC') return separate ? (format.includes('MBC') || format.includes('MINI')) && !isFranchise : format.includes('MBC') || format.includes('MINI') || isFranchise;
  return false;
}

function handlePivotToggle(event) {
  const button = event.target.closest('[data-pivot-toggle]');
  if (!button) return;
  const rows = $$(`[data-pivot-group="${button.dataset.pivotToggle}"]`);
  const shouldShow = rows.some((row) => row.hidden);
  rows.forEach((row) => { row.hidden = !shouldShow; });
  button.textContent = shouldShow ? '−' : '+';
}

function toggleAllPivotRoots() {
  state.pivotRootsExpanded = !state.pivotRootsExpanded;
  renderPivot();
}

function exportPivot() {
  const table = $('#pivotTable');
  if (!table || !$('#pivotBody').children.length) return toast('ยังไม่มี Pivot', 'โหลดข้อมูลก่อน Export', 'error');
  const clone = table.cloneNode(true);
  $$('tr[hidden]', clone).forEach((row) => { row.hidden = false; });
  $$('.pivot-toggle', clone).forEach((button) => button.remove());
  if (window.XLSX) {
    const workbook = XLSX.utils.table_to_book(clone, { sheet: 'Pivot' });
    XLSX.writeFile(workbook, `Pivot_${$('#pivotFormat').value}_${localIsoDate()}.xlsx`);
  } else {
    const rows = $$('tr', clone).map((row) => $$('th,td', row).map((cell) => csvCell(cell.textContent.trim())).join(','));
    downloadBlob(`Pivot_${localIsoDate()}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }
  toast('Export Pivot แล้ว', 'ไฟล์พร้อมดาวน์โหลด');
}

async function saveStoreMaster() {
  const records = parseDelimited($('#storeMasterPaste').value).filter((row) => row[0]).map((row) => ({ storeCode: row[0], storeName: row[1], formatType: row[2], storeType: row[3], check100: row[4] }));
  if (!records.length) return toast('ยังไม่มีข้อมูล', 'วางข้อมูล Store อย่างน้อย 1 แถว', 'error');
  setLoading(true, 'กำลังอัปเดต Master Store');
  try {
    const response = await api('/api/master/stores', { method: 'POST', body: { records } });
    $('#storeMasterPaste').value = '';
    toast('อัปเดต Master Store แล้ว', `เพิ่ม ${response.inserted} • แก้ไข ${response.updated}`);
  } catch (error) { toast('บันทึกไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

async function saveProductMaster() {
  const records = parseDelimited($('#productMasterPaste').value).filter((row) => row[0]).map((row) => ({ article: row[0], barcode: row[1], manageWeight: row[2], skuCost: row[3], segDescription: row[4], listEggs: row[5] }));
  if (!records.length) return toast('ยังไม่มีข้อมูล', 'วางข้อมูล Product อย่างน้อย 1 แถว', 'error');
  setLoading(true, 'กำลังอัปเดต Master Product');
  try {
    const response = await api('/api/master/products', { method: 'POST', body: { records } });
    $('#productMasterPaste').value = '';
    toast('อัปเดต Master Product แล้ว', `เพิ่ม ${response.inserted} • แก้ไข ${response.updated}`);
  } catch (error) { toast('บันทึกไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

async function scanMissingStores() {
  setLoading(true, 'กำลังสแกนสาขา');
  try {
    const response = await api('/api/master/stores/missing-from-claims');
    if (!response.missing.length) toast('Master Store ครบถ้วน', 'ไม่พบสาขาตกหล่น');
    else openForm({
      eyebrow: 'MISSING STORES', title: `พบ ${response.missing.length} สาขา`, submitText: 'ปิด',
      fields: [{ name: 'codes', label: 'Store Code ที่ไม่พบใน Master', type: 'textarea', value: response.missing.join('\n'), wide: true, readonly: true }],
      onSubmit: async () => {}
    });
  } catch (error) { toast('สแกนไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

async function loadUsers() {
  setLoading(true, 'กำลังโหลดผู้ใช้งาน');
  try {
    const response = await api('/api/users');
    $('#userBody').innerHTML = response.data.map((user) => `<tr><td><strong>${escapeHtml(user.username)}</strong></td><td><span class="badge ${user.role}">${escapeHtml(user.role)}</span></td><td>${escapeHtml(user.created_at)}</td><td><span class="badge accept">Active</span></td><td>${user.role === 'admin' ? '' : `<button class="icon-button" data-user-delete="${escapeAttr(user.username)}">×</button>`}</td></tr>`).join('');
  } catch (error) { toast('โหลดผู้ใช้ไม่สำเร็จ', error.message, 'error'); }
  finally { setLoading(false); }
}

function openAddUser() {
  openForm({
    eyebrow: 'USER ACCESS', title: 'เพิ่มผู้ใช้งาน', submitText: 'สร้างบัญชี',
    fields: [
      { name: 'username', label: 'Username', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'role', label: 'Role', type: 'select', options: ['user', 'admin'], required: true }
    ],
    onSubmit: async (data) => { await api('/api/users', { method: 'POST', body: data }); toast('สร้างบัญชีแล้ว', data.username); loadUsers(); }
  });
}

async function handleUserDelete(event) {
  const button = event.target.closest('[data-user-delete]');
  if (!button) return;
  const username = button.dataset.userDelete;
  if (!await confirmAction({ title: 'ลบบัญชีผู้ใช้?', message: username, confirmText: 'ลบบัญชี', danger: true })) return;
  try { await api(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' }); toast('ลบบัญชีแล้ว', username); loadUsers(); }
  catch (error) { toast('ลบไม่สำเร็จ', error.message, 'error'); }
}

function openChangePassword() {
  $('#profileMenu').hidden = true;
  openForm({
    eyebrow: 'SECURITY', title: 'เปลี่ยนรหัสผ่าน', submitText: 'บันทึกรหัสผ่าน',
    fields: [{ name: 'password', label: 'รหัสผ่านใหม่', type: 'password', required: true }, { name: 'confirm', label: 'ยืนยันรหัสผ่าน', type: 'password', required: true }],
    onSubmit: async (data) => {
      if (data.password !== data.confirm) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      await api('/api/users/me/password', { method: 'POST', body: { password: data.password } });
      toast('เปลี่ยนรหัสผ่านแล้ว', 'กรุณาใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไป');
    }
  });
}

function openForm({ eyebrow = 'FORM', title, submitText = 'บันทึก', fields, onSubmit }) {
  $('#formEyebrow').textContent = eyebrow;
  $('#formTitle').textContent = title;
  $('#formSubmitButton').textContent = submitText;
  $('#formFields').innerHTML = fields.map((field) => {
    const attrs = `${field.required ? 'required' : ''} ${field.readonly ? 'readonly' : ''}`;
    let control;
    if (field.type === 'select') control = `<select name="${escapeAttr(field.name)}" ${attrs}>${(field.options || []).map((option) => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join('')}</select>`;
    else if (field.type === 'textarea') control = `<textarea name="${escapeAttr(field.name)}" rows="8" ${attrs}>${escapeHtml(field.value || '')}</textarea>`;
    else control = `<input name="${escapeAttr(field.name)}" type="${escapeAttr(field.type || 'text')}" value="${escapeAttr(field.value || '')}" ${attrs}>`;
    return `<label class="field ${field.wide ? 'field-wide' : ''}"><span>${escapeHtml(field.label)}</span>${control}</label>`;
  }).join('');
  state.formSubmit = onSubmit;
  $('#formDialog').showModal();
  setTimeout(() => $('#formFields input, #formFields select, #formFields textarea')?.focus(), 50);
}

async function submitDynamicForm(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const button = $('#formSubmitButton'); button.disabled = true;
  try {
    await state.formSubmit?.(data);
    $('#formDialog').close('confirm');
  } catch (error) { toast('ดำเนินการไม่สำเร็จ', error.message, 'error'); }
  finally { button.disabled = false; }
}

function confirmAction({ title, message, confirmText = 'ยืนยัน', danger = false }) {
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmAction').textContent = confirmText;
  $('#confirmAction').className = `button ${danger ? 'danger' : 'primary'}`;
  $('#confirmIcon').textContent = danger ? '!' : '?';
  const dialog = $('#confirmDialog');
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

async function api(path, options = {}) {
  const request = { credentials: 'same-origin', method: options.method || 'GET', headers: {} };
  if (options.body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, request);
  let payload;
  try { payload = await response.json(); } catch { payload = { message: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง' }; }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') { state.user = null; showLogin(); }
    const error = new Error(payload.message || `HTTP ${response.status}`);
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function setLoading(show, text = 'กำลังประมวลผล') {
  $('#loadingText').textContent = text;
  $('#loadingOverlay').hidden = !show;
}

function toast(title, message = '', type = 'success', duration = 4200) {
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `<i>${type === 'error' ? '!' : '✓'}</i><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  $('#toastStack').append(element);
  setTimeout(() => element.remove(), duration);
}

function fillSelect(selector, options) {
  const select = $(selector);
  select.insertAdjacentHTML('beforeend', options.map((option) => {
    const value = typeof option === 'object' ? option.value : option;
    const label = typeof option === 'object' ? option.label : option;
    return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
  }).join(''));
}

function parseDelimited(text) {
  return String(text || '').trim().split(/\r?\n/).map((line) => line.includes('\t') ? line.split('\t') : parseCsvLine(line));
}

function parseCsvLine(line) {
  const result = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { result.push(value.trim()); value = ''; }
    else value += char;
  }
  result.push(value.trim());
  return result;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : localIsoDate(date);
}

function localIsoDate(date = new Date()) {
  const offset = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offset.toISOString().slice(0, 10);
}

function formatForStore(code, fallback = '') {
  if (String(code).startsWith('1')) return 'HYPER';
  if (String(code).startsWith('2')) return 'MBC';
  if (String(code).startsWith('3')) return 'FRANCHISE';
  return String(fallback || '').toUpperCase();
}

function claimPrefix(type) { return type === 'HYPER' ? 'HYP' : type === 'MBC' ? 'MBC' : type === 'FRANCHISE' ? 'FC' : String(type || '').slice(0, 3).toUpperCase(); }
function claimDateKey(value) { const iso = normalizeDate(value); if (!iso) return ''; const [year, month, day] = iso.split('-'); return `${day}${month}${year.slice(-2)}`; }
function sanitizePallet(value) { const clean = String(value || '').replace(/80000000/g, '').replace(/[,:]/g, '').trim(); return clean.length > 9 ? clean.slice(-9) : clean; }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function parseNumber(value) { const number = Number.parseFloat(String(value ?? '').replace(/,/g, '')); return Number.isFinite(number) ? number : NaN; }
function roundMoney(value) { return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0; }
function money(value) { return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function displayValue(value) { return value === '' || value === null || value === undefined ? '-' : String(value); }
function baseInputType(field) { return ['receivedDate', 'reportedDate'].includes(field) ? 'date' : ['sentQty', 'receivedQty', 'claimQty'].includes(field) ? 'number' : 'text'; }
function latestGroupDate(group) { return group.rows.map((row) => row.updatedAt || row.createdAt || row.replyDate || '').sort().at(-1) || '-'; }
function formatThaiDate(value) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(date); }
function badge(status) { const value = String(status || 'Pending'); return `<span class="badge ${value.toLowerCase()}">${escapeHtml(value)}</span>`; }
function setStep(active) { $$('.step').forEach((step) => { const number = Number(step.dataset.step); step.classList.toggle('active', number === active); step.classList.toggle('done', number < active); }); }
function togglePassword(input) { input.type = input.type === 'password' ? 'text' : 'password'; }
function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function downloadBlob(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
