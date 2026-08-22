import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import v8 from './v8-entry.js';

const COOKIE = 'claim_session';
const COMPAT_SCRIPT = '<script type="module" src="/v8-compat.js?v=20260822-compat1"></script>';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // Login must remain usable even after previous failed attempts. A correct password
    // is always allowed through; invalid credentials still use the hardened V5 limiter.
    if (method === 'POST' && url.pathname === '/api/auth/login') {
      try {
        return await reliableLogin(request, env, url);
      } catch (error) {
        return json({ status: 'error', message: error?.publicMessage || error?.message || 'เข้าสู่ระบบไม่สำเร็จ' }, error?.status || 500);
      }
    }

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

async function reliableLogin(request, env, url) {
  checkOrigin(request, url);
  let payload = {};
  try { payload = await request.clone().json(); }
  catch { throw pub(400, 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง'); }
  const username = text(payload.username);
  const password = String(payload.password || '');
  if (!username || !password) throw pub(422, 'กรุณากรอก Username และ Password');

  // Preserve the original bootstrap path when the database has no users yet.
  const count = await env.DB.prepare('SELECT COUNT(*) n FROM users').first();
  if (Number(count?.n || 0) === 0) return v8.fetch(request, env);

  const user = await env.DB.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').bind(username).first();
  const valid = Boolean(user?.active) && verifyPassword(password, user?.password_hash);
  if (!valid) return v8.fetch(request, env);

  // A real user with the correct password must not remain locked out because of
  // attempts made while the UI was malfunctioning. Only that user's/IP key is cleared.
  try {
    const ip = text(request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown');
    const rateKey = sha(`${ip}|${username.toLowerCase()}`);
    await env.DB.prepare('DELETE FROM login_rate_limits WHERE rate_key=?').bind(rateKey).run();
  } catch {}

  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha(token);
  const ageSeconds = Math.max(1, Number(env.SESSION_HOURS || 10)) * 3600;
  const ts = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(ts),
    env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
      .bind(tokenHash, user.id, ts + ageSeconds * 1000, ts, ts),
    env.DB.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').bind(now(), now(), user.id)
  ]);
  try {
    await env.DB.prepare("INSERT INTO audit_log(username,action,entity_type,entity_key,claim_no,reference_no,transport_no,details,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(user.username, 'LOGIN', 'USER', String(user.id), '', '', '', 'Login success', now()).run();
  } catch {}

  const response = json({ status:'success', user: publicUser(user) });
  response.headers.append('Set-Cookie', cookie(token, ageSeconds, url.protocol === 'https:'));
  return response;
}

function publicUser(u) {
  return {
    id:u.id, username:u.username, displayName:u.display_name||u.nickname||u.first_name||u.username,
    firstName:u.first_name||'', nickname:u.nickname||'', userType:u.user_type||'dc', storeCode:u.store_code||'',
    role:u.role, active:Boolean(u.active), lastLoginAt:u.last_login_at||''
  };
}
function verifyPassword(value, encoded) {
  try {
    const [scheme, saltHex, hashHex] = String(encoded || '').split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(String(value), Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
function cookie(value, age, secure) {
  return [
    `${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict',
    secure ? 'Secure' : '', `Max-Age=${Math.max(0, Math.floor(age))}`
  ].filter(Boolean).join('; ');
}
function checkOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) throw pub(403, 'Origin not allowed');
}
function text(value) { return String(value ?? '').trim(); }
function now() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'medium'}).format(new Date()); }
