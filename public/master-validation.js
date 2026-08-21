const VALIDATION_LOOKUP_CHUNK = 40;
const MASTER_UPLOAD_CHUNK = 20;
const MASTER_COLUMN_COUNT = 63;
const MASTER_HEADER_CHECKS = [
  [0, 'ARTICLE', 'A'], [3, 'BARCODE', 'D'], [4, 'DESCRIPTION', 'E'],
  [11, 'MANAGE_WEIGHT', 'L'], [35, 'ITEM_VALUE', 'AJ'], [39, 'SEG_DESCRIPTION', 'AN']
];
const RESULT_HEADERS = ['Who Accept','Result','Remark','Transport No.','ทะเบียนรถ','ชื่อพนักงานขับรถ','Claim date','Claim No.'];

let validationContext = null;
let masterRows = [];
let masterFile = null;
let masterSheetName = '';
let masterUploading = false;

install();

function install() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else installUi();
}

function installUi() {
  installStyles();
  installValidationNav();
  installValidationView();
  installMasterArticlePanel();
  bindValidationEvents();
  bindMasterEvents();
}

function installStyles() {
  if (document.querySelector('link[data-master-validation]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/master-validation.css';
  link.dataset.masterValidation = 'true';
  document.head.appendChild(link);
}

function installValidationNav() {
  if (document.querySelector('[data-view="validation"]')) return;
  const reference = document.querySelector('[data-view="references"]');
  if (!reference) return;
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.view = 'validation';
  button.innerHTML = '<span class="nav-icon">✓</span><span>Validation</span>';
  reference.parentNode.insertBefore(button, reference);
}

function installValidationView() {
  if (document.getElementById('view-validation')) return;
  const workspace = document.querySelector('.workspace');
  const claims = document.getElementById('view-claims');
  if (!workspace) return;
  const section = document.createElement('section');
  section.className = 'view';
  section.id = 'view-validation';
  section.dataset.title = 'Validation';
  section.dataset.eyebrow = 'RUN VALIDATION';
  section.innerHTML = `
    <div class="page-intro compact-intro">
      <div><span class="section-kicker">CLAIM CCD VALIDATION</span><h1>RunValidation</h1><p>ทำงานตาม Macro เดิม: เทียบคอลัมน์ E + O ของไฟล์ตรวจสอบกับ Article + Reference_No. ใน Claim Center แล้วแยก Valid / No Valid</p></div>
      <button class="button success" id="validationDownloadButton" hidden>⇩ Download Result</button>
    </div>
    <div class="validation-grid">
      <section class="panel">
        <div class="panel-heading"><div class="heading-icon violet">01</div><div><h3>เลือกไฟล์สำหรับตรวจสอบ</h3><p>รองรับ .xlsx / .xlsm / .xls ตามรูปแบบ RunValidation เดิม</p></div></div>
        <label class="validation-drop" id="validationDrop">
          <input type="file" id="validationFile" accept=".xlsx,.xlsm,.xls" hidden>
          <div><span class="upload-symbol">⇧</span><strong>Drop Excel here or browse</strong><small>ระบบอ่านข้อมูลตั้งแต่แถว 10 และใช้ E + O เป็น Key</small></div>
        </label>
        <div class="master-article-meta" id="validationFileMeta" hidden>
          <div class="mini-stat"><span>FILE</span><strong class="validation-file-name" id="validationFileName">–</strong></div>
          <div class="mini-stat"><span>ROWS</span><strong id="validationRows">0</strong></div>
          <div class="mini-stat"><span>KEY</span><strong>E + O</strong></div>
          <div class="mini-stat"><span>DATABASE</span><strong>Claim D1</strong></div>
        </div>
        <div class="master-article-actions" style="margin-top:16px"><button class="button primary" id="validationRunButton" disabled>เริ่มตรวจสอบ</button></div>
      </section>
      <section class="panel">
        <div class="panel-heading"><div class="heading-icon blue">02</div><div><h3>Logic เดิมที่รักษาไว้</h3><p>เปลี่ยนเฉพาะแหล่ง Database จากไฟล์ Network เป็น D1</p></div></div>
        <div class="validation-rule-list">
          <div class="validation-rule"><b>✓</b><span>Source E = Article และ Source O = Reference</span></div>
          <div class="validation-rule"><b>✓</b><span>พบคู่ Article + Reference → DC Accept / Valid / Process ในระบบได้</span></div>
          <div class="validation-rule"><b>✓</b><span>คืน Transport No., ทะเบียนรถ, Driver, Claim date และ Claim No.</span></div>
          <div class="validation-rule"><b>✓</b><span>ไม่พบ → No Accept / No Valid พร้อมเหตุผลเหมือน Macro เดิม</span></div>
          <div class="validation-rule"><b>✓</b><span>Export เป็น 2 Sheet: Valid และ No Valid พร้อมหัว Q:X</span></div>
        </div>
      </section>
    </div>
    <section class="panel validation-results" id="validationResults" hidden>
      <div class="panel-heading"><div class="heading-icon blue">✓</div><div><h3>ผลการตรวจสอบ</h3><div class="validation-result-badges"><span class="result-pill valid" id="validationValidBadge">Valid 0</span><span class="result-pill invalid" id="validationInvalidBadge">No Valid 0</span></div></div></div>
      <div class="data-table-wrap"><table class="data-table validation-preview-table"><thead><tr><th>#</th><th>Article (E)</th><th>Reference (O)</th><th>Result</th><th>Transport No.</th><th>Claim No.</th></tr></thead><tbody id="validationPreviewBody"></tbody></table></div>
    </section>`;
  workspace.insertBefore(section, claims || workspace.firstChild);
}

function installMasterArticlePanel() {
  const masters = document.getElementById('view-masters');
  if (!masters || document.getElementById('masterArticleCard')) return;
  const legacy = document.getElementById('productMasterPaste')?.closest('.master-card');
  if (legacy) legacy.classList.add('legacy-product-master-hidden');
  const grid = masters.querySelector('.master-grid');
  if (!grid) return;
  const card = document.createElement('section');
  card.className = 'panel master-card master-article-card';
  card.id = 'masterArticleCard';
  card.innerHTML = `
    <div class="panel-heading"><div class="heading-icon violet">A</div><div><h3>Master Article — Weekly Replace</h3><p>อัปโหลด MasterArticle ตามโครง Claim CCD ทุกวันจันทร์ ราคาจาก AJ = ITEM_VALUE จะใช้คำนวณ Amount Claim</p></div><span class="mode-badge">A:BK</span></div>
    <div class="master-article-grid">
      <div>
        <label class="master-article-drop" id="masterArticleDrop">
          <input type="file" id="masterArticleFile" accept=".xlsx,.xlsm,.xls,.csv" hidden>
          <div><span class="upload-symbol">⇧</span><strong>เลือกไฟล์ Master Article</strong><small>ตรวจ A=ARTICLE · D=BARCODE · L=MANAGE_WEIGHT · AJ=ITEM_VALUE · AN=SEG_DESCRIPTION</small></div>
        </label>
        <div class="master-article-meta" id="masterArticleFileMeta" hidden>
          <div class="mini-stat"><span>FILE</span><strong class="validation-file-name" id="masterArticleFileName">–</strong></div>
          <div class="mini-stat"><span>ARTICLES</span><strong id="masterArticleRows">0</strong></div>
          <div class="mini-stat"><span>WITH PRICE</span><strong id="masterArticlePriced">0</strong></div>
          <div class="mini-stat"><span>SHEET</span><strong id="masterArticleSheet">–</strong></div>
        </div>
      </div>
      <div>
        <div class="master-weekly-note"><strong>Weekly policy</strong><br>แนะนำให้อัปโหลดทุกวันจันทร์ ระบบจะเก็บ Master เดิมไว้จนไฟล์ใหม่อัปโหลดครบและตรวจผ่าน จากนั้นจึง Replace ทั้งชุด</div>
        <div class="master-status-line" style="margin-top:16px"><i class="master-status-dot" id="masterStatusDot"></i><div><strong id="masterStatusTitle">กำลังตรวจสถานะ Master…</strong><div class="muted" id="masterStatusDetail"></div></div></div>
        <div class="master-article-progress"><i id="masterArticleProgress"></i></div>
        <div class="muted" id="masterArticleProgressText">ยังไม่ได้เลือกไฟล์</div>
        <div class="master-article-actions" style="margin-top:16px"><button class="button ghost" id="masterArticleRefreshButton">↻ Refresh</button><button class="button primary" id="masterArticleUploadButton" disabled>Replace Master Article</button></div>
      </div>
    </div>`;
  grid.appendChild(card);
}

function bindValidationEvents() {
  const input = document.getElementById('validationFile');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('change', () => loadValidationFile(input.files?.[0]));
  document.getElementById('validationRunButton')?.addEventListener('click', runValidation);
  document.getElementById('validationDownloadButton')?.addEventListener('click', downloadValidationResult);
  bindDropzone('validationDrop', (file) => loadValidationFile(file));
}

function bindMasterEvents() {
  const input = document.getElementById('masterArticleFile');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('change', () => loadMasterArticleFile(input.files?.[0]));
  document.getElementById('masterArticleUploadButton')?.addEventListener('click', uploadMasterArticle);
  document.getElementById('masterArticleRefreshButton')?.addEventListener('click', loadMasterStatus);
  bindDropzone('masterArticleDrop', (file) => loadMasterArticleFile(file));
  loadMasterStatus();
}

function bindDropzone(id, handler) {
  const zone = document.getElementById(id);
  if (!zone || zone.dataset.dropBound) return;
  zone.dataset.dropBound = '1';
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('dragging'); handler(event.dataTransfer?.files?.[0]); });
}

async function loadValidationFile(file) {
  if (!file) return;
  if (!window.XLSX) return notice('Excel engine ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่', true);
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    let last = -1;
    for (let index = 9; index < rows.length; index += 1) if (String(rows[index]?.[14] ?? '').trim()) last = index;
    if (last < 9) throw new Error('ไม่พบข้อมูลตั้งแต่แถว 10 ในคอลัมน์ O');
    const dataRows = rows.slice(9, last + 1);
    validationContext = { file, workbook, sheet, sheetName, allRows: rows, dataRows, resultRows: null };
    text('validationFileName', file.name);
    text('validationRows', dataRows.length.toLocaleString('th-TH'));
    document.getElementById('validationFileMeta').hidden = false;
    document.getElementById('validationRunButton').disabled = false;
    document.getElementById('validationResults').hidden = true;
    document.getElementById('validationDownloadButton').hidden = true;
  } catch (error) { notice(`อ่านไฟล์ Validation ไม่สำเร็จ: ${error.message}`, true); }
}

async function runValidation() {
  if (!validationContext) return;
  const button = document.getElementById('validationRunButton');
  button.disabled = true;
  button.textContent = 'กำลังตรวจสอบ…';
  try {
    const pairs = validationContext.dataRows.map((row) => ({ article: cleanArticle(row[4]), reference: clean(row[14]) }));
    const uniquePairs = [];
    const seen = new Set();
    for (const pair of pairs) {
      if (!pair.article && !pair.reference) continue;
      const key = vKey(pair.article, pair.reference);
      if (!seen.has(key)) { seen.add(key); uniquePairs.push(pair); }
    }
    const matches = {};
    for (let offset = 0; offset < uniquePairs.length; offset += VALIDATION_LOOKUP_CHUNK) {
      const body = await apiFetch('/api/validation/lookup', { method: 'POST', body: { pairs: uniquePairs.slice(offset, offset + VALIDATION_LOOKUP_CHUNK) } });
      Object.assign(matches, body.data || {});
    }
    let valid = 0, invalid = 0;
    const results = validationContext.dataRows.map((row, index) => {
      const article = cleanArticle(row[4]);
      const reference = clean(row[14]);
      const match = matches[vKey(article, reference)] || null;
      if (match) valid += 1; else invalid += 1;
      return { sourceIndex: index + 9, row, article, reference, match };
    });
    validationContext.resultRows = results;
    text('validationValidBadge', `Valid ${valid.toLocaleString('th-TH')}`);
    text('validationInvalidBadge', `No Valid ${invalid.toLocaleString('th-TH')}`);
    document.getElementById('validationPreviewBody').innerHTML = results.slice(0, 20).map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.article)}</td><td>${esc(item.reference)}</td><td>${item.match ? '<span class="result-pill valid">Valid</span>' : '<span class="result-pill invalid">No Valid</span>'}</td><td>${esc(item.match?.transportNo || '-')}</td><td>${esc(item.match?.claimNo || '-')}</td></tr>`).join('');
    document.getElementById('validationResults').hidden = false;
    document.getElementById('validationDownloadButton').hidden = false;
    notice(`Validation เสร็จแล้ว: Valid ${valid.toLocaleString('th-TH')} / No Valid ${invalid.toLocaleString('th-TH')}`);
  } catch (error) { notice(`Validation ไม่สำเร็จ: ${error.message}`, true); }
  finally { button.disabled = false; button.textContent = 'เริ่มตรวจสอบ'; }
}

function downloadValidationResult() {
  if (!validationContext?.resultRows || !window.XLSX) return;
  const valid = validationContext.resultRows.filter((item) => item.match);
  const invalid = validationContext.resultRows.filter((item) => !item.match);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildValidationSheet(valid, true), 'Valid');
  XLSX.utils.book_append_sheet(wb, buildValidationSheet(invalid, false), 'No Valid');
  const base = validationContext.file.name.replace(/\.[^.]+$/, '');
  XLSX.writeFile(wb, `${base}_Validation.xlsx`);
}

function buildValidationSheet(items, isValid) {
  const src = validationContext.sheet;
  const dst = {};
  const srcRange = XLSX.utils.decode_range(src['!ref'] || 'A1:X10');
  const maxCol = Math.max(srcRange.e.c, 23);
  for (let r = 0; r < 9; r += 1) cloneSourceRow(src, dst, r, r, maxCol);
  RESULT_HEADERS.forEach((value, index) => {
    const addr = XLSX.utils.encode_cell({ r: 8, c: 16 + index });
    dst[addr] = { t: 's', v: value, s: { font: { bold: true }, fill: { fgColor: { rgb: 'C8E6FF' } } } };
  });
  items.forEach((item, index) => {
    const targetRow = 9 + index;
    cloneSourceRow(src, dst, item.sourceIndex, targetRow, maxCol);
    const values = item.match
      ? ['DC Accept','Valid','Process ในระบบได้',item.match.transportNo,item.match.vehicleNo,item.match.driver,item.match.claimDate,item.match.claimNo]
      : ['No Accept','No Valid','เลข Reference ไม่สามารถตรวจสอบได้ / ไม่สอดคล้องกับรายการเคลม','-','-','-','-','-'];
    values.forEach((value, col) => { dst[XLSX.utils.encode_cell({ r: targetRow, c: 16 + col })] = { t: 's', v: String(value ?? '') }; });
  });
  dst['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(8, 8 + items.length), c: maxCol } });
  if (src['!cols']) dst['!cols'] = structuredCloneSafe(src['!cols']);
  if (src['!rows']) dst['!rows'] = structuredCloneSafe(src['!rows'].slice(0, 9));
  if (src['!merges']) dst['!merges'] = structuredCloneSafe(src['!merges'].filter((merge) => merge.e.r < 9));
  return dst;
}

function cloneSourceRow(src, dst, srcRow, dstRow, maxCol) {
  for (let c = 0; c <= maxCol; c += 1) {
    const source = src[XLSX.utils.encode_cell({ r: srcRow, c })];
    if (!source) continue;
    dst[XLSX.utils.encode_cell({ r: dstRow, c })] = structuredCloneSafe(source);
  }
}

async function loadMasterArticleFile(file) {
  if (!file || masterUploading) return;
  if (!window.XLSX) return notice('Excel engine ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่', true);
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    masterSheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'masterarticle') || workbook.SheetNames[0];
    if (!masterSheetName) throw new Error('ไม่พบ Sheet MasterArticle');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[masterSheetName], { header: 1, raw: true, defval: '', blankrows: false });
    const headers = rows[0] || [];
    validateMasterHeaders(headers);
    masterRows = rows.slice(1).filter((row) => cleanArticle(row[0])).map((row) => Array.from({ length: MASTER_COLUMN_COUNT }, (_, index) => row[index] ?? ''));
    if (!masterRows.length) throw new Error('ไม่พบ ARTICLE ในไฟล์');
    masterFile = file;
    const priced = masterRows.filter((row) => number(row[35]) > 0).length;
    text('masterArticleFileName', file.name);
    text('masterArticleRows', masterRows.length.toLocaleString('th-TH'));
    text('masterArticlePriced', priced.toLocaleString('th-TH'));
    text('masterArticleSheet', masterSheetName);
    document.getElementById('masterArticleFileMeta').hidden = false;
    document.getElementById('masterArticleUploadButton').disabled = false;
    setMasterProgress(0, `พร้อม Replace ${masterRows.length.toLocaleString('th-TH')} Article`);
  } catch (error) {
    masterRows = []; masterFile = null;
    document.getElementById('masterArticleUploadButton').disabled = true;
    notice(`MasterArticle ไม่ผ่านการตรวจสอบ: ${error.message}`, true);
  }
}

function validateMasterHeaders(headers) {
  const errors = [];
  for (const [index, expected, column] of MASTER_HEADER_CHECKS) {
    const actual = clean(headers[index]).toUpperCase();
    if (actual !== expected) errors.push(`${column} ต้องเป็น ${expected} แต่พบ ${actual || 'ว่าง'}`);
  }
  if (errors.length) throw new Error(errors.join(' • '));
}

async function uploadMasterArticle() {
  if (!masterFile || !masterRows.length || masterUploading) return;
  if (!confirm(`ยืนยัน Replace Master Article ด้วยไฟล์ ${masterFile.name}\nจำนวน ${masterRows.length.toLocaleString('th-TH')} Article?\n\nMaster เดิมจะถูกแทนหลังไฟล์ใหม่อัปโหลดครบและตรวจผ่านเท่านั้น`)) return;
  masterUploading = true;
  const button = document.getElementById('masterArticleUploadButton');
  button.disabled = true;
  button.textContent = 'กำลังอัปโหลด…';
  let batchId = '';
  try {
    const start = await apiFetch('/api/master-article/start', {
      method: 'POST', body: { fileName: masterFile.name, sheetName: masterSheetName, totalRows: masterRows.length, headers: MASTER_HEADER_CHECKS.reduce((arr,[idx,name]) => { arr[idx]=name; return arr; }, []) }
    });
    batchId = start.batchId;
    for (let offset = 0; offset < masterRows.length; offset += MASTER_UPLOAD_CHUNK) {
      const chunk = masterRows.slice(offset, offset + MASTER_UPLOAD_CHUNK);
      await apiFetch('/api/master-article/chunk', { method: 'POST', body: { batchId, rows: chunk } });
      const processed = Math.min(masterRows.length, offset + chunk.length);
      setMasterProgress((processed / masterRows.length) * 100, `อัปโหลด ${processed.toLocaleString('th-TH')} / ${masterRows.length.toLocaleString('th-TH')} Article`);
    }
    const done = await apiFetch('/api/master-article/finalize', { method: 'POST', body: { batchId } });
    setMasterProgress(100, `Active แล้ว ${done.articleCount.toLocaleString('th-TH')} Article · มีราคา ${done.pricedCount.toLocaleString('th-TH')}`);
    notice(`Replace Master Article สำเร็จ ${done.articleCount.toLocaleString('th-TH')} รายการ`);
    await loadMasterStatus();
  } catch (error) {
    if (batchId) { try { await apiFetch('/api/master-article/abort', { method: 'POST', body: { batchId } }); } catch {} }
    notice(`อัปโหลด MasterArticle ไม่สำเร็จ: ${error.message} — Master เดิมยังไม่ถูกเปลี่ยน`, true);
  } finally {
    masterUploading = false;
    button.disabled = !masterRows.length;
    button.textContent = 'Replace Master Article';
  }
}

async function loadMasterStatus() {
  const title = document.getElementById('masterStatusTitle');
  if (!title) return;
  try {
    const response = await apiFetch('/api/master-article/status');
    const data = response.data || {};
    const dot = document.getElementById('masterStatusDot');
    if (!data.active) {
      dot.className = 'master-status-dot warn';
      text('masterStatusTitle', 'ยังไม่มี Master Article Active');
      text('masterStatusDetail', 'อัปโหลดไฟล์ MasterArticle ก่อนเริ่มคำนวณราคาจาก ITEM_VALUE');
      return;
    }
    dot.className = 'master-status-dot ok';
    text('masterStatusTitle', `${Number(data.articleCount || 0).toLocaleString('th-TH')} Articles Active`);
    const monday = nextMondayLabel(data.activatedAt);
    text('masterStatusDetail', `${data.sourceFile || 'MasterArticle'} · ราคา ${Number(data.pricedCount || 0).toLocaleString('th-TH')} รายการ · อัปโหลดโดย ${data.createdBy || '-'} · ${monday}`);
  } catch (error) {
    text('masterStatusTitle', 'โหลดสถานะ Master ไม่สำเร็จ');
    text('masterStatusDetail', error.message);
  }
}

function nextMondayLabel(activatedAt) {
  if (!activatedAt) return 'รอบแนะนำ: ทุกวันจันทร์';
  const d = new Date(activatedAt.replace(' ', 'T') + '+07:00');
  if (Number.isNaN(d.getTime())) return 'รอบแนะนำ: ทุกวันจันทร์';
  const next = new Date(d);
  const add = ((8 - next.getDay()) % 7) || 7;
  next.setDate(next.getDate() + add);
  return `รอบถัดไป ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(next)}`;
}

function setMasterProgress(percent, message) {
  const bar = document.getElementById('masterArticleProgress');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  text('masterArticleProgressText', message);
}

async function apiFetch(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload.message || `HTTP ${response.status}`);
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function clean(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function cleanArticle(value) { return clean(value).replace(/'/g, ''); }
function number(value) { const parsed = Number.parseFloat(clean(value).replace(/,/g,'')); return Number.isFinite(parsed) ? parsed : 0; }
function vKey(article, reference) { return `${cleanArticle(article).toLowerCase()}|${clean(reference).toLowerCase()}`; }
function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function esc(value) { return clean(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char])); }
function structuredCloneSafe(value) { try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); } }
function notice(message, isError = false) {
  const stack = document.getElementById('toastStack');
  if (!stack) { alert(message); return; }
  const item = document.createElement('div');
  item.className = `toast ${isError ? 'error' : ''}`;
  item.innerHTML = `<strong>${isError ? 'เกิดข้อผิดพลาด' : 'สำเร็จ'}</strong><span>${esc(message)}</span>`;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 6000);
}
