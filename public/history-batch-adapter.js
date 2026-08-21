/* Historical import transport adapter.
 * The UI works with larger logical chunks while the Worker receives at most 15
 * rows per request, leaving D1 query headroom for references, sequences and summary sync.
 */
(() => {
  const nativeFetch = window.fetch.bind(window);
  const SERVER_CHUNK = 15;

  installQuotaUi();

  window.fetch = async function historySafeFetch(input, init = {}) {
    const url = typeof input === 'string'
      ? new URL(input, window.location.href)
      : new URL(input.url, window.location.href);
    const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();

    if (url.pathname === '/api/history/stats' && method === 'GET') {
      const response = await nativeFetch(input, init);
      inspectQuota(response);
      return response;
    }

    if (url.pathname !== '/api/history/import' || method !== 'POST' || typeof init.body !== 'string') {
      return nativeFetch(input, init);
    }

    let payload;
    try { payload = JSON.parse(init.body); } catch { return nativeFetch(input, init); }
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (rows.length <= SERVER_CHUNK) {
      const response = await nativeFetch(input, init);
      inspectQuota(response);
      return response;
    }

    const totals = { imported: 0, skipped: 0, rejected: [], transports: [], quota: null };
    for (let offset = 0; offset < rows.length; offset += SERVER_CHUNK) {
      const chunk = rows.slice(offset, offset + SERVER_CHUNK);
      const chunkInit = {
        ...init,
        headers: new Headers(init.headers || {}),
        body: JSON.stringify({ ...payload, rows: chunk })
      };
      chunkInit.headers.set('Content-Type', 'application/json');
      chunkInit.headers.set('X-History-Chunk-Offset', String(offset));

      const response = await nativeFetch(input, chunkInit);
      let body = null;
      try { body = await response.clone().json(); } catch { /* keep original response */ }
      if (!response.ok || body?.status === 'error') {
        if (body?.quota) renderQuota(body.quota);
        if (Array.isArray(body?.rejected)) {
          body.rejected = body.rejected.map((item) => ({
            ...item,
            row: Number(item.row || 0) + offset
          }));
        }
        return body
          ? new Response(JSON.stringify(body), {
              status: response.status,
              statusText: response.statusText,
              headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
            })
          : response;
      }

      totals.imported += Number(body?.imported || 0);
      totals.skipped += Number(body?.skipped || 0);
      if (Array.isArray(body?.rejected)) {
        totals.rejected.push(...body.rejected.map((item) => ({
          ...item,
          row: Number(item.row || 0) + offset
        })));
      }
      if (Array.isArray(body?.transports)) totals.transports.push(...body.transports);
      if (body?.quota) {
        totals.quota = body.quota;
        renderQuota(body.quota);
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      imported: totals.imported,
      skipped: totals.skipped,
      rejected: totals.rejected,
      transports: [...new Set(totals.transports)],
      quota: totals.quota
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  };

  function installQuotaUi() {
    document.addEventListener('DOMContentLoaded', () => {
      const policy = document.querySelector('.history-policy-body');
      if (!policy || document.getElementById('historyQuota')) return;
      const card = document.createElement('div');
      card.className = 'history-quota';
      card.id = 'historyQuota';
      card.innerHTML = `
        <div class="history-quota-head"><span>FREE-TIER SAFETY BUDGET</span><strong id="historyQuotaRemaining">–</strong></div>
        <div class="history-quota-track"><i id="historyQuotaBar"></i></div>
        <div class="history-quota-foot"><span id="historyQuotaUsed">Loading quota…</span><span id="historyQuotaReset">Reset –</span></div>`;
      const firstRule = policy.querySelector('.history-rule');
      policy.insertBefore(card, firstRule || null);
    }, { once: true });
  }

  async function inspectQuota(response) {
    try {
      const body = await response.clone().json();
      const quota = body?.data?.quota || body?.quota;
      if (quota) renderQuota(quota);
    } catch { /* response may not be JSON */ }
  }

  function renderQuota(quota) {
    const remaining = document.getElementById('historyQuotaRemaining');
    const used = document.getElementById('historyQuotaUsed');
    const reset = document.getElementById('historyQuotaReset');
    const bar = document.getElementById('historyQuotaBar');
    if (!remaining || !used || !reset || !bar) return;

    const limit = Math.max(1, Number(quota.limit || 0));
    const usedRows = Math.max(0, Number(quota.used || 0));
    const remainingRows = Math.max(0, Number(quota.remaining ?? limit - usedRows));
    const percent = Math.min(100, (usedRows / limit) * 100);
    remaining.textContent = `${remainingRows.toLocaleString('th-TH')} rows left`;
    used.textContent = `ใช้แล้ว ${usedRows.toLocaleString('th-TH')} / ${limit.toLocaleString('th-TH')} แถว`;
    reset.textContent = `Reset ${formatReset(quota.resetAt)}`;
    bar.style.width = `${percent}%`;
    document.getElementById('historyQuota')?.classList.toggle('near-limit', percent >= 80);
  }

  function formatReset(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '07:00 น.';
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Bangkok'
    }).format(date);
  }
})();
