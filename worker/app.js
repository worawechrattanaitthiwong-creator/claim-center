import claimWorker from './ccd-index.js';
import {
  deleteCaseSummary,
  handleDashboardRequest,
  refreshCaseSummaries
} from './dashboard.js';
import { handleHistoryRequest } from './history-import.js';
import { handleMasterValidationRequest } from './master-validation.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === '/app.js') {
      const response = await claimWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.set('content-type', 'text/javascript; charset=utf-8');
      headers.set('cache-control', 'no-cache');
      const source = await response.text();
      return new Response(`import '/ops-dashboard.js';\nimport '/history-styles.js';\nimport '/history-import.js';\nimport '/history-batch-adapter.js';\nimport '/master-validation.js';\nimport '/master-validation-hooks.js';\n${source}`, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    if (url.pathname === '/api/dashboard' || url.pathname === '/api/dashboard/rebuild') {
      const auth = await requireUser(request, env, ctx);
      if (auth.response) return auth.response;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const originError = checkMutationOrigin(request, url);
        if (originError) return originError;
      }
      return withApiHeaders(await handleDashboardRequest(request, env, auth.user, url));
    }

    if (url.pathname === '/api/history/stats' || url.pathname === '/api/history/import') {
      const auth = await requireUser(request, env, ctx);
      if (auth.response) return auth.response;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const originError = checkMutationOrigin(request, url);
        if (originError) return originError;
      }
      const response = await handleHistoryRequest(request, env, auth.user, url);
      if (response.ok && method === 'POST') {
        try {
          const payload = await response.clone().json();
          await refreshCaseSummaries(env.DB, payload.transports || []);
        } catch (error) {
          console.error('Historical dashboard summary refresh failed', error);
        }
      }
      return withApiHeaders(response);
    }

    if (url.pathname === '/api/validation/lookup' || url.pathname.startsWith('/api/master-article/')) {
      const auth = await requireUser(request, env, ctx);
      if (auth.response) return auth.response;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const originError = checkMutationOrigin(request, url);
        if (originError) return originError;
      }
      try {
        return withApiHeaders(await handleMasterValidationRequest(request, env, auth.user, url));
      } catch (error) {
        console.error('MasterArticle / Validation error', error);
        return withApiHeaders(jsonError(Number(error.statusCode || 500), error.statusCode ? error.message : 'เกิดข้อผิดพลาดภายในระบบ'));
      }
    }

    // The old 6-column Product editor is intentionally retired after migration 0005.
    // Weekly MasterArticle replacement is the source of truth for price/weight/segment.
    if (url.pathname === '/api/master/products' && method === 'POST') {
      const auth = await requireUser(request, env, ctx);
      if (auth.response) return auth.response;
      const originError = checkMutationOrigin(request, url);
      if (originError) return originError;
      return withApiHeaders(jsonError(410, 'Master Product แบบเดิมถูกยกเลิกแล้ว กรุณาใช้ Master Article — Weekly Replace'));
    }

    if (url.pathname === '/api/claims/bulk' && method === 'POST') {
      const probe = request.clone();
      let body = null;
      try { body = await probe.json(); } catch { /* delegated worker returns the validation error */ }

      let previousTransports = [];
      try {
        previousTransports = await lookupPreviousTransports(env.DB, body?.rows || []);
      } catch (error) {
        console.error('Unable to read previous transports before edit', error);
      }

      const response = await claimWorker.fetch(request, env, ctx);
      if (response.ok && Array.isArray(body?.rows)) {
        const transports = [
          ...previousTransports,
          ...body.rows.map((row) => row?.transportNo).filter(Boolean)
        ];
        try {
          await refreshCaseSummaries(env.DB, transports);
        } catch (error) {
          console.error('Dashboard summary refresh failed after Claim save', error);
        }
      }
      return response;
    }

    const deleteMatch = url.pathname.match(/^\/api\/claims\/transport\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const transport = decodeURIComponent(deleteMatch[1]);
      const response = await claimWorker.fetch(request, env, ctx);
      if (response.ok) {
        try { await deleteCaseSummary(env.DB, transport); }
        catch (error) { console.error('Dashboard summary delete failed', error); }
      }
      return response;
    }

    return claimWorker.fetch(request, env, ctx);
  }
};

async function lookupPreviousTransports(db, rows) {
  const refIds = [...new Set((rows || []).map((row) => String(row?.refId || '').trim()).filter(Boolean))].slice(0, 40);
  if (!refIds.length) return [];
  const placeholders = refIds.map(() => '?').join(',');
  const result = await db.prepare(`SELECT DISTINCT transport_no FROM claims WHERE ref_id IN (${placeholders})`).bind(...refIds).all();
  return (result.results || []).map((row) => row.transport_no).filter(Boolean);
}

async function requireUser(request, env, ctx) {
  const authUrl = new URL(request.url);
  authUrl.pathname = '/api/auth/me';
  authUrl.search = '';
  const authRequest = new Request(authUrl.toString(), {
    method: 'GET',
    headers: request.headers
  });
  const response = await claimWorker.fetch(authRequest, env, ctx);
  if (!response.ok) return { response, user: null };
  const payload = await response.clone().json();
  return { response: null, user: payload.user };
}

function checkMutationOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) {
    return new Response(JSON.stringify({ status: 'error', message: 'Origin ไม่ถูกต้อง' }), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
  return null;
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ status: 'error', message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function withApiHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
