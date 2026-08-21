(() => {
  const currency = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
  let loadedOnce = false;
  let loading = false;
  let user = null;

  ensureStylesheet();
  document.addEventListener('DOMContentLoaded', installDashboard, { once: true });

  function ensureStylesheet() {
    if (document.querySelector('link[data-ops-ui]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/ops.css';
    link.dataset.opsUi = 'true';
    document.head.appendChild(link);
  }

  function installDashboard() {
    document.body.classList.add('ops-ui');
    installNav();
    installView();
    bindDashboardEvents();
    observeLoginState();
    loadIdentity();
  }

  function installNav() {
    if (document.querySelector('[data-view="dashboard"]')) return;
    const nav = document.querySelector('.nav-list');
    const firstWorkspaceItem = nav?.querySelector('.nav-item[data-view]');
    if (!nav || !firstWorkspaceItem) return;
    const button = document.createElement('button');
    button.className = 'nav-item ops-dashboard-nav';
    button.dataset.view = 'dashboard';
    button.id = 'opsDashboardNav';
    button.innerHTML = '<span class="nav-icon">⌂</span><span>ภาพรวมงานเคลม</span><span class="ops-live-dot" title="Live summary"></span>';
    nav.insertBefore(button, firstWorkspaceItem);
  }

  function installView() {
    if (document.getElementById('view-dashboard')) return;
    const workspace = document.querySelector('.workspace');
    const firstView = workspace?.querySelector('.view');
    if (!workspace || !firstView) return;

    const section = document.createElement('section');
    section.className = 'view ops-dashboard-view';
    section.id = 'view-dashboard';
    section.dataset.title = 'ภาพรวมงานเคลม';
    section.dataset.eyebrow = 'OPERATIONS CONTROL CENTER';
    section.innerHTML = `
      <div class="ops-hero">
        <div class="ops-hero-copy">
          <div class="ops-status-line"><span class="ops-pulse"></span><span>CLAIM OPERATIONS</span><span class="ops-separator">/</span><span id="opsPeriodLabel">Loading</span></div>
          <h1>Operations Control Center</h1>
          <p>ภาพรวมงานเคลมแบบ 1 Transport = 1 Case อ้างอิง Logic เดิม พร้อมสรุปยอด สถานะ Format และรอบรถล่าสุด</p>
        </div>
        <div class="ops-hero-actions">
          <div class="ops-health" id="opsHealth"><span></span><div><small>Cloudflare</small><strong>Checking…</strong></div></div>
          <button class="button ghost compact" id="opsRebuildButton" hidden>Rebuild Summary</button>
          <button class="button primary compact" id="opsRefreshButton">↻ Refresh</button>
        </div>
      </div>

      <section class="panel ops-filter-panel">
        <div class="ops-filter-title"><div><span class="section-kicker">LIVE FILTERS</span><strong>Scope</strong></div><span id="opsUpdatedAt">–</span></div>
        <div class="ops-filter-grid">
          <label class="field"><span>ปี</span><select id="opsYear"></select></label>
          <label class="field"><span>เดือน</span><select id="opsMonth"></select></label>
          <label class="field"><span>WHO</span><select id="opsWho"><option value="all">ทั้งหมด</option><option>DC</option><option>TP</option><option>QC</option></select></label>
          <label class="field"><span>Status</span><select id="opsStatus"><option value="all">ทั้งหมด</option><option value="accept">Accept</option><option value="pending">Pending</option><option value="reject">Reject</option></select></label>
          <label class="field"><span>Format</span><select id="opsFormat"><option value="all">ทั้งหมด</option><option>HYPER</option><option>MBC</option><option>FRANCHISE</option></select></label>
        </div>
      </section>

      <div class="ops-kpi-grid">
        ${kpi('opsKpiCases', 'TOTAL CASES', '0', 'Transport cases', 'case')}
        ${kpi('opsKpiAmount', 'CLAIM VALUE', '฿0', 'Total claim amount', 'amount')}
        ${kpi('opsKpiAvg', 'AVG. TICKET', '฿0', 'Average per case', 'avg')}
        ${kpi('opsKpiCompletion', 'COMPLETION', '0%', 'Accept + Reject', 'complete')}
      </div>

      <div class="ops-status-grid">
        ${statusCard('accept', 'Accept', 'opsAcceptCount', 'opsAcceptAmount')}
        ${statusCard('pending', 'Pending', 'opsPendingCount', 'opsPendingAmount')}
        ${statusCard('reject', 'Reject', 'opsRejectCount', 'opsRejectAmount')}
      </div>

      <div class="ops-layout ops-layout-main">
        <section class="panel ops-chart-panel">
          <div class="ops-panel-head"><div><span class="section-kicker">CASE TREND</span><h3 id="opsTrendTitle">Daily case volume</h3></div><div class="ops-legend"><span><i class="case"></i>Cases</span><span><i class="amount"></i>Amount</span></div></div>
          <div class="ops-trend" id="opsTrend"></div>
        </section>
        <section class="panel ops-format-panel">
          <div class="ops-panel-head"><div><span class="section-kicker">FORMAT MIX</span><h3>Case distribution</h3></div></div>
          <div class="ops-donut-wrap"><div class="ops-donut" id="opsFormatDonut"><div><strong id="opsFormatTotal">0</strong><span>cases</span></div></div></div>
          <div class="ops-format-list" id="opsFormatList"></div>
        </section>
      </div>

      <div class="ops-layout ops-layout-secondary">
        <section class="panel ops-table-panel">
          <div class="ops-panel-head"><div><span class="section-kicker">TOP STORES</span><h3>เคสสูงสุดตามสาขา</h3></div></div>
          <div class="ops-mini-table" id="opsTopStores"></div>
        </section>
        <section class="panel ops-table-panel">
          <div class="ops-panel-head"><div><span class="section-kicker">HUB / TYPE</span><h3>สถานะตาม Hub</h3></div></div>
          <div class="ops-mini-table" id="opsHubs"></div>
        </section>
      </div>

      <section class="panel ops-recent-panel">
        <div class="ops-panel-head"><div><span class="section-kicker">RECENT CASES</span><h3>รอบรถล่าสุดในช่วงที่เลือก</h3></div><span class="ops-source-pill">D1 CASE SUMMARY</span></div>
        <div class="data-table-wrap">
          <table class="data-table ops-recent-table"><thead><tr><th>Transport</th><th>Date</th><th>Store</th><th>WHO</th><th>Format</th><th>Status</th><th>Items</th><th class="align-right">Amount</th></tr></thead><tbody id="opsRecentBody"></tbody></table>
        </div>
      </section>

      <div class="ops-empty panel" id="opsEmpty" hidden>
        <div class="ops-empty-icon">◇</div><h3>ยังไม่มี Case Summary ในช่วงนี้</h3>
        <p>ถ้ามีข้อมูล Claim อยู่แล้วแต่ Dashboard ยังว่าง ให้ Admin กด <b>Rebuild Summary</b> หนึ่งครั้งหลัง Apply migration</p>
      </div>
    `;
    workspace.insertBefore(section, firstView);
    populatePeriodFilters();
  }

  function kpi(id, label, value, hint, type) {
    return `<article class="ops-kpi ops-kpi-${type}"><div class="ops-kpi-top"><span>${label}</span><i></i></div><strong id="${id}">${value}</strong><small>${hint}</small></article>`;
  }

  function statusCard(type, label, countId, amountId) {
    return `<article class="ops-status-card ${type}"><div><span class="ops-status-dot"></span><strong>${label}</strong></div><div class="ops-status-metrics"><b id="${countId}">0</b><span>cases</span><em id="${amountId}">฿0</em></div></article>`;
  }

  function populatePeriodFilters() {
    const now = new Date();
    const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(now));
    const currentMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Bangkok', month: 'numeric' }).format(now));
    const year = document.getElementById('opsYear');
    const month = document.getElementById('opsMonth');
    for (let value = currentYear + 1; value >= currentYear - 5; value -= 1) {
      year.insertAdjacentHTML('beforeend', `<option value="${value}" ${value === currentYear ? 'selected' : ''}>${value}</option>`);
    }
    month.innerHTML = '<option value="all">ทั้งปี</option>' + Array.from({ length: 12 }, (_, index) => {
      const value = index + 1;
      const name = new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(new Date(2026, index, 1));
      return `<option value="${value}" ${value === currentMonth ? 'selected' : ''}>${name}</option>`;
    }).join('');
  }

  function bindDashboardEvents() {
    const nav = document.getElementById('opsDashboardNav');
    nav?.addEventListener('click', () => setTimeout(() => loadDashboard(), 0));
    document.getElementById('opsRefreshButton')?.addEventListener('click', () => loadDashboard(true));
    for (const id of ['opsYear', 'opsMonth', 'opsWho', 'opsStatus', 'opsFormat']) {
      document.getElementById(id)?.addEventListener('change', () => loadDashboard(true));
    }
    document.getElementById('opsRebuildButton')?.addEventListener('click', rebuildDashboard);

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        const search = document.getElementById('searchTransport');
        if (search && !document.getElementById('appShell')?.hidden) {
          event.preventDefault();
          document.querySelector('[data-view="claims"]')?.click();
          setTimeout(() => search.focus(), 30);
        }
      }
    });
  }

  function observeLoginState() {
    const shell = document.getElementById('appShell');
    if (!shell) return;
    const observer = new MutationObserver(() => {
      if (!shell.hidden && !loadedOnce) {
        loadedOnce = true;
        setTimeout(() => document.getElementById('opsDashboardNav')?.click(), 80);
      }
    });
    observer.observe(shell, { attributes: true, attributeFilter: ['hidden'] });
  }

  async function loadIdentity() {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!response.ok) return;
      const payload = await response.json();
      user = payload.user;
      const rebuild = document.getElementById('opsRebuildButton');
      if (rebuild) rebuild.hidden = user?.role !== 'admin';
    } catch { /* login may not exist yet */ }
  }

  async function loadDashboard(force = false) {
    if (loading) return;
    if (!force && document.getElementById('view-dashboard') && !document.getElementById('view-dashboard').classList.contains('active')) return;
    loading = true;
    setDashboardBusy(true);
    try {
      await loadIdentity();
      const params = new URLSearchParams({
        year: value('opsYear'), month: value('opsMonth'), who: value('opsWho'),
        status: value('opsStatus'), format: value('opsFormat')
      });
      const [dashboardResponse, healthResponse] = await Promise.all([
        fetch(`/api/dashboard?${params}`, { credentials: 'same-origin' }),
        fetch('/api/health', { credentials: 'same-origin' }).catch(() => null)
      ]);
      const payload = await readApi(dashboardResponse);
      renderDashboard(payload.data);
      renderHealth(healthResponse);
    } catch (error) {
      renderDashboardError(error);
    } finally {
      loading = false;
      setDashboardBusy(false);
    }
  }

  async function rebuildDashboard() {
    if (user?.role !== 'admin') return;
    const button = document.getElementById('opsRebuildButton');
    button.disabled = true;
    button.textContent = 'Rebuilding…';
    try {
      const response = await fetch('/api/dashboard/rebuild', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      const payload = await readApi(response);
      toastCompat('Dashboard rebuilt', `สร้าง Case Summary ใหม่ ${integer.format(payload.rebuilt || 0)} เคส`);
      await loadDashboard(true);
    } catch (error) {
      toastCompat('Rebuild ไม่สำเร็จ', error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Rebuild Summary';
    }
  }

  function renderDashboard(data) {
    if (!data) return;
    const summary = data.summary || {};
    text('opsKpiCases', integer.format(summary.totalCases || 0));
    text('opsKpiAmount', `฿${currency.format(summary.totalAmount || 0)}`);
    text('opsKpiAvg', `฿${currency.format(summary.avgTicket || 0)}`);
    text('opsKpiCompletion', `${decimal.format(summary.completionRate || 0)}%`);
    text('opsAcceptCount', integer.format(summary.acceptCases || 0));
    text('opsAcceptAmount', `฿${currency.format(summary.acceptAmount || 0)}`);
    text('opsPendingCount', integer.format(summary.pendingCases || 0));
    text('opsPendingAmount', `฿${currency.format(summary.pendingAmount || 0)}`);
    text('opsRejectCount', integer.format(summary.rejectCases || 0));
    text('opsRejectAmount', `฿${currency.format(summary.rejectAmount || 0)}`);
    text('opsUpdatedAt', `Updated ${formatTime(data.meta?.generatedAt)}`);
    text('opsPeriodLabel', periodLabel(data.year, data.month));

    renderTrend(data);
    renderFormat(data.format || {});
    renderTopStores(data.topStores || []);
    renderHubs(data.hubs || {});
    renderRecent(data.recent || []);

    const empty = document.getElementById('opsEmpty');
    if (empty) empty.hidden = Number(summary.totalCases || 0) !== 0;
  }

  function renderTrend(data) {
    const month = data.month;
    const source = month === 'all' ? data.monthly || [] : (data.daily || []).filter((item) => item.count || item.amount);
    text('opsTrendTitle', month === 'all' ? 'Monthly case volume' : 'Daily case volume');
    const container = document.getElementById('opsTrend');
    if (!container) return;
    const maxCount = Math.max(1, ...source.map((item) => Number(item.count || 0)));
    const maxAmount = Math.max(1, ...source.map((item) => Number(item.amount || 0)));
    if (!source.length) {
      container.innerHTML = '<div class="ops-no-data">ยังไม่มีข้อมูลในช่วงที่เลือก</div>';
      return;
    }
    container.innerHTML = `<div class="ops-trend-bars">${source.map((item) => {
      const label = month === 'all' ? monthShort(item.month) : item.day;
      const caseHeight = Math.max(item.count ? 8 : 0, (Number(item.count || 0) / maxCount) * 100);
      const amountHeight = Math.max(item.amount ? 4 : 0, (Number(item.amount || 0) / maxAmount) * 100);
      return `<div class="ops-trend-col" title="${escapeHtml(String(label))}: ${integer.format(item.count || 0)} cases / ฿${currency.format(item.amount || 0)}">
        <div class="ops-trend-stack"><i class="amount" style="height:${amountHeight}%"></i><i class="case" style="height:${caseHeight}%"></i></div><span>${escapeHtml(String(label))}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function renderFormat(format) {
    const values = [
      ['HYPER', Number(format.hyper || 0), 'hyper'],
      ['MBC', Number(format.mbc || 0), 'mbc'],
      ['FRANCHISE', Number(format.franchise || 0), 'franchise']
    ];
    const total = values.reduce((sum, item) => sum + item[1], 0);
    text('opsFormatTotal', integer.format(total));
    const donut = document.getElementById('opsFormatDonut');
    if (donut) {
      const hyper = total ? (values[0][1] / total) * 100 : 0;
      const mbc = total ? (values[1][1] / total) * 100 : 0;
      donut.style.setProperty('--hyper', `${hyper}%`);
      donut.style.setProperty('--mbc', `${hyper + mbc}%`);
    }
    const list = document.getElementById('opsFormatList');
    if (list) list.innerHTML = values.map(([label, count, type]) => {
      const percent = total ? (count / total) * 100 : 0;
      return `<div class="ops-format-row"><span><i class="${type}"></i>${label}</span><div><b>${integer.format(count)}</b><em>${decimal.format(percent)}%</em></div></div>`;
    }).join('');
  }

  function renderTopStores(rows) {
    const container = document.getElementById('opsTopStores');
    if (!container) return;
    if (!rows.length) return void (container.innerHTML = '<div class="ops-no-data compact">ไม่มีข้อมูลสาขา</div>');
    const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
    container.innerHTML = rows.map((row, index) => `<div class="ops-rank-row"><span class="ops-rank">${index + 1}</span><div class="ops-rank-main"><div><strong>${escapeHtml(row.storeCode)}</strong><span>${integer.format(row.count)} cases</span></div><div class="ops-progress"><i style="width:${(row.count / max) * 100}%"></i></div></div><b>฿${currency.format(row.amount || 0)}</b></div>`).join('');
  }

  function renderHubs(hubs) {
    const container = document.getElementById('opsHubs');
    if (!container) return;
    const rows = Object.entries(hubs).map(([name, bucket]) => ({
      name,
      accept: Number(bucket.accept?.count || 0),
      pending: Number(bucket.pending?.count || 0),
      reject: Number(bucket.reject?.count || 0)
    })).sort((a, b) => (b.accept + b.pending + b.reject) - (a.accept + a.pending + a.reject)).slice(0, 8);
    if (!rows.length) return void (container.innerHTML = '<div class="ops-no-data compact">ไม่มีข้อมูล Hub/Type</div>');
    container.innerHTML = '<div class="ops-hub-head"><span>Hub / Type</span><span>A</span><span>P</span><span>R</span></div>' + rows.map((row) => `<div class="ops-hub-row"><strong>${escapeHtml(row.name)}</strong><span class="ok">${integer.format(row.accept)}</span><span class="wait">${integer.format(row.pending)}</span><span class="bad">${integer.format(row.reject)}</span></div>`).join('');
  }

  function renderRecent(rows) {
    const body = document.getElementById('opsRecentBody');
    if (!body) return;
    body.innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.transportNo || '-')}</strong></td><td>${escapeHtml(row.replyDate || '-')}</td><td>${escapeHtml(row.storeCode || '-')}</td><td>${escapeHtml(row.who || '-')}</td><td>${escapeHtml(row.format || '-')}</td><td><span class="ops-badge ${escapeHtml(row.status)}">${escapeHtml(titleCase(row.status))}</span></td><td>${integer.format(row.itemCount || 0)}</td><td class="align-right"><strong>฿${currency.format(row.amount || 0)}</strong></td></tr>`).join('') : '<tr><td colspan="8" class="ops-table-empty">ไม่มีเคสในช่วงที่เลือก</td></tr>';
  }

  async function renderHealth(response) {
    const health = document.getElementById('opsHealth');
    if (!health) return;
    let ok = false;
    try { ok = Boolean(response?.ok && (await response.clone().json())?.status === 'ok'); } catch { ok = false; }
    health.classList.toggle('offline', !ok);
    health.querySelector('strong').textContent = ok ? 'D1 Online' : 'Check connection';
  }

  function renderDashboardError(error) {
    text('opsUpdatedAt', 'Dashboard error');
    const trend = document.getElementById('opsTrend');
    if (trend) trend.innerHTML = `<div class="ops-no-data error">${escapeHtml(error.message || 'โหลด Dashboard ไม่สำเร็จ')}</div>`;
  }

  function setDashboardBusy(busy) {
    const view = document.getElementById('view-dashboard');
    const button = document.getElementById('opsRefreshButton');
    view?.classList.toggle('is-loading', busy);
    if (button) { button.disabled = busy; button.textContent = busy ? 'Loading…' : '↻ Refresh'; }
  }

  function periodLabel(year, month) {
    if (month === 'all') return `YEAR ${year}`;
    const name = new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2026, Number(month) - 1, 1)).toUpperCase();
    return `${name} ${year}`;
  }

  function monthShort(month) {
    return new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2026, Number(month) - 1, 1));
  }

  function formatTime(value) {
    const date = new Date(value || Date.now());
    return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(date);
  }

  async function readApi(response) {
    let payload = {};
    try { payload = await response.json(); } catch { /* noop */ }
    if (!response.ok || payload.status === 'error') throw new Error(payload.message || `HTTP ${response.status}`);
    return payload;
  }

  function toastCompat(title, message, type = 'success') {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 5200);
  }

  function value(id) { return document.getElementById(id)?.value || 'all'; }
  function text(id, value) { const node = document.getElementById(id); if (node) node.textContent = value; }
  function titleCase(value) { const text = String(value || ''); return text ? text[0].toUpperCase() + text.slice(1) : ''; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
})();
