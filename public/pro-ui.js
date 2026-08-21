const BUILD = '2026-08-21-enterprise-ui-v3';
const THEME_KEY = 'claim-center-theme';
let validationImportRequested = false;
let observer = null;
let scheduled = false;

applyInitialTheme();
install();

function applyInitialTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* storage may be blocked */ }
  const theme = saved === 'dark' || saved === 'light'
    ? saved
    : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(theme, false);
}

function setTheme(theme, persist = true) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'dark' ? '#0b1020' : '#f4f7fb';
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* no-op */ }
  }
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    const active = button.dataset.themeChoice === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-theme-label]').forEach((node) => {
    node.textContent = next === 'dark' ? 'Dark' : 'Light';
  });
}

function install() {
  ensureCriticalStyle();
  ensureStylesheet();
  bindGlobalThemeEvents();

  const run = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceShell();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  window.addEventListener('load', run, { once: true });

  observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer?.disconnect(), 15000);
}

function ensureCriticalStyle() {
  if (document.getElementById('claimCriticalUiV3')) return;
  const style = document.createElement('style');
  style.id = 'claimCriticalUiV3';
  style.textContent = '[data-view="pivot"],#view-pivot{display:none!important}';
  document.head.appendChild(style);
}

function ensureStylesheet() {
  if (document.querySelector('link[data-pro-ui]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/pro-ui.css?v=${encodeURIComponent(BUILD)}`;
  link.dataset.proUi = 'true';
  document.head.appendChild(link);
}

function bindGlobalThemeEvents() {
  if (document.documentElement.dataset.themeBound) return;
  document.documentElement.dataset.themeBound = '1';
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-theme-choice]');
    if (!button) return;
    setTheme(button.dataset.themeChoice);
  });
}

function enhanceShell() {
  if (!document.body) return;
  document.body.classList.remove('pro-ui-v2');
  document.body.classList.add('pro-ui-v3');
  ensureValidationShell();
  ensureMasterArticleShell();
  retirePivot();
  enhanceNavigation();
  enhanceTopbar();
  enhanceLogin();
  enhanceControls();
  enhanceTables();
  enhanceDialogs();
  markBuild();
  syncThemeControls();
  ensureValidationBinding();
}

function ensureValidationShell() {
  const reference = document.querySelector('[data-view="references"]');
  const workspace = document.querySelector('.workspace');
  if (!reference || !workspace) return;

  let button = document.querySelector('[data-view="validation"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item';
    button.dataset.view = 'validation';
    button.innerHTML = '<span class="nav-icon">✓</span><span>Validation</span><span class="nav-meta">E + O</span>';
    reference.parentNode.insertBefore(button, reference);
  }

  if (!document.getElementById('view-validation')) {
    const section = document.createElement('section');
    section.className = 'view validation-workspace';
    section.id = 'view-validation';
    section.dataset.title = 'Validation';
    section.dataset.eyebrow = 'RUN VALIDATION';
    section.innerHTML = `
      <div class="page-intro compact-intro validation-hero">
        <div>
          <span class="section-kicker">CLAIM CCD VALIDATION</span>
          <h1>RunValidation</h1>
          <p>ตรวจ Article + Reference ตาม Macro เดิม โดยใช้คอลัมน์ E + O และข้อมูล Claim ใน D1 เป็นแหล่งตรวจสอบกลาง</p>
        </div>
        <div class="validation-hero-actions">
          <span class="contract-chip"><b>E</b> Article</span>
          <span class="contract-chip"><b>O</b> Reference</span>
          <button class="button success" id="validationDownloadButton" hidden>⇩ Download Result</button>
        </div>
      </div>

      <div class="validation-grid">
        <section class="panel validation-upload-card">
          <div class="panel-heading">
            <div class="heading-icon violet">01</div>
            <div><h3>เลือกไฟล์สำหรับตรวจสอบ</h3><p>รองรับ .xlsx / .xlsm / .xls และอ่านรายการตั้งแต่แถว 10</p></div>
          </div>
          <label class="validation-drop" id="validationDrop">
            <input type="file" id="validationFile" accept=".xlsx,.xlsm,.xls" hidden>
            <div class="upload-symbol">⇧</div>
            <div><strong>Drop Excel here or browse</strong><small>Source E = Article · Source O = Reference</small></div>
          </label>
          <div class="master-article-meta" id="validationFileMeta" hidden>
            <div class="mini-stat"><span>FILE</span><strong class="validation-file-name" id="validationFileName">–</strong></div>
            <div class="mini-stat"><span>ROWS</span><strong id="validationRows">0</strong></div>
            <div class="mini-stat"><span>KEY</span><strong>E + O</strong></div>
            <div class="mini-stat"><span>DATABASE</span><strong>Claim D1</strong></div>
          </div>
          <div class="master-article-actions"><button class="button primary" id="validationRunButton" disabled>เริ่มตรวจสอบ</button></div>
        </section>

        <section class="panel validation-rules-card">
          <div class="panel-heading">
            <div class="heading-icon blue">02</div>
            <div><h3>Validation contract</h3><p>Logic จาก Claim CCD.xlsm เดิมถูกล็อกไว้ใน CI</p></div>
          </div>
          <div class="validation-rule-list">
            <div class="validation-rule"><b>✓</b><span>เทียบ Article + Reference_No. แบบคู่ข้อมูลเดียวกัน</span></div>
            <div class="validation-rule"><b>✓</b><span>พบข้อมูล → DC Accept / Valid / Process ในระบบได้</span></div>
            <div class="validation-rule"><b>✓</b><span>คืน Transport, Vehicle, Driver, Claim date และ Claim No.</span></div>
            <div class="validation-rule"><b>✓</b><span>ไม่พบ → No Accept / No Valid พร้อมเหตุผลเดิม</span></div>
            <div class="validation-rule"><b>✓</b><span>Export แยก Valid และ No Valid พร้อมผล Q:X</span></div>
          </div>
        </section>
      </div>

      <section class="panel validation-results" id="validationResults" hidden>
        <div class="panel-heading validation-result-heading">
          <div class="heading-icon blue">✓</div>
          <div><h3>ผลการตรวจสอบ</h3><div class="validation-result-badges"><span class="result-pill valid" id="validationValidBadge">Valid 0</span><span class="result-pill invalid" id="validationInvalidBadge">No Valid 0</span></div></div>
        </div>
        <div class="data-table-wrap"><table class="data-table validation-preview-table"><thead><tr><th>#</th><th>Article (E)</th><th>Reference (O)</th><th>Result</th><th>Transport No.</th><th>Claim No.</th></tr></thead><tbody id="validationPreviewBody"></tbody></table></div>
      </section>`;
    const claims = document.getElementById('view-claims');
    workspace.insertBefore(section, claims || workspace.firstChild);
  }
}

function ensureMasterArticleShell() {
  const masters = document.getElementById('view-masters');
  if (!masters) return;
  const legacy = document.getElementById('productMasterPaste')?.closest('.master-card');
  if (legacy) {
    legacy.classList.add('legacy-product-master-hidden');
    legacy.setAttribute('aria-hidden', 'true');
  }
  if (document.getElementById('masterArticleCard')) return;
  const grid = masters.querySelector('.master-grid');
  if (!grid) return;

  const card = document.createElement('section');
  card.className = 'panel master-card master-article-card';
  card.id = 'masterArticleCard';
  card.innerHTML = `
    <div class="panel-heading master-article-heading">
      <div class="heading-icon violet">A</div>
      <div><h3>Master Article — Weekly Replace</h3><p>Master ราคาหลักของระบบ · AJ = ITEM_VALUE · Replace ทั้งชุดหลังตรวจไฟล์ผ่าน</p></div>
      <span class="mode-badge">A:BK</span>
    </div>
    <div class="master-article-grid">
      <div>
        <label class="master-article-drop" id="masterArticleDrop">
          <input type="file" id="masterArticleFile" accept=".xlsx,.xlsm,.xls,.csv" hidden>
          <div class="upload-symbol">⇧</div>
          <div><strong>เลือกไฟล์ Master Article</strong><small>A ARTICLE · D BARCODE · L MANAGE_WEIGHT · AJ ITEM_VALUE · AN SEG_DESCRIPTION</small></div>
        </label>
        <div class="master-article-meta" id="masterArticleFileMeta" hidden>
          <div class="mini-stat"><span>FILE</span><strong class="validation-file-name" id="masterArticleFileName">–</strong></div>
          <div class="mini-stat"><span>ARTICLES</span><strong id="masterArticleRows">0</strong></div>
          <div class="mini-stat"><span>WITH PRICE</span><strong id="masterArticlePriced">0</strong></div>
          <div class="mini-stat"><span>SHEET</span><strong id="masterArticleSheet">–</strong></div>
        </div>
      </div>
      <div class="master-article-control">
        <div class="master-weekly-note"><strong>Weekly replacement policy</strong><br>อัปโหลดชุดใหม่ทุกวันจันทร์ได้โดย Master เดิมยัง Active จนกว่าชุดใหม่จะครบและผ่าน Validation จากนั้นจึงสลับและลบชุดเก่า</div>
        <div class="master-status-line"><i class="master-status-dot" id="masterStatusDot"></i><div><strong id="masterStatusTitle">กำลังตรวจสถานะ Master…</strong><div class="muted" id="masterStatusDetail"></div></div></div>
        <div class="master-article-progress"><i id="masterArticleProgress"></i></div>
        <div class="muted" id="masterArticleProgressText">ยังไม่ได้เลือกไฟล์</div>
        <div class="master-article-actions"><button class="button ghost" id="masterArticleRefreshButton">↻ Refresh</button><button class="button primary" id="masterArticleUploadButton" disabled>Replace Master Article</button></div>
      </div>
    </div>`;
  grid.appendChild(card);
}

function retirePivot() {
  const nav = document.querySelector('[data-view="pivot"]');
  if (nav) {
    nav.hidden = true;
    nav.dataset.retired = 'true';
    nav.setAttribute('aria-hidden', 'true');
    nav.tabIndex = -1;
  }
  const view = document.getElementById('view-pivot');
  if (view) {
    view.hidden = true;
    view.dataset.retired = 'true';
    view.setAttribute('aria-hidden', 'true');
  }
}

function enhanceNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    if (button.tagName === 'BUTTON' && !button.getAttribute('type')) button.type = 'button';
    const active = button.classList.contains('active');
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const nav = document.querySelector('.nav-list');
  if (nav && !nav.dataset.proUiBound) {
    nav.dataset.proUiBound = '1';
    nav.addEventListener('click', () => requestAnimationFrame(enhanceNavigation));
  }
}

function enhanceTopbar() {
  const topbar = document.querySelector('.topbar-actions');
  if (!topbar) return;
  if (!document.getElementById('productionRuntimeBadge')) {
    const badge = document.createElement('div');
    badge.id = 'productionRuntimeBadge';
    badge.className = 'runtime-badge';
    badge.innerHTML = '<i></i><span>Production</span><b>D1</b>';
    topbar.insertBefore(badge, topbar.firstChild);
  }
  if (!document.getElementById('themeControl')) {
    const control = createThemeControl('themeControl');
    const today = topbar.querySelector('.today-chip');
    topbar.insertBefore(control, today || topbar.lastChild);
  }
}

function enhanceLogin() {
  const card = document.getElementById('loginForm');
  if (!card || document.getElementById('loginThemeControl')) return;
  const control = createThemeControl('loginThemeControl', 'login-theme-control');
  card.insertBefore(control, card.firstChild);
}

function createThemeControl(id, extraClass = '') {
  const control = document.createElement('div');
  control.id = id;
  control.className = `theme-control ${extraClass}`.trim();
  control.setAttribute('aria-label', 'Appearance');
  control.innerHTML = `
    <button type="button" data-theme-choice="light" aria-label="Light mode" title="Light mode"><span>☀</span><b>Light</b></button>
    <button type="button" data-theme-choice="dark" aria-label="Dark mode" title="Dark mode"><span>☾</span><b>Dark</b></button>`;
  return control;
}

function syncThemeControls() {
  setTheme(document.documentElement.dataset.theme || 'light', false);
}

function enhanceControls() {
  document.querySelectorAll('button').forEach((button) => {
    if (!button.getAttribute('type') && !button.closest('form[method="dialog"]')) button.type = 'button';
  });
  document.querySelectorAll('input, textarea, select, button').forEach((element) => {
    if (!element.hasAttribute('aria-label') && element.placeholder && !element.closest('label')) element.setAttribute('aria-label', element.placeholder);
  });
}

function enhanceTables() {
  document.querySelectorAll('.data-table-wrap').forEach((wrap) => {
    wrap.classList.add('pro-table-scroll');
    const table = wrap.querySelector('table');
    if (table) table.setAttribute('role', 'table');
  });
}

function enhanceDialogs() {
  document.querySelectorAll('dialog').forEach((dialog) => {
    if (!dialog.getAttribute('aria-modal')) dialog.setAttribute('aria-modal', 'true');
  });
}

function markBuild() {
  const status = document.querySelector('.system-status');
  if (!status) return;
  let mark = document.getElementById('proUiBuildMark');
  if (!mark) {
    mark = document.createElement('span');
    mark.id = 'proUiBuildMark';
    mark.className = 'pro-ui-build';
    status.appendChild(mark);
  }
  mark.textContent = 'UI v3';
}

function ensureValidationBinding() {
  const validationInput = document.getElementById('validationFile');
  if (!validationInput || validationInput.dataset.bound || validationImportRequested) return;
  validationImportRequested = true;
  import(`/master-validation.js?v=${encodeURIComponent(BUILD)}`)
    .catch((error) => console.error('Validation module load failed', error))
    .finally(() => { validationImportRequested = false; });
}
