import {
  clearSessionCookie,
  hashPassword,
  isStrongPassword,
  newSessionToken,
  tokenHash,
  verifyPassword
} from '../lib/auth.js';
import { cleanText } from '../lib/claim-logic.js';
import { CLAIM_BULK_LIMIT, D1ClaimDatabase, httpError } from './d1.js';
import { injectCloudflareAdapter } from './client-adapter.js';

const COOKIE_NAME = 'claim_session';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/app.js') {
        const asset = await env.ASSETS.fetch(request);
        return withSecurityHeaders(await injectCloudflareAdapter(asset));
      }
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      const response = await handleApi(request, env, url);
      return withSecurityHeaders(response);
    } catch (error) {
      console.error('Claim Center Worker error', error);
      const status = Number(error.statusCode || (error.code === 'VALIDATION_ERROR' ? 422 : 500));
      return withSecurityHeaders(json(status, {
        status: 'error',
        message: status === 500 ? 'เกิดข้อผิดพลาดภายในระบบ' : error.message,
        details: error.details || undefined
      }));
    }
  }
};

async function handleApi(request, env, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;
  const database = new D1ClaimDatabase(env.DB);

  if (method === 'GET' && path === '/api/health') {
    const probe = await database.first('SELECT 1 AS ok');
    return json(200, { status: probe?.ok === 1 ? 'ok' : 'error', runtime: 'cloudflare-workers-d1', time: new Date().toISOString() });
  }

  if (method === 'POST' && path === '/api/auth/login') {
    await database.ensureAdmin(env.ADMIN_USERNAME || '2030164', env.ADMIN_PASSWORD || '');
    const body = await readJson(request);
    const user = await database.getUser(cleanText(body.username));
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return json(401, { status: 'error', message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }
    const token = newSessionToken();
    const maxAge = Math.max(1, Number(env.SESSION_HOURS || 10)) * 60 * 60;
    await database.saveSession(tokenHash(token), user.id, Date.now() + maxAge * 1000);
    const response = json(200, { status: 'success', user: publicUser(user) });
    response.headers.append('Set-Cookie', sessionCookie(token, maxAge, url.protocol === 'https:'));
    return response;
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    checkMutationOrigin(request, url);
    const token = readSessionCookie(request);
    if (token) await database.deleteSession(tokenHash(token));
    const response = json(200, { status: 'success' });
    response.headers.append('Set-Cookie', clearSessionCookie(url.protocol === 'https:'));
    return response;
  }

  const user = await requireAuth(request, database);

  if (method === 'GET' && path === '/api/auth/me') {
    return json(200, { status: 'success', user });
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) checkMutationOrigin(request, url);

  if (method === 'POST' && path === '/api/users/me/password') {
    const body = await readJson(request);
    if (!isStrongPassword(body.password)) return json(422, { status: 'error', message: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัว และมีทั้งตัวอักษรกับตัวเลข' });
    await database.updatePassword(user.username, hashPassword(body.password));
    return json(200, { status: 'success' });
  }

  if (path === '/api/users' && method === 'GET') {
    requireAdmin(user);
    return json(200, { status: 'success', data: await database.listUsers() });
  }
  if (path === '/api/users' && method === 'POST') {
    requireAdmin(user);
    const body = await readJson(request);
    const username = cleanText(body.username);
    if (!username) return json(422, { status: 'error', message: 'กรุณาระบุ Username' });
    if (!isStrongPassword(body.password)) return json(422, { status: 'error', message: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัว และมีทั้งตัวอักษรกับตัวเลข' });
    if (await database.getUser(username)) return json(409, { status: 'error', message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    const id = await database.createUser(username, hashPassword(body.password), body.role === 'admin' ? 'admin' : 'user');
    return json(201, { status: 'success', id });
  }
  const userDelete = path.match(/^\/api\/users\/([^/]+)$/);
  if (userDelete && method === 'DELETE') {
    requireAdmin(user);
    const username = decodeURIComponent(userDelete[1]);
    if (username.toLowerCase() === user.username.toLowerCase()) return json(422, { status: 'error', message: 'ไม่สามารถลบบัญชีที่กำลังใช้งานได้' });
    const changes = await database.deleteUser(username);
    return json(changes ? 200 : 404, { status: changes ? 'success' : 'error', message: changes ? undefined : 'ไม่พบผู้ใช้ หรือบัญชีเป็น Admin' });
  }

  if (path === '/api/masters/resolve' && method === 'POST') {
    const body = await readJson(request);
    return json(200, { status: 'success', data: await database.resolveMasters(body.articles || [], body.stores || []) });
  }

  if (path === '/api/master/stores' && method === 'POST') {
    requireAdmin(user);
    const body = await readJson(request, 8 * 1024 * 1024);
    return json(200, { status: 'success', ...await database.upsertStores(body.records || []) });
  }
  if (path === '/api/master/products' && method === 'POST') {
    requireAdmin(user);
    const body = await readJson(request, 15 * 1024 * 1024);
    return json(200, { status: 'success', ...await database.upsertProducts(body.records || []) });
  }
  if (path === '/api/master/stores/missing' && method === 'POST') {
    const body = await readJson(request);
    return json(200, { status: 'success', missing: await database.missingStores(body.codes || []) });
  }
  if (path === '/api/master/stores/missing-from-claims' && method === 'GET') {
    requireAdmin(user);
    return json(200, { status: 'success', missing: await database.missingStoresFromClaims() });
  }

  if (path === '/api/claims' && method === 'GET') {
    const result = await database.listClaims({
      offsetGroups: Number(url.searchParams.get('offset') || 0),
      limitGroups: Math.min(60, Number(url.searchParams.get('limit') || 60)),
      transport: url.searchParams.get('transport') || '',
      article: url.searchParams.get('article') || '',
      store: url.searchParams.get('store') || '',
      date: url.searchParams.get('date') || '',
      reference: url.searchParams.get('reference') || ''
    });
    return json(200, { status: 'success', ...result });
  }
  if (path === '/api/claims/bulk' && method === 'POST') {
    const body = await readJson(request, 2 * 1024 * 1024);
    if (Array.isArray(body.rows) && body.rows.length > CLAIM_BULK_LIMIT) {
      return json(413, { status: 'error', message: `ส่งได้ครั้งละไม่เกิน ${CLAIM_BULK_LIMIT} แถว กรุณาโหลดหน้าเว็บใหม่เพื่อเปิด D1 batching adapter` });
    }
    const result = await database.saveBulkClaims(user.username, body.rows || [], { bypassDate: Boolean(body.bypassDate) });
    return json(200, { status: 'success', ...result });
  }

  const claimGroup = path.match(/^\/api\/claims\/group\/([^/]+)$/);
  if (claimGroup && method === 'GET') {
    const rows = await database.getClaimGroup(decodeURIComponent(claimGroup[1]), url.searchParams.get('status') || '', url.searchParams.get('who') || '');
    return json(200, { status: 'success', data: rows });
  }
  const claimTransport = path.match(/^\/api\/claims\/transport\/([^/]+)$/);
  if (claimTransport && method === 'DELETE') {
    const changes = await database.deleteByTransport(decodeURIComponent(claimTransport[1]));
    return json(changes ? 200 : 404, { status: changes ? 'success' : 'error', deleted: changes, message: changes ? undefined : 'ไม่พบรายการที่ต้องการลบ' });
  }
  const emailStatus = path.match(/^\/api\/claims\/transport\/([^/]+)\/email$/);
  if (emailStatus && method === 'PATCH') {
    const body = await readJson(request);
    const changes = await database.setEmailStatus(decodeURIComponent(emailStatus[1]), Boolean(body.checked));
    return json(changes ? 200 : 404, { status: changes ? 'success' : 'error' });
  }
  const emailDraft = path.match(/^\/api\/claims\/transport\/([^/]+)\/email-draft$/);
  if (emailDraft && method === 'GET') {
    const data = await database.getEmailDraft(decodeURIComponent(emailDraft[1]));
    return json(data ? 200 : 404, { status: data ? 'success' : 'error', data, message: data ? undefined : 'ไม่พบข้อมูลของรอบรถนี้' });
  }

  if (path === '/api/references' && method === 'GET') {
    const type = url.searchParams.get('type') === 'TP' ? 'TP' : 'DC';
    return json(200, { status: 'success', data: await database.listReferences(type), type });
  }
  if (path === '/api/references' && method === 'POST') {
    const body = await readJson(request);
    if (!cleanText(body.refNo) || !['DC', 'TP'].includes(body.type)) return json(422, { status: 'error', message: 'ข้อมูล Reference ไม่ครบถ้วน' });
    const id = await database.addReference(body);
    return json(201, { status: 'success', id });
  }
  const referenceDelete = path.match(/^\/api\/references\/(DC|TP)\/([^/]+)$/);
  if (referenceDelete && method === 'DELETE') {
    const changes = await database.deleteReference(referenceDelete[1], decodeURIComponent(referenceDelete[2]));
    return json(changes ? 200 : 404, { status: changes ? 'success' : 'error', message: changes ? undefined : 'ไม่พบข้อมูลที่ต้องการลบ' });
  }

  if (path === '/api/performance' && method === 'GET') {
    return json(200, { status: 'success', ...await database.performance(url.searchParams.get('date') || '') });
  }

  if (path === '/api/pivot' && method === 'GET') {
    const data = await database.pivotRows({
      year: url.searchParams.get('year') || '',
      month: url.searchParams.get('month') || '',
      format: url.searchParams.get('format') || '',
      limit: Number(url.searchParams.get('limit') || 50000)
    });
    return json(200, { status: 'success', data, meta: { limit: 50000, note: 'Cloudflare phase 1 caps raw Pivot rows; server-side Pivot aggregation is planned next.' } });
  }

  if (path === '/api/export' && method === 'GET') {
    const data = await database.exportData({
      startDate: url.searchParams.get('startDate') || '',
      endDate: url.searchParams.get('endDate') || '',
      status: url.searchParams.get('status') || 'all',
      format: url.searchParams.get('format') || 'all'
    });
    return json(200, { status: 'success', data });
  }

  return json(404, { status: 'error', message: 'ไม่พบ API ที่เรียกใช้' });
}

async function requireAuth(request, database) {
  const token = readSessionCookie(request);
  const session = token ? await database.getSession(tokenHash(token)) : null;
  if (!session) throw httpError(401, 'กรุณาเข้าสู่ระบบใหม่');
  return publicUser(session);
}

function requireAdmin(user) {
  if (user.role !== 'admin') throw httpError(403, 'ไม่มีสิทธิ์ดำเนินการ');
}

function publicUser(user) {
  return { id: Number(user.id), username: user.username, role: user.role };
}

function readSessionCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  for (const item of cookie.split(';')) {
    const [name, ...value] = item.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(value.join('='));
  }
  return '';
}

function sessionCookie(token, maxAgeSeconds, secure) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/', 'HttpOnly', 'SameSite=Strict', secure ? 'Secure' : '',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ].filter(Boolean).join('; ');
}

function checkMutationOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw httpError(403, 'Origin ไม่ถูกต้อง');
}

async function readJson(request, maxBytes = 2 * 1024 * 1024) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > maxBytes) throw httpError(413, 'ข้อมูลที่ส่งมีขนาดใหญ่เกินกำหนด');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw httpError(413, 'ข้อมูลที่ส่งมีขนาดใหญ่เกินกำหนด');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw httpError(400, 'JSON ไม่ถูกต้อง'); }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
