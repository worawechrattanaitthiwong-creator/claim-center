(() => {
  const CHUNK_SIZE = 40;
  let parsedRows = [];
  let selectedFile = null;
  let sheetName = '';
  let stopRequested = false;
  let importing = false;

  document.addEventListener('DOMContentLoaded', installHistoryImport, { once: true });

  function installHistoryImport() {
    installNav();
    installView();
    bindEvents();
  }

  function installNav() {
    const admin = document.getElementById('adminNav');
    if (!admin || document.querySelector('[data-view="history"]')) return;
    const users = admin.querySelector('[data-view="users"]');
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.dataset.view = 'history';
    button.id = 'historyNav';
    button.innerHTML = '<span class="nav-icon">⇧</span><span>นำเข้าข้อมูลเก่า</span>';
    admin.insertBefore(button, users || null);
  }

  function installView() {
    const workspace = document.querySelector('.workspace');
    if (!workspace || document.getElementById('view-history')) return;
    const users = document.getElementById('view-users');
    const section = document.createElement('section');
    section.className = 'view history-import-view';
    section.id = 'view-history';
    section.dataset.title = 'นำเข้าข้อมูลเก่า';
    section.dataset.eyebrow = 'DATA MIGRATION';
    section.innerHTML = `
      <div class="page-intro compact-intro history-heading">
        <div><span class="section-kicker">CLAIM CCD MIGRATION</span><h1>Historical Data Import</h1><p>นำข้อมูลเก่าจาก Claim CCD.xlsm / Excel / CSV เข้า D1 โดยรักษาลำดับ A:AQ, Claim No., Reference, User, Unique Key, Month และ Year เดิม</p></div>
        <div class="history-db-status" id="historyDbStatus"><span>DATABASE</span><strong>Loading…</strong></div>
      </div>

      <div class="history-grid">
        <section class="panel history-upload-card">
          <div class="panel-heading"><div class="heading-icon blue">01</div><div><h3>เลือกไฟล์ต้นฉบับ</h3><p>ระบบจะอ่าน Sheet “Claim All BU” ก่อน หากไม่พบจะใช้ Sheet แรก</p></div></div>
          <label class="history-dropzone" id="historyDropzone">
            <input type="file" id="historyFile" accept=".xlsx,.xlsm,.xls,.csv" hidden>
            <span class="history-upload-icon">⇧</span>
            <strong>Drop Excel here or browse</strong>
            <small>.xlsm, .xlsx, .xls, .csv · โครงสร้าง A:AQ 43 คอลัมน์</small>
          </label>
          <div class="history-file-meta" id="historyFileMeta" hidden>
            <div><span>FILE</span><strong id="historyFileName">–</strong></div>
            <div><span>SHEET</span><strong id="historySheetName">–</strong></div>
            <div><span>ROWS</span><strong id="historyRowCount">0</strong></div>
            <div><span>SCHEMA</span><strong id="historySchemaStatus">Checking</strong></div>
          </div>
        </section>

        <section class="panel history-policy-card">
          <div class="panel-heading"><div class="heading-icon violet">02</div><div><h3>นโยบายการนำเข้า</h3><p>ข้อมูลย้อนหลังแนะนำให้เก็บเป็น Archive เพื่อไม่ชนเคสปัจจุบัน</p></div></div>
          <div class="history-policy-body">
            <label class="history-switch"><input type="checkbox" id="historyArchive" checked><span></span><div><strong>Import as Archive</strong><small>ค้นหาได้ แต่ไม่แสดงใน Recent Claims ถ้าไม่ได้ค้นหา</small></div></label>
            <div class="history-rule"><i>✓</i><span>รักษา Claim No. / Reference No. เดิม ไม่สร้างเลขใหม่</span></div>
            <div class="history-rule"><i>✓</i><span>Skip รายการที่ Transport + Article มีอยู่แล้ว</span></div>
            <div class="history-rule"><i>✓</i><span>Sync Running Number เพื่อให้รายการใหม่ต่อเลขจากประวัติ</span></div>
            <div class="history-rule"><i>✓</i><span>Resume ได้จากจุดล่าสุดถ้า Browser, Network หรือ Safety Budget หยุดกลางทาง</span></div>
          </div>
        </section>
      </div>

      <section class="panel history-preview-card" id="historyPreviewCard" hidden>
        <div class="history-preview-head"><div><span class="section-kicker">VALIDATION PREVIEW</span><h3>ตรวจโครงสร้างก่อน Import</h3></div><span id="historyResumeBadge" class="history-resume-badge" hidden>Resume available</span></div>
        <div class="data-table-wrap"><table class="data-table history-preview-table"><thead><tr><th>#</th><th>Store</th><th>Transport</th><th>Article</th><th>Ship Date</th><th>Status</th><th>WHO</th><th>Claim No.</th><th>Reference</th><th>User</th></tr></thead><tbody id="historyPreviewBody"></tbody></table></div>
        <div class="history-import-footer">
          <div class="history-import-copy"><strong id="historyReadyText">พร้อมนำเข้า</strong><span>UI ประมวลผลชุดละ 40 แถว และ Safety Adapter จะแบ่งส่ง Worker จริงไม่เกิน 15 แถว/request พร้อม checkpoint ทุกชุด</span></div>
          <div class="history-import-actions"><button class="button ghost" id="historyClearButton">เปลี่ยนไฟล์</button><button class="button primary" id="historyImportButton">เริ่ม Import</button></div>
        </div>
      </section>

      <section class="panel history-progress-card" id="historyProgressCard" hidden>
        <div class="history-progress-top"><div><span class="section-kicker">IMPORT RUNNING</span><h3 id="historyProgressTitle">กำลังนำเข้าข้อมูล…</h3></div><strong id="historyProgressPercent">0%</strong></div>
        <div class="history-progress-track"><i id="historyProgressBar"></i></div>
        <div class="history-progress-stats">
          <div><span>Processed</span><strong id="historyProcessed">0</strong></div>
          <div><span>Imported</span><strong id="historyImported">0</strong></div>
          <div><span>Skipped</span><strong id="historySkipped">0</strong></div>
          <div><span>Rejected</span><strong id="historyRejected">0</strong></div>
        </div>
        <div class="history-progress-log" id="historyProgressLog"></div>
        <div class="history-progress-actions"><button class="button ghost" id="historyStopButton">หยุดหลังจบชุดนี้</button></div>
      </section>

      <section class="panel history-info-card">
        <div><span class="history-info-icon">i</span><div><strong>Compatibility contract</strong><p>Importer นี้ยึด Claim CCD.xlsm A:AQ = 43 คอลัมน์เป็น Source of Truth และเก็บ metadata ของเว็บแยกจากลำดับไฟล์ จึงสามารถต่อข้อมูลเก่ากับ Export ใหม่ได้โดยคอลัมน์ไม่เลื่อน</p></div></div>
      </section>
    `;
    workspace.insertBefore(section, users || null);
  }

  function bindEvents() {
    const nav = document.getElementById('historyNav');
    nav?.addEventListener('click', () => setTimeout(loadStats, 0));
    const input = document.getElementById('historyFile');
    input?.addEventListener('change', () => handleFile(input.files?.[0]));
    const dropzone = document.getElementById('historyDropzone');
    dropzone?.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
    dropzone?.addEventListener('drop', (event) => {
      event.preventDefault(); dropzone.classList.remove('dragging'); handleFile(event.dataTransfer?.files?.[0]);
    });
    document.getElementById('historyClearButton')?.addEventListener('click', clearFile);
    document.getElementById('historyImportButton')?.addEventListener('click', startImport);
    document.getElementById('historyStopButton')?.addEventListener('click', () => {
      stopRequested = true;
      document.getElementById('historyStopButton').disabled = true;
      document.getElementById('historyStopButton').textContent = 'กำลังหยุด…';
    });
  }

  async function handleFile(file) {
    if (!file || importing) return;
    if (!window.XLSX) return notify('ไม่พบ Excel engine', 'กรุณารีเฟรชหน้าแล้วลองใหม่', 'error');
    selectedFile = file;
    parsedRows = [];
    setFileBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', dense: true, cellDates: false });
      sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'claim all bu') || workbook.SheetNames[0];
      if (!sheetName) throw new Error('ไม่พบ Sheet ในไฟล์');
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '', blankrows: false });
      const headerIndex = findHeaderRow(rows);
      const start = headerIndex >= 0 ? headerIndex + 1 : 0;
      parsedRows = rows.slice(start)
        .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()))
        .map((row) => Array.from({ length: 43 }, (_, index) => row[index] ?? ''))
        .filter((row) => String(row[5] ?? '').trim() || String(row[12] ?? '').trim());
      if (!parsedRows.length) throw new Error('ไม่พบข้อมูล Claim หลังหัวตาราง');
      renderFileMeta(headerIndex);
      renderPreview();
      updateResumeState();
      document.getElementById('historyPreviewCard').hidden = false;
    } catch (error) {
      clearFile(false);
      notify('อ่านไฟล์ไม่สำเร็จ', error.message, 'error');
    } finally {
      setFileBusy(false);
    }
  }

  function findHeaderRow(rows) {
    const max = Math.min(30, rows.length);
    for (let index = 0; index < max; index += 1) {
      const row = rows[index] || [];
      const a = String(row[0] ?? '').trim().toLowerCase();
      const y = String(row[24] ?? '').trim().toLowerCase();
      if (a.includes('store code') && (y.includes('claim') || row.length >= 43)) return index;
    }
    return -1;
  }

  function renderFileMeta(headerIndex) {
    text('historyFileName', selectedFile.name);
    text('historySheetName', sheetName);
    text('historyRowCount', parsedRows.length.toLocaleString('th-TH'));
    text('historySchemaStatus', headerIndex >= 0 ? 'A:AQ · 43 columns' : '43 columns · header inferred');
    document.getElementById('historyFileMeta').hidden = false;
    document.getElementById('historyDropzone').classList.add('has-file');
    text('historyReadyText', `พร้อมนำเข้า ${parsedRows.length.toLocaleString('th-TH')} แถว`);
  }

  function renderPreview() {
    const body = document.getElementById('historyPreviewBody');
    body.innerHTML = parsedRows.slice(0, 8).map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row[0])}</td><td><strong>${esc(row[5])}</strong></td><td>${esc(row[12])}</td><td>${esc(row[20])}</td><td>${statusBadge(row[21])}</td><td>${esc(row[22])}</td><td>${esc(row[24])}</td><td>${esc(row[25])}</td><td>${esc(row[39])}</td></tr>`).join('');
  }

  async function startImport() {
    if (!selectedFile || !parsedRows.length || importing) return;
    importing = true;
    stopRequested = false;
    const key = resumeKey();
    let offset = Number(localStorage.getItem(key) || 0);
    if (!Number.isFinite(offset) || offset < 0 || offset >= parsedRows.length) offset = 0;
    let imported = 0;
    let skipped = 0;
    let rejected = 0;
    const progress = document.getElementById('historyProgressCard');
    progress.hidden = false;
    document.getElementById('historyPreviewCard').hidden = true;
    document.getElementById('historyStopButton').disabled = false;
    document.getElementById('historyStopButton').textContent = 'หยุดหลังจบชุดนี้';
    addLog(offset ? `Resume จากแถว ${offset + 1}` : `เริ่ม Import ${parsedRows.length.toLocaleString('th-TH')} แถว`, 'info');

    try {
      while (offset < parsedRows.length && !stopRequested) {
        const chunk = parsedRows.slice(offset, offset + CHUNK_SIZE);
        const response = await fetch('/api/history/import', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, archived: document.getElementById('historyArchive').checked })
        });
        const payload = await readApi(response);
        imported += Number(payload.imported || 0);
        skipped += Number(payload.skipped || 0);
        rejected += Array.isArray(payload.rejected) ? payload.rejected.length : 0;
        offset += chunk.length;
        localStorage.setItem(key, String(offset));
        updateProgress(offset, imported, skipped, rejected);
        if (payload.rejected?.length) {
          const first = payload.rejected[0];
          addLog(`ชุด ${Math.ceil(offset / CHUNK_SIZE)} มีข้อมูลไม่ผ่าน ${payload.rejected.length} แถว · ${first.message}`, 'warn');
        } else if (offset % 400 === 0 || offset >= parsedRows.length) {
          addLog(`ผ่าน ${offset.toLocaleString('th-TH')} / ${parsedRows.length.toLocaleString('th-TH')} แถว`, 'ok');
        }
        await microPause();
      }

      if (offset >= parsedRows.length) {
        localStorage.removeItem(key);
        text('historyProgressTitle', 'Import เสร็จสมบูรณ์');
        addLog(`เสร็จแล้ว · Import ${imported.toLocaleString('th-TH')} · Skip ${skipped.toLocaleString('th-TH')} · Reject ${rejected.toLocaleString('th-TH')}`, 'ok');
        notify('Import เสร็จแล้ว', `เพิ่ม ${imported.toLocaleString('th-TH')} · ข้ามซ้ำ ${skipped.toLocaleString('th-TH')} · ไม่ผ่าน ${rejected.toLocaleString('th-TH')}`);
        await loadStats();
      } else {
        text('historyProgressTitle', 'หยุดการ Import แล้ว');
        addLog(`บันทึก checkpoint ที่แถว ${offset.toLocaleString('th-TH')} สามารถกลับมากด Import ต่อได้`, 'warn');
      }
    } catch (error) {
      const quotaPause = error.status === 429;
      text('historyProgressTitle', quotaPause ? 'ถึง Safety Budget ของรอบนี้แล้ว' : 'Import หยุดเนื่องจากข้อผิดพลาด');
      addLog(`${error.message} · checkpoint อยู่ที่แถว ${offset.toLocaleString('th-TH')}`, quotaPause ? 'warn' : 'error');
      notify(
        quotaPause ? 'พัก Import ไว้ก่อน' : 'Import หยุดชั่วคราว',
        `${error.message} — ระบบเก็บ checkpoint ไว้และ Resume ต่อได้`,
        quotaPause ? 'success' : 'error'
      );
      await loadStats();
    } finally {
      importing = false;
      document.getElementById('historyStopButton').disabled = false;
      document.getElementById('historyStopButton').textContent = 'หยุดหลังจบชุดนี้';
      updateResumeState();
    }
  }

  function updateProgress(processed, imported, skipped, rejected) {
    const percent = parsedRows.length ? Math.min(100, (processed / parsedRows.length) * 100) : 0;
    text('historyProgressPercent', `${percent.toFixed(1)}%`);
    document.getElementById('historyProgressBar').style.width = `${percent}%`;
    text('historyProcessed', processed.toLocaleString('th-TH'));
    text('historyImported', imported.toLocaleString('th-TH'));
    text('historySkipped', skipped.toLocaleString('th-TH'));
    text('historyRejected', rejected.toLocaleString('th-TH'));
  }

  function updateResumeState() {
    const badge = document.getElementById('historyResumeBadge');
    if (!badge || !selectedFile) return;
    const offset = Number(localStorage.getItem(resumeKey()) || 0);
    badge.hidden = !(offset > 0 && offset < parsedRows.length);
    if (!badge.hidden) badge.textContent = `Resume at row ${offset + 1}`;
  }

  function resumeKey() {
    return `claim-history:${selectedFile?.name || ''}:${selectedFile?.size || 0}:${selectedFile?.lastModified || 0}`;
  }

  async function loadStats() {
    try {
      const response = await fetch('/api/history/stats', { credentials: 'same-origin' });
      if (!response.ok) return;
      const payload = await response.json();
      const data = payload.data || {};
      const label = `${Number(data.total || 0).toLocaleString('th-TH')} rows · ${Number(data.archived || 0).toLocaleString('th-TH')} archive`;
      const node = document.getElementById('historyDbStatus');
      if (node) node.querySelector('strong').textContent = label;
    } catch { /* admin may not be logged in yet */ }
  }

  function clearFile(resetInput = true) {
    if (importing) return;
    selectedFile = null;
    parsedRows = [];
    sheetName = '';
    if (resetInput) document.getElementById('historyFile').value = '';
    document.getElementById('historyFileMeta').hidden = true;
    document.getElementById('historyPreviewCard').hidden = true;
    document.getElementById('historyProgressCard').hidden = true;
    document.getElementById('historyDropzone').classList.remove('has-file');
  }

  function setFileBusy(busy) {
    const zone = document.getElementById('historyDropzone');
    zone?.classList.toggle('busy', busy);
    if (zone) zone.querySelector('strong').textContent = busy ? 'Reading workbook…' : 'Drop Excel here or browse';
  }

  function addLog(message, type) {
    const log = document.getElementById('historyProgressLog');
    if (!log) return;
    const item = document.createElement('div');
    item.className = `history-log-row ${type}`;
    item.innerHTML = `<span>${new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())}</span><p>${esc(message)}</p>`;
    log.prepend(item);
    while (log.children.length > 8) log.lastElementChild.remove();
  }

  async function readApi(response) {
    let payload = {};
    try { payload = await response.json(); } catch { /* noop */ }
    if (!response.ok || payload.status === 'error') {
      const error = new Error(payload.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.quota = payload.quota;
      throw error;
    }
    return payload;
  }

  function statusBadge(value) {
    const status = String(value || '').trim();
    const type = status.toLowerCase() === 'accept' ? 'accept' : status.toLowerCase() === 'reject' ? 'reject' : 'pending';
    return `<span class="ops-badge ${type}">${esc(status || '-')}</span>`;
  }

  function notify(title, message, type = 'success') {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<strong>${esc(title)}</strong><span>${esc(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 6500);
  }

  function microPause() { return new Promise((resolve) => setTimeout(resolve, 35)); }
  function text(id, value) { const node = document.getElementById(id); if (node) node.textContent = value; }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
})();
