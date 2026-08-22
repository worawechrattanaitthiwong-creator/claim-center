import { createHash } from 'node:crypto';
import v7, { CLAIM_HEADERS } from './v7-entry.js';

const BUILD = '2026-08-22-store-dc-workflow-v8';
const COOKIE = 'claim_session';
const STORE_EDITABLE = new Set(['SUBMITTED', 'RETURNED_TO_STORE']);
const REVIEW_STATUSES = new Set(['UNDER_REVIEW', 'PENDING', 'ACCEPT', 'REJECT', 'PARTIAL', 'CLOSED']);
const OPTION_CATEGORIES = new Set(['store_topic','claims_reason','status','who','cause_group','root_cause','check_result','adjust_code','status_sc','remark_list','claim_dc']);

export { CLAIM_HEADERS };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/build') {
        return json({
          status: 'success',
          build: BUILD,
          runtime: 'worker/v8-entry.js',
          features: ['store-master-entry','transport-ticket','dc-return-to-store','role-readonly','registry-admin-edit','scoped-backup','dropdown-manager']
        });
      }

      if (isHtmlEntry(request, url)) return serveCorporateShell(request, env);

      const method = request.method.toUpperCase();
      if (url.pathname === '/api/options' && method === 'GET') {
        const user = await requireUser(request, env);
        return listOptions(env, user, false);
      }
      if (url.pathname === '/api/options' && method === 'POST') {
        const user = await requireUser(request, env);
        checkOrigin(request, url);
        dropdownEditor(user);
        return addOption(request, env, user);
      }
      const legacyOptionDelete = url.pathname.match(/^\/api\/options\/(\d+)$/);
      if (legacyOptionDelete && method === 'DELETE') {
        const user = await requireUser(request, env);
        checkOrigin(request, url);
        dropdownEditor(user);
        return deleteOption(env, Number(legacyOptionDelete[1]), user);
      }

      // Harden V7 Store routes: DC/Trainer cannot impersonate Store and Trainer is read-only.
      if (url.pathname === '/api/v7/dc/queue' && method === 'GET') {
        const user = await requireUser(request, env);
        viewStore(user);
        return dcQueue(env, url);
      }
      if (url.pathname === '/api/v7/store/summary' && method === 'GET') {
        const user = await requireUser(request, env);
        return storeSummary(env, url, user);
      }
      if (url.pathname === '/api/v7/store/cases' && method === 'GET') {
        const user = await requireUser(request, env);
        return storeCasesList(env, url, user);
      }
      if (url.pathname === '/api/v7/store/cases' && method === 'POST') {
        const user = await requireUser(request, env);
        checkOrigin(request, url);
        return storeCaseCreate(request, env, user);
      }
      const oldCase = url.pathname.match(/^\/api\/v7\/store\/cases\/(\d+)$/);
      if (oldCase && method === 'GET') {
        const user = await requireUser(request, env);
        return storeCaseGet(env, Number(oldCase[1]), user);
      }
      const oldStatus = url.pathname.match(/^\/api\/v7\/store\/cases\/(\d+)\/status$/);
      if (oldStatus && method === 'POST') {
        const user = await requireUser(request, env);
        checkOrigin(request, url);
        reviewer(user);
        return reviewStatus(request, env, Number(oldStatus[1]), user);
      }

      if (url.pathname.startsWith('/api/v8/')) return v8Api(request, env, url);
      return v7.fetch(request, env);
    } catch (error) {
      console.error(error);
      return json({ status: 'error', message: error?.publicMessage || error?.message || 'Internal error' }, error?.status || 500);
    }
  }
};

async function v8Api(req, env, url) {
  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  const user = await requireUser(req, env);
  if (!['GET', 'HEAD'].includes(method)) checkOrigin(req, url);

  if (url.pathname === '/api/v8/me' && method === 'GET') return json({ status: 'success', user: publicUser(user) });

  if (url.pathname === '/api/v8/options' && method === 'GET') return listOptions(env, user, true);
  if (url.pathname === '/api/v8/options' && method === 'POST') {
    dropdownEditor(user);
    return addOption(req, env, user);
  }
  const optionMatch = url.pathname.match(/^\/api\/v8\/options\/(\d+)$/);
  if (optionMatch && method === 'PATCH') {
    dropdownEditor(user);
    return updateOption(req, env, Number(optionMatch[1]), user);
  }
  if (optionMatch && method === 'DELETE') {
    dropdownEditor(user);
    return deleteOption(env, Number(optionMatch[1]), user);
  }

  if (url.pathname === '/api/v8/master/articles' && method === 'GET') return searchArticles(env, url);
  if (url.pathname === '/api/v8/store/info' && method === 'GET') return storeInfo(env, url, user);

  if (url.pathname === '/api/v8/store/cases' && method === 'GET') return storeCasesList(env, url, user);
  if (url.pathname === '/api/v8/store/cases' && method === 'POST') return storeCaseCreate(req, env, user);
  const caseMatch = url.pathname.match(/^\/api\/v8\/store\/cases\/(\d+)$/);
  if (caseMatch && method === 'GET') return storeCaseGet(env, Number(caseMatch[1]), user);
  if (caseMatch && method === 'PATCH') return storeCaseUpdate(req, env, Number(caseMatch[1]), user);
  if (caseMatch && method === 'DELETE') return storeCaseDelete(env, Number(caseMatch[1]), user);
  const returnMatch = url.pathname.match(/^\/api\/v8\/store\/cases\/(\d+)\/return$/);
  if (returnMatch && method === 'POST') {
    reviewer(user);
    return returnToStore(req, env, Number(returnMatch[1]), user);
  }
  const reviewMatch = url.pathname.match(/^\/api\/v8\/store\/cases\/(\d+)\/status$/);
  if (reviewMatch && method === 'POST') {
    reviewer(user);
    return reviewStatus(req, env, Number(reviewMatch[1]), user);
  }

  if (url.pathname === '/api/v8/dc/queue' && method === 'GET') {
    viewStore(user);
    return dcQueue(env, url);
  }
  if (url.pathname === '/api/v8/store/summary' && method === 'GET') return storeSummary(env, url, user);

  if (url.pathname === '/api/v8/registry' && method === 'GET') return registryList(env, url, user);
  const registryMatch = url.pathname.match(/^\/api\/v8\/registry\/([^/]+)$/);
  if (registryMatch && method === 'GET') return registryGet(env, decodeURIComponent(registryMatch[1]), user);
  if (registryMatch && method === 'PATCH') {
    admin(user);
    return registryUpdate(req, env, decodeURIComponent(registryMatch[1]), user);
  }
  if (registryMatch && method === 'DELETE') {
    admin(user);
    return registryDeleteCase(env, decodeURIComponent(registryMatch[1]), user);
  }
  const registryItem = url.pathname.match(/^\/api\/v8\/registry\/item\/(\d+)$/);
  if (registryItem && method === 'DELETE') {
    admin(user);
    return registryDeleteItem(env, Number(registryItem[1]), user);
  }

  if (url.pathname === '/api/v8/backup' && method === 'GET') return backupExport(env, user);
  if (url.pathname === '/api/v8/backup/restore' && method === 'POST') return backupRestore(req, env, user);
  if (url.pathname === '/api/v8/admin/purge' && method === 'POST') {
    admin(user);
    return adminPurge(req, env, user);
  }

  return json({ status: 'error', message: 'V8 API not found' }, 404);
}

async function serveCorporateShell(request, env) {
  const asset = await env.ASSETS.fetch(request);
  if (!asset.ok) return asset;
  let html = await asset.text();
  html = html
    .replace('<title>Claim Center · Collaboration V7</title>', '<title>Claim Center · Store & DC Operations</title>')
    .replace('<script type="module" src="/app.js?v=20260822-v7"></script>', '<script type="module" src="/app.js?v=20260822-v7"></script><script type="module" src="/v8.js?v=20260822-v8"></script>')
    .replace('<link rel="stylesheet" href="/styles.css?v=20260822-v7">', '<link rel="stylesheet" href="/styles.css?v=20260822-v7"><link rel="stylesheet" href="/v8.css?v=20260822-v8">')
    .replace('รับแจ้งจาก Store, ตรวจสอบที่ DC, ตัดสินใจรายสินค้า, ติดตามสถานะและสนทนาในเคสเดียว — โดยคง Business Logic จาก CCD CLAIM', 'เชื่อมงาน Store และ DC ตั้งแต่รับแจ้ง ตรวจสอบ แก้ไข ตัดสินใจ และติดตามผลใน Ticket เดียว')
    .replace('<div class="login-points"><article><b>43</b><span>CCD columns A:AQ</span></article><article><b>LIVE</b><span>Store ↔ DC updates</span></article><article><b>TRACE</b><span>Audit & chat history</span></article></div>', '<div class="login-points"><article><b>TICKET</b><span>Transport เป็นเลขหลักของเคส</span></article><article><b>MASTER</b><span>ข้อมูลสินค้าและราคาจาก Master</span></article><article><b>TRACE</b><span>ติดตามสถานะและประวัติการทำงาน</span></article></div>')
    .replace('D1 Connected', 'ระบบพร้อมใช้งาน')
    .replace('รองรับ XLSX, CSV, JSON และ TSV โดยยังคง A:AQ 43 คอลัมน์', 'เลือกเงื่อนไขและดาวน์โหลดข้อมูลสำหรับงานปฏิบัติการได้หลายรูปแบบ')
    .replace('ใช้ Logic เดิมของ CCD และ API เดิม ระบบส่วนนี้ยังคงทำงานร่วมกับ V7', 'ตรวจสอบความถูกต้องของข้อมูลก่อนนำไปใช้งานต่อ')
    .replace('Store Portal</button>', 'Store View</button>');
  const headers = new Headers(asset.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(html, { status: asset.status, headers });
}

function isHtmlEntry(req, url) {
  if (req.method !== 'GET') return false;
  return url.pathname === '/' || url.pathname === '/index.html';
}

async function listOptions(env, user, includeInactive) {
  const where = includeInactive && canEditDropdown(user) ? '' : 'WHERE active=1';
  const r = await env.DB.prepare(`SELECT id,category,value,sort_order,active,created_by,created_at FROM dropdown_options ${where} ORDER BY category,sort_order,id`).all();
  const rows = r.results || [];
  const grouped = {};
  for (const row of rows) {
    if (!row.active && !includeInactive) continue;
    (grouped[row.category] ||= []).push({ id: row.id, value: row.value, sortOrder: row.sort_order, active: Boolean(row.active) });
  }
  return json({ status: 'success', data: includeInactive ? rows : grouped, grouped });
}

async function addOption(req, env, user) {
  const b = await body(req);
  const category = text(b.category);
  const value = text(b.value);
  if (!OPTION_CATEGORIES.has(category)) return json({ status: 'error', message: 'หมวด Dropdown ไม่ถูกต้อง' }, 422);
  if (!value) return json({ status: 'error', message: 'กรุณาระบุค่าตัวเลือก' }, 422);
  const order = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 999;
  try {
    const r = await env.DB.prepare('INSERT INTO dropdown_options(category,value,sort_order,active,created_by,created_at) VALUES(?,?,?,1,?,?) RETURNING id')
      .bind(category, value, order, user.username, now()).first();
    await audit(env, user.username, 'ADD_DROPDOWN_V8', `${category}:${value}`, '', '', '', `id=${r?.id || ''}`);
    return listOptions(env, user, true);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return json({ status: 'error', message: 'ตัวเลือกนี้มีอยู่แล้ว' }, 409);
    throw e;
  }
}

async function updateOption(req, env, id, user) {
  const b = await body(req);
  const old = await env.DB.prepare('SELECT * FROM dropdown_options WHERE id=?').bind(id).first();
  if (!old) return json({ status: 'error', message: 'ไม่พบตัวเลือก' }, 404);
  const category = text(b.category || old.category);
  const value = text(b.value || old.value);
  const order = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number(old.sort_order || 0);
  const active = b.active === undefined ? Number(old.active) : (b.active ? 1 : 0);
  if (!OPTION_CATEGORIES.has(category) || !value) return json({ status: 'error', message: 'ข้อมูล Dropdown ไม่ถูกต้อง' }, 422);
  await env.DB.prepare('UPDATE dropdown_options SET category=?,value=?,sort_order=?,active=? WHERE id=?')
    .bind(category, value, order, active, id).run();
  await audit(env, user.username, 'UPDATE_DROPDOWN_V8', String(id), '', '', '', `${old.category}:${old.value} -> ${category}:${value}`);
  return listOptions(env, user, true);
}

async function deleteOption(env, id, user) {
  const old = await env.DB.prepare('SELECT * FROM dropdown_options WHERE id=?').bind(id).first();
  if (!old) return json({ status: 'error', message: 'ไม่พบตัวเลือก' }, 404);
  await env.DB.prepare('DELETE FROM dropdown_options WHERE id=?').bind(id).run();
  await audit(env, user.username, 'DELETE_DROPDOWN_V8', String(id), '', '', '', `${old.category}:${old.value}`);
  return listOptions(env, user, true);
}

async function searchArticles(env, url) {
  const q = text(url.searchParams.get('q'));
  if (q.length < 1) return json({ status: 'success', data: [] });
  const like = `%${q}%`;
  const r = await env.DB.prepare(`
    SELECT a.article,a.barcode,a.description,a.item_value sku_cost,a.seg_description,a.manage_weight,a.eggs
    FROM master_articles a
    JOIN master_article_state s ON s.id=1 AND a.batch_id=s.active_batch_id
    WHERE a.article LIKE ? OR a.barcode LIKE ? OR a.description LIKE ?
    ORDER BY CASE WHEN a.article=? THEN 0 WHEN a.barcode=? THEN 1 ELSE 2 END, a.description
    LIMIT 30
  `).bind(like, like, like, q, q).all();
  return json({ status: 'success', data: r.results || [] });
}

async function storeInfo(env, url, user) {
  const requested = digits(url.searchParams.get('store'));
  const code = isStore(user) ? user.store_code : requested;
  if (!code) return json({ status: 'error', message: 'กรุณาระบุ Store Code' }, 422);
  if (!isStore(user)) viewStore(user);
  const s = await env.DB.prepare('SELECT store_code,store_name,format_type,store_type,check_100,updated_at FROM master_stores WHERE store_code=?').bind(code).first();
  if (!s) return json({ status: 'error', message: 'ไม่พบ Store ใน Master Store' }, 404);
  return json({ status: 'success', data: s });
}

async function storeCaseCreate(req, env, user) {
  if (!isStore(user) && !isAdmin(user)) throw pub(403, 'DC/Trainer ดูข้อมูล Store ได้แบบอ่านอย่างเดียว');
  const b = await body(req, 2 * 1024 * 1024);
  const storeCode = isStore(user) ? user.store_code : digits(b.storeCode);
  if (!storeCode) return json({ status: 'error', message: 'กรุณาระบุ Store Code' }, 422);
  const store = await env.DB.prepare('SELECT * FROM master_stores WHERE store_code=?').bind(storeCode).first();
  if (!store) return json({ status: 'error', message: 'Store Code ไม่พบใน Master Store' }, 422);
  const payload = await normalizeStorePayload(env, b, storeCode, store);
  const caseNo = await nextStoreCaseNo(env);
  const t = now();
  const r = await env.DB.prepare(`
    INSERT INTO store_cases(
      case_no,store_code,store_name,transport_no,ship_date,subject,reason,details,items_json,amount,status,claim_no,
      created_by,assigned_to,version,dispute_status,closed_at,created_at,updated_at,
      received_date,claim_date,claim_dc,vehicle_no,driver,dn_no,route,pallet_no,basket_no,correction_note,returned_at,returned_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'SUBMITTED','',?,'',1,'','',?,?,?,?,?,?,?,?,?,?,?,'','','')
    RETURNING id
  `).bind(
    caseNo, storeCode, text(store.store_name), payload.transportNo, payload.claimDate, payload.subject, payload.reason, payload.details,
    JSON.stringify(payload.items), payload.amount, user.username, t, t,
    payload.receivedDate, payload.claimDate, payload.claimDc, payload.vehicleNo, payload.driver, payload.dnNo, payload.route, payload.palletNo, payload.basketNo
  ).first();
  const id = Number(r.id);
  await replaceStoreItems(env, id, payload.items, t);
  await notify(env, 'DC', '', id, `Store ${storeCode} ส่ง Ticket ใหม่`, `Transport ${payload.transportNo} · ${payload.items.length} รายการ`, 'new');
  await audit(env, user.username, 'CREATE_STORE_TICKET_V8', caseNo, '', '', payload.transportNo, `${payload.items.length} items`);
  return json({ status: 'success', id, caseNo, transportNo: payload.transportNo, itemCount: payload.items.length, amount: payload.amount, statusText: 'SUBMITTED' }, 201);
}

async function storeCaseUpdate(req, env, id, user) {
  const c = await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();
  if (!c) return json({ status: 'error', message: 'ไม่พบ Ticket' }, 404);
  const storeOwn = isStore(user) && c.store_code === user.store_code;
  if (!isAdmin(user) && !storeOwn) throw pub(403, 'ไม่มีสิทธิ์แก้ไข Ticket นี้');
  if (storeOwn && !STORE_EDITABLE.has(c.status)) throw pub(409, 'Ticket นี้อยู่ระหว่างการตรวจสอบ จึงแก้ไขข้อมูลต้นทางไม่ได้');
  const b = await body(req, 2 * 1024 * 1024);
  if (b.version && Number(b.version) !== Number(c.version)) return json({ status: 'conflict', message: 'ข้อมูลมีการอัปเดตแล้ว กรุณาโหลดใหม่' }, 409);
  const storeCode = isStore(user) ? user.store_code : digits(b.storeCode || c.store_code);
  const store = await env.DB.prepare('SELECT * FROM master_stores WHERE store_code=?').bind(storeCode).first();
  if (!store) return json({ status: 'error', message: 'Store Code ไม่พบใน Master Store' }, 422);
  const payload = await normalizeStorePayload(env, { ...caseToPayload(c), ...b }, storeCode, store);
  const t = now();
  const nextStatus = storeOwn ? 'SUBMITTED' : text(b.status || c.status).toUpperCase();
  await env.DB.prepare(`
    UPDATE store_cases SET
      store_code=?,store_name=?,transport_no=?,ship_date=?,subject=?,reason=?,details=?,items_json=?,amount=?,
      received_date=?,claim_date=?,claim_dc=?,vehicle_no=?,driver=?,dn_no=?,route=?,pallet_no=?,basket_no=?,
      status=?,correction_note='',returned_at='',returned_by='',version=version+1,updated_at=?
    WHERE id=?
  `).bind(
    storeCode, text(store.store_name), payload.transportNo, payload.claimDate, payload.subject, payload.reason, payload.details, JSON.stringify(payload.items), payload.amount,
    payload.receivedDate, payload.claimDate, payload.claimDc, payload.vehicleNo, payload.driver, payload.dnNo, payload.route, payload.palletNo, payload.basketNo,
    nextStatus, t, id
  ).run();
  await replaceStoreItems(env, id, payload.items, t);
  if (storeOwn) await notify(env, 'DC', '', id, `${c.case_no} แก้ไขแล้ว`, `Store ${storeCode} ส่งกลับมาตรวจใหม่ · Transport ${payload.transportNo}`, 'warning');
  else await notify(env, 'STORE', storeCode, id, `${c.case_no} ถูกแก้ไขโดย Admin`, `Transport ${payload.transportNo}`, 'info');
  await audit(env, user.username, 'UPDATE_STORE_TICKET_V8', c.case_no, '', '', payload.transportNo, `${payload.items.length} items`);
  return storeCaseGet(env, id, user);
}

async function storeCaseDelete(env, id, user) {
  const c = await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();
  if (!c) return json({ status: 'error', message: 'ไม่พบ Ticket' }, 404);
  const storeOwn = isStore(user) && c.store_code === user.store_code;
  if (!isAdmin(user) && !storeOwn) throw pub(403, 'ไม่มีสิทธิ์ลบ Ticket นี้');
  if (storeOwn && !STORE_EDITABLE.has(c.status)) throw pub(409, 'Ticket นี้อยู่ระหว่างการตรวจสอบ จึงลบไม่ได้');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM notifications WHERE store_case_id=?').bind(id),
    env.DB.prepare('DELETE FROM case_messages WHERE store_case_id=?').bind(id),
    env.DB.prepare('DELETE FROM store_case_items WHERE store_case_id=?').bind(id),
    env.DB.prepare('DELETE FROM store_cases WHERE id=?').bind(id)
  ]);
  await audit(env, user.username, 'DELETE_STORE_TICKET_V8', c.case_no, '', '', c.transport_no, `store=${c.store_code}`);
  return json({ status: 'success', deleted: true, id });
}

async function returnToStore(req, env, id, user) {
  const b = await body(req);
  const note = text(b.reason || b.message);
  if (!note) return json({ status: 'error', message: 'กรุณาระบุสิ่งที่ Store ต้องแก้ไข' }, 422);
  const c = await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();
  if (!c) return json({ status: 'error', message: 'ไม่พบ Ticket' }, 404);
  if (b.version && Number(b.version) !== Number(c.version)) return json({ status: 'conflict', message: 'ข้อมูลถูกอัปเดตแล้ว กรุณาโหลดใหม่' }, 409);
  const t = now();
  await env.DB.prepare(`
    UPDATE store_cases SET status='RETURNED_TO_STORE',correction_note=?,returned_at=?,returned_by=?,assigned_to=?,closed_at='',version=version+1,updated_at=? WHERE id=?
  `).bind(note, t, user.username, user.username, t, id).run();
  await notify(env, 'STORE', c.store_code, id, `${c.case_no} ต้องแก้ไขข้อมูล`, note, 'warning');
  await audit(env, user.username, 'RETURN_TO_STORE_V8', c.case_no, c.claim_no, '', c.transport_no, note);
  return storeCaseGet(env, id, user);
}

async function reviewStatus(req, env, id, user) {
  const b = await body(req);
  const status = text(b.status).toUpperCase();
  if (!REVIEW_STATUSES.has(status)) return json({ status: 'error', message: 'สถานะตรวจสอบไม่ถูกต้อง' }, 422);
  const c = await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();
  if (!c) return json({ status: 'error', message: 'ไม่พบ Ticket' }, 404);
  if (b.version && Number(b.version) !== Number(c.version)) return json({ status: 'conflict', message: 'ข้อมูลถูกอัปเดตแล้ว กรุณาโหลดใหม่' }, 409);
  const t = now();
  const closed = ['ACCEPT','REJECT','PARTIAL','CLOSED'].includes(status) ? t : '';
  await env.DB.prepare("UPDATE store_cases SET status=?,assigned_to=?,closed_at=?,correction_note='',version=version+1,updated_at=? WHERE id=?")
    .bind(status, user.username, closed, t, id).run();
  await notify(env, 'STORE', c.store_code, id, `${c.case_no} · ${status}`, text(b.message) || `DC อัปเดตสถานะ Ticket ${c.transport_no}`, 'status');
  await audit(env, user.username, 'REVIEW_STORE_TICKET_V8', c.case_no, c.claim_no, '', c.transport_no, status);
  return storeCaseGet(env, id, user);
}

async function storeCaseGet(env, id, user) {
  const c = await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();
  if (!c) return json({ status: 'error', message: 'ไม่พบ Ticket' }, 404);
  accessStoreCase(user, c);
  let items = await env.DB.prepare('SELECT * FROM store_case_items WHERE store_case_id=? ORDER BY line_no,id').bind(id).all();
  let normalized = (items.results || []).map(itemFromDb);
  if (!normalized.length) normalized = normalizeLegacyItems(safeJson(c.items_json));
  const store = await env.DB.prepare('SELECT store_code,store_name,format_type,store_type,check_100,updated_at FROM master_stores WHERE store_code=?').bind(c.store_code).first();
  return json({ status: 'success', data: { ...c, items: normalized, item_count: normalized.length, masterStore: store || null } });
}

async function storeCasesList(env, url, user) {
  const where = [], params = [];
  if (isStore(user)) {
    where.push('c.store_code=?'); params.push(user.store_code);
  } else {
    viewStore(user);
    const store = digits(url.searchParams.get('store'));
    if (store) { where.push('c.store_code=?'); params.push(store); }
  }
  const status = text(url.searchParams.get('status')).toUpperCase();
  if (status) { where.push('c.status=?'); params.push(status); }
  const transport = text(url.searchParams.get('transport'));
  if (transport) { where.push('c.transport_no LIKE ?'); params.push(`%${transport}%`); }
  const r = await env.DB.prepare(`
    SELECT c.*,COUNT(i.id) normalized_item_count
    FROM store_cases c LEFT JOIN store_case_items i ON i.store_case_id=c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 500
  `).bind(...params).all();
  const data = (r.results || []).map(c => ({ ...c, item_count: Number(c.normalized_item_count || 0) || legacyItemCount(c.items_json) }));
  return json({ status: 'success', data });
}

async function dcQueue(env, url) {
  const where = [], params = [];
  const status = text(url.searchParams.get('status')).toUpperCase();
  if (status) { where.push('c.status=?'); params.push(status); }
  const transport = text(url.searchParams.get('transport'));
  if (transport) { where.push('c.transport_no LIKE ?'); params.push(`%${transport}%`); }
  const r = await env.DB.prepare(`
    SELECT c.*,COUNT(i.id) normalized_item_count
    FROM store_cases c LEFT JOIN store_case_items i ON i.store_case_id=c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY c.id
    ORDER BY CASE c.status WHEN 'SUBMITTED' THEN 0 WHEN 'RETURNED_TO_STORE' THEN 1 WHEN 'DISPUTED' THEN 2 WHEN 'UNDER_REVIEW' THEN 3 WHEN 'PENDING' THEN 4 ELSE 5 END,c.updated_at DESC
    LIMIT 500
  `).bind(...params).all();
  const data = (r.results || []).map(c => ({ ...c, item_count: Number(c.normalized_item_count || 0) || legacyItemCount(c.items_json) }));
  const summary = {
    tickets: data.length,
    items: data.reduce((s, c) => s + Number(c.item_count || 0), 0),
    submitted: data.filter(c => c.status === 'SUBMITTED').length,
    returned: data.filter(c => c.status === 'RETURNED_TO_STORE').length,
    disputed: data.filter(c => c.status === 'DISPUTED').length,
    working: data.filter(c => ['UNDER_REVIEW','PENDING'].includes(c.status)).length
  };
  return json({ status: 'success', data, summary });
}

async function storeSummary(env, url, user) {
  const store = isStore(user) ? user.store_code : digits(url.searchParams.get('store'));
  if (!isStore(user)) viewStore(user);
  const ym = text(url.searchParams.get('month')) || today().slice(0, 7);
  const where = ["COALESCE(NULLIF(claim_date,''),ship_date) LIKE ?"], params = [ym + '%'];
  if (store) { where.push('store_code=?'); params.push(store); }
  const r = await env.DB.prepare(`SELECT * FROM store_cases WHERE ${where.join(' AND ')}`).bind(...params).all();
  const cases = r.results || [];
  const itemCounts = cases.map(c => legacyItemCount(c.items_json));
  return json({
    status: 'success', month: ym, storeCode: store,
    data: {
      tickets: cases.length,
      cases: cases.length,
      items: itemCounts.reduce((a,b) => a+b, 0),
      amount: roundMoney(cases.reduce((s,c) => s + num(c.amount), 0)),
      submitted: cases.filter(c => c.status === 'SUBMITTED').length,
      returned: cases.filter(c => c.status === 'RETURNED_TO_STORE').length,
      pending: cases.filter(c => ['UNDER_REVIEW','PENDING','DISPUTED'].includes(c.status)).length,
      accepted: cases.filter(c => ['ACCEPT','PARTIAL','CLOSED'].includes(c.status)).length,
      rejected: cases.filter(c => c.status === 'REJECT').length
    }
  });
}

async function normalizeStorePayload(env, b, storeCode, store) {
  const transportNo = text(b.transportNo);
  if (!transportNo) throw pub(422, 'Transport No. ห้ามว่าง');
  const receivedDate = dateIso(b.receivedDate);
  const claimDate = dateIso(b.claimDate || b.shipDate) || today();
  if (!receivedDate) throw pub(422, 'กรุณาระบุวันที่รับสินค้า');
  const subject = text(b.subject);
  if (!subject) throw pub(422, 'กรุณาเลือกหัวข้อการเคลม');
  if (!(await optionExists(env, 'store_topic', subject)) && !(await optionExists(env, 'claims_reason', subject))) {
    throw pub(422, 'หัวข้อการเคลมต้องเลือกจาก Dropdown ที่ระบบกำหนด');
  }
  const rawItems = Array.isArray(b.items) ? b.items.slice(0, 100) : [];
  if (!rawItems.length) throw pub(422, 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ');
  const items = [];
  for (let i = 0; i < rawItems.length; i++) items.push(await resolveStoreItem(env, rawItems[i], i + 1));
  if (!items.length) throw pub(422, 'ไม่พบรายการสินค้าที่ถูกต้อง');
  return {
    storeCode, storeName: text(store.store_name), transportNo, receivedDate, claimDate,
    claimDc: text(b.claimDc), vehicleNo: text(b.vehicleNo), driver: text(b.driver), dnNo: text(b.dnNo),
    route: text(b.route), palletNo: text(b.palletNo), basketNo: text(b.basketNo),
    subject, reason: text(b.reason || subject), details: text(b.details),
    items, amount: roundMoney(items.reduce((s, x) => s + num(x.amount), 0))
  };
}

async function resolveStoreItem(env, raw, lineNo) {
  const article = text(raw.article).replaceAll("'", '');
  const barcode = text(raw.barcode).replaceAll("'", '');
  const description = text(raw.description || raw.productName);
  let master = null;
  const active = await env.DB.prepare('SELECT active_batch_id FROM master_article_state WHERE id=1').first();
  if (!active?.active_batch_id) throw pub(503, 'Master Article ยังไม่พร้อมใช้งาน');
  if (article) master = await env.DB.prepare('SELECT * FROM master_articles WHERE batch_id=? AND article=?').bind(active.active_batch_id, article).first();
  if (!master && barcode) master = await env.DB.prepare('SELECT * FROM master_articles WHERE batch_id=? AND barcode=? LIMIT 1').bind(active.active_batch_id, barcode).first();
  if (!master && description) master = await env.DB.prepare('SELECT * FROM master_articles WHERE batch_id=? AND lower(description)=lower(?) LIMIT 1').bind(active.active_batch_id, description).first();
  if (!master) throw pub(422, `รายการ ${lineNo}: ไม่พบสินค้าใน Master Article กรุณาเลือกสินค้าจากผลค้นหา Master`);
  const claimQty = numericText(raw.claimQty ?? raw.qty);
  const deliveryQty = numericText(raw.deliveryQty);
  const receivedQty = numericText(raw.receivedQty);
  const reason = text(raw.claimsReason || raw.reason);
  if (reason && !(await optionExists(env, 'claims_reason', reason))) throw pub(422, `รายการ ${lineNo}: สาเหตุการเคลมต้องเลือกจาก Dropdown`);
  const sku = roundMoney(master.item_value);
  return {
    lineNo, article: text(master.article), barcode: text(master.barcode), description: text(master.description),
    deliveryQty, receivedQty, claimQty, claimsReason: reason,
    skuCost: sku, amount: roundMoney(sku * num(claimQty)), remark: text(raw.remark),
    segDescription: text(master.seg_description), manageWeight: text(master.manage_weight), eggs: text(master.eggs),
    masterMatched: true
  };
}

async function replaceStoreItems(env, caseId, items, t) {
  const stmts = [env.DB.prepare('DELETE FROM store_case_items WHERE store_case_id=?').bind(caseId)];
  items.forEach((x, i) => stmts.push(
    env.DB.prepare(`INSERT INTO store_case_items(store_case_id,line_no,article,barcode,description,delivery_qty,received_qty,claim_qty,claims_reason,sku_cost,amount_claim,remark,master_matched,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
      .bind(caseId, i + 1, x.article, x.barcode, x.description, x.deliveryQty, x.receivedQty, x.claimQty, x.claimsReason, x.skuCost, x.amount, x.remark, t, t)
  ));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
}

async function registryList(env, url, user) {
  const where = ['archived=0'], params = [];
  const addLike = (key, col) => { const v = text(url.searchParams.get(key)); if (v) { where.push(`${col} LIKE ?`); params.push(`%${v}%`); } };
  addLike('claim', 'claim_no'); addLike('transport', 'transport_no');
  const store = digits(url.searchParams.get('store')); if (store) { where.push('store_code=?'); params.push(store); }
  const status = text(url.searchParams.get('status')); if (status) { where.push('update_status=?'); params.push(status); }
  if (isStore(user)) { where.push('store_code=?'); params.push(user.store_code); }
  const r = await env.DB.prepare(`
    SELECT claim_no,transport_no,store_code,MAX(store_name) store_name,MAX(claim_date) claim_date,
      COUNT(*) item_count,ROUND(SUM(amount_claim),2) total_amount,
      GROUP_CONCAT(DISTINCT update_status) statuses,MAX(updated_at) updated_at,MAX(source_channel) source_channel
    FROM claims WHERE ${where.join(' AND ')}
    GROUP BY claim_no,transport_no,store_code ORDER BY MAX(id) DESC LIMIT 500
  `).bind(...params).all();
  return json({ status: 'success', data: r.results || [], canManage: isAdmin(user) });
}

async function registryGet(env, claimNo, user) {
  const where = ['archived=0','claim_no=?'], params = [claimNo];
  if (isStore(user)) { where.push('store_code=?'); params.push(user.store_code); }
  const r = await env.DB.prepare(`SELECT * FROM claims WHERE ${where.join(' AND ')} ORDER BY id`).bind(...params).all();
  if (!(r.results || []).length) return json({ status: 'error', message: 'ไม่พบ Claim' }, 404);
  return json({ status: 'success', claimNo, rows: r.results || [], canManage: isAdmin(user) });
}

const REGISTRY_FIELDS = {
  transportNo:'transport_no', receivedDate:'received_date', claimDate:'claim_date', vehicleNo:'vehicle_no', driver:'driver',
  dnNo:'dn_no', route:'route', palletNo:'pallet_no', basketNo:'basket_no', article:'article', barcode:'barcode',
  description:'description', deliveryQty:'delivery_qty', receivedQty:'received_qty', claimQty:'claim_qty',
  claimsReason:'claims_reason', amountClaim:'amount_claim', updateStatus:'update_status', who:'who',
  causeGroup:'cause_group', rootCause:'root_cause', checkResult:'check_result', remarkList:'remark_list',
  remark:'remark', skuCost:'sku_cost'
};

async function registryUpdate(req, env, claimNo, user) {
  const b = await body(req, 2 * 1024 * 1024);
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 200) : [];
  if (!rows.length) return json({ status: 'error', message: 'ไม่มีรายการที่แก้ไข' }, 422);
  const t = now();
  let count = 0;
  for (const item of rows) {
    const id = Number(item.id || 0);
    if (!id) continue;
    const current = await env.DB.prepare('SELECT * FROM claims WHERE id=? AND claim_no=? AND archived=0').bind(id, claimNo).first();
    if (!current) continue;
    const fields = item.fields || {};
    const sets = [], vals = [];
    for (const [key, col] of Object.entries(REGISTRY_FIELDS)) {
      if (!(key in fields)) continue;
      let val = fields[key];
      if (['amount_claim','sku_cost'].includes(col)) val = roundMoney(val);
      else if (['received_date','claim_date'].includes(col)) val = dateIso(val);
      else if (['delivery_qty','received_qty','claim_qty'].includes(col)) val = numericText(val);
      else val = text(val);
      sets.push(`${col}=?`); vals.push(val);
    }
    if (!sets.length) continue;
    sets.push('updated_at=?','updated_by=?'); vals.push(t, user.username, id);
    await env.DB.prepare(`UPDATE claims SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
    count++;
  }
  await audit(env, user.username, 'UPDATE_REGISTRY_V8', claimNo, claimNo, '', '', `${count} rows`);
  return registryGet(env, claimNo, user);
}

async function registryDeleteItem(env, id, user) {
  const c = await env.DB.prepare('SELECT * FROM claims WHERE id=? AND archived=0').bind(id).first();
  if (!c) return json({ status: 'error', message: 'ไม่พบรายการ' }, 404);
  await env.DB.prepare('UPDATE claims SET archived=1,updated_at=?,updated_by=? WHERE id=?').bind(now(), user.username, id).run();
  await audit(env, user.username, 'DELETE_REGISTRY_ITEM_V8', String(id), c.claim_no, c.reference_no, c.transport_no, c.article);
  return json({ status: 'success', deleted: true, id });
}

async function registryDeleteCase(env, claimNo, user) {
  const rows = await env.DB.prepare('SELECT id,transport_no FROM claims WHERE claim_no=? AND archived=0').bind(claimNo).all();
  if (!(rows.results || []).length) return json({ status: 'error', message: 'ไม่พบ Claim' }, 404);
  await env.DB.prepare('UPDATE claims SET archived=1,updated_at=?,updated_by=? WHERE claim_no=? AND archived=0').bind(now(), user.username, claimNo).run();
  await audit(env, user.username, 'DELETE_REGISTRY_CASE_V8', claimNo, claimNo, '', text(rows.results[0]?.transport_no), `${rows.results.length} rows`);
  return json({ status: 'success', deleted: rows.results.length, claimNo });
}

async function backupExport(env, user) {
  const exportedAt = now();
  let scope = 'dc';
  const data = {};
  if (isStore(user)) {
    scope = `store:${user.store_code}`;
    const c = await env.DB.prepare('SELECT * FROM store_cases WHERE store_code=? ORDER BY id').bind(user.store_code).all();
    data.storeCases = [];
    for (const row of c.results || []) {
      const it = await env.DB.prepare('SELECT * FROM store_case_items WHERE store_case_id=? ORDER BY line_no').bind(row.id).all();
      data.storeCases.push({ ...row, items: it.results || [] });
    }
  } else if (isAdmin(user)) {
    scope = 'admin';
    data.storeCases = (await env.DB.prepare('SELECT * FROM store_cases ORDER BY id LIMIT 20000').all()).results || [];
    data.storeCaseItems = (await env.DB.prepare('SELECT * FROM store_case_items ORDER BY id LIMIT 50000').all()).results || [];
    data.claims = (await env.DB.prepare('SELECT * FROM claims ORDER BY id LIMIT 50000').all()).results || [];
    data.masterStores = (await env.DB.prepare('SELECT * FROM master_stores ORDER BY store_code LIMIT 20000').all()).results || [];
    const active = await env.DB.prepare('SELECT active_batch_id FROM master_article_state WHERE id=1').first();
    data.masterArticleState = active || {};
    if (active?.active_batch_id) data.masterArticles = (await env.DB.prepare('SELECT * FROM master_articles WHERE batch_id=? ORDER BY article LIMIT 100000').bind(active.active_batch_id).all()).results || [];
  } else {
    scope = `dc:${user.username}`;
    data.claims = (await env.DB.prepare('SELECT * FROM claims WHERE created_by=? OR updated_by=? ORDER BY id LIMIT 50000').bind(user.username, user.username).all()).results || [];
    data.assignedStoreCases = (await env.DB.prepare('SELECT * FROM store_cases WHERE assigned_to=? ORDER BY id LIMIT 20000').bind(user.username).all()).results || [];
  }
  return json({ status: 'success', backupVersion: 1, build: BUILD, exportedAt, scope, owner: user.username, data });
}

async function backupRestore(req, env, user) {
  const b = await body(req, 10 * 1024 * 1024);
  const backup = b.backup || b;
  if (Number(backup.backupVersion) !== 1 || !backup.data) return json({ status: 'error', message: 'รูปแบบ Backup ไม่ถูกต้อง' }, 422);
  let restored = 0;
  if (isStore(user)) {
    for (const c of (backup.data.storeCases || []).slice(0, 5000)) {
      if (text(c.store_code) !== user.store_code) continue;
      restored += await restoreStoreCase(env, c, user, false);
    }
  } else {
    const claims = (backup.data.claims || []).slice(0, 50000);
    for (const row of claims) {
      if (!isAdmin(user) && text(row.created_by) !== user.username && text(row.updated_by) !== user.username) continue;
      restored += await restoreClaimRow(env, row, user);
    }
    if (isAdmin(user)) {
      for (const c of (backup.data.storeCases || []).slice(0, 20000)) restored += await restoreStoreCase(env, c, user, true);
      for (const s of (backup.data.masterStores || []).slice(0, 20000)) {
        await env.DB.prepare('INSERT OR REPLACE INTO master_stores(store_code,store_name,format_type,store_type,check_100,raw_json,updated_at) VALUES(?,?,?,?,?,?,?)')
          .bind(text(s.store_code),text(s.store_name),text(s.format_type),text(s.store_type),text(s.check_100),text(s.raw_json||'[]'),now()).run();
        restored++;
      }
    }
  }
  await audit(env, user.username, 'RESTORE_BACKUP_V8', backup.scope || '', '', '', '', `${restored} records`);
  return json({ status: 'success', restored });
}

async function restoreStoreCase(env, c, user, adminMode) {
  const existing = await env.DB.prepare('SELECT * FROM store_cases WHERE case_no=?').bind(text(c.case_no)).first();
  if (existing) {
    if (!adminMode && !STORE_EDITABLE.has(existing.status)) return 0;
    const status = adminMode ? text(c.status || existing.status) : 'SUBMITTED';
    await env.DB.prepare(`
      UPDATE store_cases SET transport_no=?,ship_date=?,subject=?,reason=?,details=?,items_json=?,amount=?,received_date=?,claim_date=?,claim_dc=?,vehicle_no=?,driver=?,dn_no=?,route=?,pallet_no=?,basket_no=?,status=?,version=version+1,updated_at=? WHERE id=?
    `).bind(text(c.transport_no),dateIso(c.claim_date||c.ship_date),text(c.subject),text(c.reason),text(c.details),text(c.items_json||'[]'),roundMoney(c.amount),dateIso(c.received_date),dateIso(c.claim_date),text(c.claim_dc),text(c.vehicle_no),text(c.driver),text(c.dn_no),text(c.route),text(c.pallet_no),text(c.basket_no),status,now(),existing.id).run();
    const nested = Array.isArray(c.items) ? c.items.map(itemFromBackup) : normalizeLegacyItems(safeJson(c.items_json));
    if (nested.length) await replaceStoreItems(env, existing.id, nested, now());
    return 1;
  }
  const status = adminMode ? text(c.status || 'SUBMITTED') : 'SUBMITTED';
  const t = now();
  const r = await env.DB.prepare(`
    INSERT INTO store_cases(case_no,store_code,store_name,transport_no,ship_date,subject,reason,details,items_json,amount,status,claim_no,created_by,assigned_to,version,dispute_status,closed_at,created_at,updated_at,received_date,claim_date,claim_dc,vehicle_no,driver,dn_no,route,pallet_no,basket_no,correction_note,returned_at,returned_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    RETURNING id
  `).bind(
    text(c.case_no)||await nextStoreCaseNo(env),text(c.store_code),text(c.store_name),text(c.transport_no),dateIso(c.ship_date||c.claim_date),text(c.subject),text(c.reason),text(c.details),text(c.items_json||'[]'),roundMoney(c.amount),
    status,adminMode?text(c.claim_no):'',text(c.created_by||user.username),adminMode?text(c.assigned_to):'',adminMode?text(c.dispute_status):'',adminMode?text(c.closed_at):'',text(c.created_at||t),t,
    dateIso(c.received_date),dateIso(c.claim_date),text(c.claim_dc),text(c.vehicle_no),text(c.driver),text(c.dn_no),text(c.route),text(c.pallet_no),text(c.basket_no),adminMode?text(c.correction_note):'',adminMode?text(c.returned_at):'',adminMode?text(c.returned_by):''
  ).first();
  const nested = Array.isArray(c.items) ? c.items.map(itemFromBackup) : normalizeLegacyItems(safeJson(c.items_json));
  if (nested.length) await replaceStoreItems(env, Number(r.id), nested, t);
  return 1;
}

const CLAIM_COLUMNS = [
  'store_code','store_name','claim_dc','received_date','claim_date','transport_no','vehicle_no','driver','dn_no','route','pallet_no','basket_no','article','barcode','description',
  'delivery_qty','received_qty','claim_qty','claims_reason','amount_claim','ship_date','update_status','who','format_type','claim_no','reference_no','cause_group','root_cause',
  'check_result','remark_list','eggs','store_format','manage_weight','sc','complete_sc','remark','store_check_100','sku_cost','seg_description','created_by','unique_key','data_month',
  'data_year','archived','created_at','updated_at','updated_by','source_channel','store_case_id','case_state','dispute_status','closed_at'
];

async function restoreClaimRow(env, row, user) {
  const key = text(row.unique_key);
  if (!key) return 0;
  const exists = await env.DB.prepare('SELECT id FROM claims WHERE unique_key=?').bind(key).first();
  if (exists) return 0;
  const vals = CLAIM_COLUMNS.map(c => {
    if (['amount_claim','sku_cost'].includes(c)) return roundMoney(row[c]);
    if (c === 'archived' || c === 'data_year') return Number(row[c] || 0);
    return row[c] ?? '';
  });
  await env.DB.prepare(`INSERT INTO claims(${CLAIM_COLUMNS.join(',')}) VALUES(${marks(vals.length)})`).bind(...vals).run();
  return 1;
}

async function adminPurge(req, env, user) {
  const b = await body(req);
  const scopes = Array.isArray(b.scopes) ? [...new Set(b.scopes.map(text))] : [];
  const all = scopes.includes('all_business');
  if (!scopes.length) return json({ status: 'error', message: 'กรุณาเลือกชุดข้อมูลที่จะลบ' }, 422);
  if (text(b.confirmation) !== (all ? 'DELETE ALL' : 'DELETE')) return json({ status: 'error', message: all ? 'กรุณาพิมพ์ DELETE ALL เพื่อยืนยัน' : 'กรุณาพิมพ์ DELETE เพื่อยืนยัน' }, 422);
  const selected = all ? ['store_submissions','dc_claims','master_store','master_article','dropdowns'] : scopes;
  const counts = {};
  if (selected.includes('store_submissions')) {
    counts.storeCases = Number((await env.DB.prepare('SELECT COUNT(*) n FROM store_cases').first())?.n || 0);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM references_ledger WHERE claim_no IN (SELECT claim_no FROM claims WHERE source_channel='STORE')"),
      env.DB.prepare("DELETE FROM claims WHERE source_channel='STORE'"),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM case_messages'),
      env.DB.prepare('DELETE FROM store_case_items'),
      env.DB.prepare('DELETE FROM store_cases')
    ]);
  }
  if (selected.includes('dc_claims')) {
    counts.dcClaims = Number((await env.DB.prepare("SELECT COUNT(*) n FROM claims WHERE source_channel='DC'").first())?.n || 0);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM references_ledger WHERE claim_no IN (SELECT claim_no FROM claims WHERE source_channel='DC')"),
      env.DB.prepare("DELETE FROM claims WHERE source_channel='DC'"),
      env.DB.prepare('DELETE FROM reference_reservations'),
      env.DB.prepare('DELETE FROM claim_drafts')
    ]);
  }
  if (selected.includes('master_store')) {
    counts.masterStores = Number((await env.DB.prepare('SELECT COUNT(*) n FROM master_stores').first())?.n || 0);
    await env.DB.prepare('DELETE FROM master_stores').run();
  }
  if (selected.includes('master_article')) {
    counts.masterArticles = Number((await env.DB.prepare('SELECT COUNT(*) n FROM master_articles').first())?.n || 0);
    await env.DB.batch([
      env.DB.prepare("UPDATE master_article_state SET active_batch_id=NULL,updated_at=? WHERE id=1").bind(now()),
      env.DB.prepare('DELETE FROM master_articles'),
      env.DB.prepare('DELETE FROM master_article_batches')
    ]);
  }
  if (selected.includes('dropdowns')) {
    counts.dropdowns = Number((await env.DB.prepare('SELECT COUNT(*) n FROM dropdown_options').first())?.n || 0);
    await env.DB.prepare('DELETE FROM dropdown_options').run();
  }
  await audit(env, user.username, 'ADMIN_PURGE_V8', selected.join(','), '', '', '', JSON.stringify(counts));
  return json({ status: 'success', scopes: selected, counts, note: 'บัญชีผู้ใช้และ Audit Log ไม่ถูกลบ' });
}

async function optionExists(env, category, value) {
  const x = await env.DB.prepare('SELECT 1 ok FROM dropdown_options WHERE category=? AND value=? COLLATE NOCASE AND active=1 LIMIT 1').bind(category, value).first();
  return Boolean(x?.ok);
}

function caseToPayload(c) {
  return {
    storeCode:c.store_code, transportNo:c.transport_no, receivedDate:c.received_date, claimDate:c.claim_date || c.ship_date, claimDc:c.claim_dc,
    vehicleNo:c.vehicle_no, driver:c.driver, dnNo:c.dn_no, route:c.route, palletNo:c.pallet_no, basketNo:c.basket_no,
    subject:c.subject, reason:c.reason, details:c.details, items:normalizeLegacyItems(safeJson(c.items_json))
  };
}
function itemFromDb(x) {
  return {
    id:x.id,lineNo:x.line_no,article:x.article,barcode:x.barcode,description:x.description,deliveryQty:x.delivery_qty,receivedQty:x.received_qty,
    claimQty:x.claim_qty,claimsReason:x.claims_reason,skuCost:roundMoney(x.sku_cost),amount:roundMoney(x.amount_claim),remark:x.remark,masterMatched:Boolean(x.master_matched)
  };
}
function itemFromBackup(x) {
  return {
    lineNo:Number(x.line_no||x.lineNo||1),article:text(x.article),barcode:text(x.barcode),description:text(x.description),
    deliveryQty:numericText(x.delivery_qty??x.deliveryQty),receivedQty:numericText(x.received_qty??x.receivedQty),claimQty:numericText(x.claim_qty??x.claimQty??x.qty),
    claimsReason:text(x.claims_reason??x.claimsReason),skuCost:roundMoney(x.sku_cost??x.skuCost),amount:roundMoney(x.amount_claim??x.amount),
    remark:text(x.remark),masterMatched:Boolean(x.master_matched??x.masterMatched??1)
  };
}
function normalizeLegacyItems(v) {
  const arr = Array.isArray(v) ? v : [];
  return arr.map((x,i) => ({
    lineNo:i+1,article:text(x.article),barcode:text(x.barcode),description:text(x.description),deliveryQty:numericText(x.deliveryQty),
    receivedQty:numericText(x.receivedQty),claimQty:numericText(x.claimQty??x.qty),claimsReason:text(x.claimsReason||x.reason),
    skuCost:roundMoney(x.skuCost),amount:roundMoney(x.amount),remark:text(x.remark),masterMatched:Boolean(x.masterMatched ?? x.article)
  }));
}
function legacyItemCount(v) { return normalizeLegacyItems(safeJson(v)).length; }

async function nextStoreCaseNo(env) {
  const ym = today().slice(0,7).replace('-','');
  const key = `STORECASE:${ym}`;
  const r = await env.DB.prepare('INSERT INTO sequences(sequence_key,current_value) VALUES(?,1) ON CONFLICT(sequence_key) DO UPDATE SET current_value=current_value+1 RETURNING current_value').bind(key).first();
  return `SC-${ym}-${String(Number(r?.current_value||1)).padStart(6,'0')}`;
}

async function requireUser(req, env) {
  const token = getCookie(req);
  if (!token) throw pub(401, 'กรุณาเข้าสู่ระบบ');
  const r = await env.DB.prepare('SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1')
    .bind(sha(token), Date.now()).first();
  if (!r) throw pub(401, 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return r;
}
function publicUser(u) {
  return { id:u.id,username:u.username,displayName:u.display_name||u.nickname||u.first_name||u.username,firstName:u.first_name||'',nickname:u.nickname||'',userType:u.user_type||'dc',storeCode:u.store_code||'',role:u.role,active:Boolean(u.active) };
}
function isStore(u) { return (u.user_type || 'dc') === 'store'; }
function isAdmin(u) { return u.role === 'admin' || (u.user_type || '') === 'admin'; }
function isDc(u) { return (u.user_type || 'dc') === 'dc'; }
function isTrainer(u) { return (u.user_type || '') === 'trainer'; }
function canEditDropdown(u) { return isAdmin(u) || isDc(u); }
function dropdownEditor(u) { if (!canEditDropdown(u)) throw pub(403, 'เฉพาะ DC และ Admin ที่แก้ไข Dropdown ได้'); }
function viewStore(u) { if (isStore(u)) return; if (!(isAdmin(u)||isDc(u)||isTrainer(u))) throw pub(403, 'ไม่มีสิทธิ์ดูข้อมูล Store'); }
function reviewer(u) { if (!(isAdmin(u)||isDc(u))) throw pub(403, 'Trainer ดูข้อมูลได้อย่างเดียว ไม่สามารถแก้ไขผลตรวจสอบ'); }
function admin(u) { if (!isAdmin(u)) throw pub(403, 'Administrator only'); }
function accessStoreCase(u, c) { if (isStore(u) && c.store_code !== u.store_code) throw pub(403, 'ไม่มีสิทธิ์ดู Ticket ของ Store อื่น'); if (!isStore(u)) viewStore(u); }

async function notify(env,type,key,caseId,title,message,level='info') {
  await env.DB.prepare('INSERT INTO notifications(recipient_type,recipient_key,store_case_id,title,message,level,is_read,created_at) VALUES(?,?,?,?,?,?,0,?)')
    .bind(type,key||'',caseId||null,title,message,level,now()).run();
}
async function audit(env,username,action,key,claim='',reference='',transport='',details='') {
  await env.DB.prepare('INSERT INTO audit_log(username,action,entity_type,entity_key,claim_no,reference_no,transport_no,details,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(username,action,'V8',key,claim,reference,transport,details,now()).run();
}

function getCookie(req) {
  for (const x of (req.headers.get('cookie') || '').split(';')) {
    const [k,...v] = x.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}
function checkOrigin(req,url) { const o=req.headers.get('origin'); if(o && o!==url.origin) throw pub(403,'Origin not allowed'); }
async function body(req,max=1024*1024) {
  const len=Number(req.headers.get('content-length')||0);
  if(len>max) throw pub(413,'Payload too large');
  try{return await req.json();}catch{throw pub(400,'JSON ไม่ถูกต้อง');}
}
function pub(status,msg){const e=new Error(msg);e.status=status;e.publicMessage=msg;return e;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function text(v){return String(v??'').trim();}
function digits(v){const s=text(v).replaceAll(',','');return /^[+-]?\d+\.0+$/.test(s)?s.replace(/\.0+$/,''):s;}
function num(v){const n=Number(String(v??0).replaceAll(',',''));return Number.isFinite(n)?n:0;}
function numericText(v){const s=text(v).replaceAll(',','');return s===''?'':String(Number(s)||0);}
function roundMoney(v){return Math.round((num(v)+Number.EPSILON)*100)/100;}
function marks(n){return Array(n).fill('?').join(',');}
function safeJson(v){try{return JSON.parse(String(v||'[]'));}catch{return[];}}
function dateIso(v){
  const s=text(v);if(!s)return'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const n=Number(s);if(Number.isFinite(n)&&n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toISOString().slice(0,10);}
  return'';
}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());}
function now(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'medium'}).format(new Date());}
function sha(v){return createHash('sha256').update(String(v)).digest('hex');}
