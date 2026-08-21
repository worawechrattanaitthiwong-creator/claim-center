const ADAPTER = String.raw`
/* Cloudflare D1 adapter: injected before public/app.js. */
(() => {
  const nativeFetch = window.fetch.bind(window);
  const CLAIM_CHUNK = 10;
  const RESOLVE_CHUNK = 35;
  const STORE_MASTER_CHUNK = 400;
  const PRODUCT_MASTER_CHUNK = 300;
  const MISSING_STORE_CHUNK = 80;

  // Kept only while a large save is incomplete. This lets a user fix a failed row
  // and click Save again without re-inserting chunks that already succeeded.
  const completedClaimRows = new Set();

  window.fetch = async function claimCenterFetch(input, init = {}) {
    const requestUrl = typeof input === 'string' ? new URL(input, window.location.href) : new URL(input.url, window.location.href);
    const method = String(init.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
    if (method !== 'POST' || !init.body || typeof init.body !== 'string') return nativeFetch(input, init);

    let payload;
    try { payload = JSON.parse(init.body); } catch { return nativeFetch(input, init); }

    if (requestUrl.pathname === '/api/claims/bulk' && Array.isArray(payload.rows) && (payload.rows.length > CLAIM_CHUNK || completedClaimRows.size)) {
      return batchClaims(input, init, payload);
    }
    if (requestUrl.pathname === '/api/masters/resolve') {
      const articles = Array.isArray(payload.articles) ? payload.articles : [];
      const stores = Array.isArray(payload.stores) ? payload.stores : [];
      if (articles.length > RESOLVE_CHUNK || stores.length > RESOLVE_CHUNK) return batchMasterResolve(input, init, payload);
    }
    if (requestUrl.pathname === '/api/master/stores' && Array.isArray(payload.records) && payload.records.length > STORE_MASTER_CHUNK) {
      return batchRecords(input, init, payload, STORE_MASTER_CHUNK);
    }
    if (requestUrl.pathname === '/api/master/products' && Array.isArray(payload.records) && payload.records.length > PRODUCT_MASTER_CHUNK) {
      return batchRecords(input, init, payload, PRODUCT_MASTER_CHUNK);
    }
    if (requestUrl.pathname === '/api/master/stores/missing' && Array.isArray(payload.codes) && payload.codes.length > MISSING_STORE_CHUNK) {
      return batchMissingStores(input, init, payload);
    }
    return nativeFetch(input, init);
  };

  async function batchClaims(input, init, payload) {
    const originalRows = payload.rows || [];
    const pending = originalRows
      .map((row, originalIndex) => ({ row, originalIndex, fingerprint: fingerprintClaim(row) }))
      .filter((item) => !completedClaimRows.has(item.fingerprint));
    const skipped = originalRows.length - pending.length;
    const totals = { inserted: skipped, updated: 0, archiveUpdated: 0, count: skipped };

    for (let offset = 0; offset < pending.length; offset += CLAIM_CHUNK) {
      const chunk = pending.slice(offset, offset + CLAIM_CHUNK);
      const response = await postChunk(input, init, { ...payload, rows: chunk.map((item) => item.row) }, {
        'X-Claim-Chunk': String(Math.floor(offset / CLAIM_CHUNK) + 1),
        'X-Claim-Chunk-Offset': String(chunk[0]?.originalIndex || 0)
      });
      const body = await jsonBody(response);
      if (!response.ok) {
        if (Array.isArray(body.details)) {
          body.details = body.details.map((item) => {
            const localIndex = Math.max(0, Number(item.row || 1) - 1);
            return { ...item, row: (chunk[localIndex]?.originalIndex ?? localIndex) + 1 };
          });
        }
        return jsonResponse(body, response.status, response.statusText);
      }
      for (const item of chunk) completedClaimRows.add(item.fingerprint);
      totals.inserted += Number(body.inserted || 0);
      totals.updated += Number(body.updated || 0);
      totals.archiveUpdated += Number(body.archiveUpdated || 0);
      totals.count += Number(body.count || chunk.length);
    }

    completedClaimRows.clear();
    return jsonResponse({ status: 'success', ...totals });
  }

  async function batchMasterResolve(input, init, payload) {
    const articles = [...new Set(payload.articles || [])];
    const stores = [...new Set(payload.stores || [])];
    const requestCount = Math.max(Math.ceil(articles.length / RESOLVE_CHUNK), Math.ceil(stores.length / RESOLVE_CHUNK));
    const merged = {
      listEggs: {}, check100: {}, manageWeight: {}, skuCost: {}, segDescription: {},
      formatType: {}, storeType: {}, lastRunningNumbers: {}, lastRefCDC: 0, lastRefTF: 0,
      mapBarcodeToArticle: {}, mapArticleToBarcode: {}
    };

    for (let index = 0; index < requestCount; index += 1) {
      const chunkPayload = {
        ...payload,
        articles: articles.slice(index * RESOLVE_CHUNK, (index + 1) * RESOLVE_CHUNK),
        stores: stores.slice(index * RESOLVE_CHUNK, (index + 1) * RESOLVE_CHUNK)
      };
      const response = await postChunk(input, init, chunkPayload);
      const body = await jsonBody(response);
      if (!response.ok) return jsonResponse(body, response.status, response.statusText);
      const data = body.data || {};
      for (const key of ['listEggs','check100','manageWeight','skuCost','segDescription','formatType','storeType','lastRunningNumbers','mapBarcodeToArticle','mapArticleToBarcode']) {
        Object.assign(merged[key], data[key] || {});
      }
      merged.lastRefCDC = Math.max(merged.lastRefCDC, Number(data.lastRefCDC || 0));
      merged.lastRefTF = Math.max(merged.lastRefTF, Number(data.lastRefTF || 0));
    }
    return jsonResponse({ status: 'success', data: merged });
  }

  async function batchRecords(input, init, payload, chunkSize) {
    const records = payload.records || [];
    const totals = { count: 0, inserted: 0, updated: 0 };
    for (let offset = 0; offset < records.length; offset += chunkSize) {
      const chunk = records.slice(offset, offset + chunkSize);
      const response = await postChunk(input, init, { ...payload, records: chunk });
      const body = await jsonBody(response);
      if (!response.ok) return jsonResponse(body, response.status, response.statusText);
      totals.count += Number(body.count || chunk.length);
      totals.inserted += Number(body.inserted || body.count || chunk.length);
      totals.updated += Number(body.updated || 0);
    }
    return jsonResponse({ status: 'success', ...totals });
  }

  async function batchMissingStores(input, init, payload) {
    const codes = [...new Set(payload.codes || [])];
    const missing = new Set();
    for (let offset = 0; offset < codes.length; offset += MISSING_STORE_CHUNK) {
      const response = await postChunk(input, init, { ...payload, codes: codes.slice(offset, offset + MISSING_STORE_CHUNK) });
      const body = await jsonBody(response);
      if (!response.ok) return jsonResponse(body, response.status, response.statusText);
      for (const code of body.missing || []) missing.add(code);
    }
    return jsonResponse({ status: 'success', missing: [...missing] });
  }

  function postChunk(input, init, payload, extraHeaders = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
    for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
    return nativeFetch(input, { ...init, headers, body: JSON.stringify(payload) });
  }

  async function jsonBody(response) {
    try { return await response.clone().json(); } catch { return { status: 'error', message: 'Server response is not JSON' }; }
  }

  function jsonResponse(body, status = 200, statusText = '') {
    return new Response(JSON.stringify(body), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function fingerprintClaim(row) {
    return JSON.stringify(row, Object.keys(row || {}).sort());
  }
})();
`;

export async function injectCloudflareAdapter(assetResponse) {
  if (!assetResponse.ok) return assetResponse;
  const source = await assetResponse.text();
  const headers = new Headers(assetResponse.headers);
  headers.set('Content-Type', 'text/javascript; charset=utf-8');
  headers.set('Cache-Control', 'no-cache');
  return new Response(`${ADAPTER}\n${source}`, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });
}
