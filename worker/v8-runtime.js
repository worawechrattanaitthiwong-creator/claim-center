import { createHash } from 'node:crypto';
import v8 from './v8-entry.js';

const COOKIE = 'claim_session';
const COMPAT_SCRIPT = '<script type="module" src="/v8-compat.js?v=20260822-compat1"></script>';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Store collaboration is read-only for Trainer, including chat messages.
    if (method === 'POST' && /^\/api\/v7\/store\/cases\/\d+\/messages$/.test(url.pathname)) {
      try {
        const user = await requireUser(request, env);
        if ((user.user_type || '') === 'trainer') {
          return json({ status: 'error', message: 'Trainer ดูข้อมูล Store ได้อย่างเดียว ไม่สามารถส่งหรือแก้ไขข้อมูลได้' }, 403);
        }
      } catch (error) {
        return json({ status: 'error', message: error?.publicMessage || error?.message || 'Unauthorized' }, error?.status || 401);
      }
    }

    const response = await v8.fetch(request, env);

    // Compatibility layer: keep the new Store/DC workflow, while restoring the original
    // Claim Workspace logic and the system-wide Decision Master behavior.
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const type = response.headers.get('content-type') || '';
      if (response.ok && type.includes('text/html')) {
        let html = await response.text();
        if (!html.includes('/v8-compat.js')) html = html.replace('</body>', `${COMPAT_SCRIPT}</body>`);
        const headers = new Headers(response.headers);
        headers.set('content-type', 'text/html; charset=utf-8');
        headers.set('cache-control', 'no-store, max-age=0');
        return new Response(html, { status: response.status, statusText: response.statusText, headers });
      }
    }

    return response;
  }
};

async function requireUser(request, env) {
  const token = getCookie(request);
  if (!token) throw pub(401, 'กรุณาเข้าสู่ระบบ');
  const row = await env.DB.prepare(`
    SELECT u.*, s.expires_at
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1
  `).bind(sha(token), Date.now()).first();
  if (!row) throw pub(401, 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return row;
}

function getCookie(request) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === COOKIE) return decodeURIComponent(value.join('='));
  }
  return '';
}
function sha(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function pub(status, message) { const error = new Error(message); error.status=status; error.publicMessage=message; return error; }
function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
