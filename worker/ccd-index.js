import baseWorker from './index.js';
import { ALLOWED_STATUSES, ALLOWED_WHO, cleanText } from '../lib/claim-logic.js';

const OPTION_CATEGORIES = Object.freeze({
  claims_reason: 'Claims Reason',
  status: 'Status',
  who: 'WHO',
  cause_group: 'Cause Group',
  root_cause: 'ROOT CAUSE',
  check_result: 'Check',
  adjust_code: 'Adjust Code',
  status_sc: 'Status SC',
  remark_list: 'Remark List'
});

const CLAIM_CCD_HEADERS = [
  'Store Code', 'Store Name (Thai)', 'Claim DC', 'Received Date', 'Claim Date',
  'Transport No.', 'VehicleNo.', 'Driver', 'DN No.', 'Route', 'Pallet No.',
  'Basket No.', 'Article', 'Barcode', 'Description', 'Delivery Qty (PU/Kg)',
  'Received QTY (PU/Kg)', 'Claim Qty (PU/Kg)', 'Claims Reason', 'Amount claim',
  'Ship Date', 'Update status', 'WHO', 'Format Type', 'Claim NO', 'Reference_No.',
  'Cause Group', 'ROOT CAUSE', 'Check', 'Remark List', 'Eggs', 'Format Type',
  'MANAGE_WEIGHT', 'Adjust Code', 'Status SC', 'Remark', 'Store Hyper 100 %',
  'SKU_cost', 'SEG_DESCRIPTION', 'User', 'Unique Key', 'Month', 'Year'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/app.js') {
      const baseResponse = await baseWorker.fetch(request, env, ctx);
      if (!baseResponse.ok) return baseResponse;
      const headers = new Headers(baseResponse.headers);
      headers.delete('content-length');
      headers.set('content-type', 'text/javascript; charset=utf-8');
      headers.set('cache-control', 'no-cache');
      const source = await baseResponse.text();
      return new Response(`import '/ccd-adapter.js';\n${source}`, {
        status: baseResponse.status,
        statusText: baseResponse.statusText,
        headers
      });
    }

    if (!url.pathname.startsWith('/api/')) return baseWorker.fetch(request, env, ctx);

    if (url.pathname === '/api/options' || url.pathname.startsWith('/api/options/')) {
      const auth = await requireUser(request, env, ctx);
      if (auth.response) return auth.response;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) checkMutationOrigin(request, url);
      return withApiHeaders(await handleOptions(request, env, url, auth.user));
    }

    if (url.pathname === '/api/export' && request.method.toUpperCase() === 'GET') {
      const auth = await requireUser(request, env, ctx);
      if (auth.response) return auth.response;
      return withApiHeaders(await exportClaimCcd(env));
    }

    if (url.pathname === '/api/claims/bulk' && request.method.toUpperCase() === 'POST') {
      const sourceRequest = request.clone();
      let body = null;
      try { body = await sourceRequest.json(); } catch { /* base worker will report invalid JSON */ }
      await syncDynamicValidationSets(env.DB, body?.rows || []);
      const response = await baseWorker.fetch(request, env, ctx);
      if (response.ok && body && Array.isArray(body.rows)) {
        await enrichSavedRows(env.DB, body.rows);
      }
      return response;
    }

    if (request.method.toUpperCase() === 'GET' &&
        (url.pathname === '/api/claims' || /^\/api\/claims\/group\//.test(url.pathname))) {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      return withApiHeaders(await augmentClaimResponse(response, env.DB));
    }

    return baseWorker.fetch(request, env, ctx);
  }
};

async function handleOptions(request, env, url, user) {
  const method = request.method.toUpperCase();
  if (method === 'GET') return optionsResponse(env.DB);

  if (method === 'POST' && url.pathname === '/api/options') {
    const body = await readJson(request);
    const category = cleanText(body.category);
    const value = cleanText(body.value);
    if (!OPTION_CATEGORIES[category]) return json(422, { status: 'error', message: 'ประเภท Dropdown ไม่ถูกต้อง' });
    if (!value) return json(422, { status: 'error', message: 'กรุณาระบุค่าที่ต้องการเพิ่ม' });
    const max = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS n FROM dropdown_options WHERE category = ?'
    ).bind(category).first();
    try {
      await env.DB.prepare(`
        INSERT INTO dropdown_options(category,value,sort_order,created_by,created_at)
        VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(category, value, Number(max?.n || 0) + 10, user.username).run();
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('unique')) {
        return json(409, { status: 'error', message: 'รายการนี้มีอยู่แล้ว' });
      }
      throw error;
    }
    return optionsResponse(env.DB);
  }

  const match = url.pathname.match(/^\/api\/options\/([^/]+)\/(\d+)$/);
  if (method === 'DELETE' && match) {
    const category = decodeURIComponent(match[1]);
    const id = Number(match[2]);
    if (!OPTION_CATEGORIES[category]) return json(422, { status: 'error', message: 'ประเภท Dropdown ไม่ถูกต้อง' });
    const result = await env.DB.prepare(
      'DELETE FROM dropdown_options WHERE id = ? AND category = ?'
    ).bind(id, category).run();
    if (!Number(result.meta?.changes || 0)) return json(404, { status: 'error', message: 'ไม่พบรายการที่ต้องการลบ' });
    return optionsResponse(env.DB);
  }

  return json(404, { status: 'error', message: 'ไม่พบ API ที่เรียกใช้' });
}

async function optionsResponse(db) {
  const result = await db.prepare(`
    SELECT id, category, value, sort_order, created_by, created_at
    FROM dropdown_options
    ORDER BY category, sort_order, id
  `).all();
  return json(200, {
    status: 'success',
    categories: OPTION_CATEGORIES,
    data: result.results || []
  });
}

async function syncDynamicValidationSets(db, sourceRows = []) {
  const result = await db.prepare(
    "SELECT category, value FROM dropdown_options WHERE category IN ('status','who') ORDER BY sort_order,id"
  ).all();
  const statuses = [];
  const who = [];
  for (const row of result.results || []) {
    if (row.category === 'status') statuses.push(row.value);
    if (row.category === 'who') who.push(row.value);
  }
  for (const row of sourceRows || []) {
    const status = cleanText(row?.status);
    const whoValue = cleanText(row?.who);
    if (status && !statuses.includes(status)) statuses.push(status);
    if (whoValue && !who.includes(whoValue)) who.push(whoValue);
  }
  if (statuses.length) {
    ALLOWED_STATUSES.clear();
    statuses.forEach((value) => ALLOWED_STATUSES.add(value));
  }
  if (who.length) {
    ALLOWED_WHO.clear();
    who.forEach((value) => ALLOWED_WHO.add(value));
  }
}

async function enrichSavedRows(db, rows) {
  const statements = [];
  for (const source of rows.slice(0, 10)) {
    const transport = cleanText(source?.transportNo);
    const article = cleanText(source?.article).replace(/'/g, '');
    const store = cleanText(source?.storeCode);
    const refId = cleanText(source?.refId);
    const date = cleanText(source?.replyDate);
    const [year, month] = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').map(Number) : [0, 0];
    const uniqueKey = cleanText(source?.uniqueKey) || [store, transport, article].join('|');
    const values = [
      cleanText(source?.causeGroup),
      cleanText(source?.remarkList),
      uniqueKey,
      Number(month || 0),
      Number(year || 0)
    ];

    if (refId) {
      statements.push(db.prepare(`
        UPDATE claims SET cause_group=?, remark_list=?, unique_key=?, data_month=?, data_year=?
        WHERE ref_id=?
      `).bind(...values, refId));
    } else if (transport && article) {
      statements.push(db.prepare(`
        UPDATE claims SET cause_group=?, remark_list=?, unique_key=?, data_month=?, data_year=?
        WHERE transport_no=? AND article=? AND archived=0
      `).bind(...values, transport, article));
    }
  }
  if (statements.length) await db.batch(statements);
}

async function augmentClaimResponse(response, db) {
  const payload = await response.json();
  const rows = [];
  if (Array.isArray(payload?.groups)) {
    for (const group of payload.groups) if (Array.isArray(group.rows)) rows.push(...group.rows);
  }
  if (Array.isArray(payload?.data)) rows.push(...payload.data);
  const ids = [...new Set(rows.map((row) => cleanText(row?.refId)).filter(Boolean))];
  const extras = new Map();
  for (let offset = 0; offset < ids.length; offset += 80) {
    const chunk = ids.slice(offset, offset + 80);
    const marks = chunk.map(() => '?').join(',');
    const result = await db.prepare(`
      SELECT ref_id, cause_group, remark_list, unique_key, data_month, data_year
      FROM claims WHERE ref_id IN (${marks})
    `).bind(...chunk).all();
    for (const row of result.results || []) extras.set(row.ref_id, row);
  }
  for (const row of rows) {
    const extra = extras.get(row.refId);
    if (!extra) continue;
    row.causeGroup = extra.cause_group || '';
    row.remarkList = extra.remark_list || '';
    row.uniqueKey = extra.unique_key || '';
    row.dataMonth = Number(extra.data_month || 0);
    row.dataYear = Number(extra.data_year || 0);
  }
  return json(response.status, payload);
}

async function exportClaimCcd(env) {
  const claims = await env.DB.prepare('SELECT * FROM claims ORDER BY id').all();
  const refs = await env.DB.prepare(`
    SELECT ref_no, reference_type, reply_date, claim_no, store_code, remark, source_label
    FROM claim_references ORDER BY id
  `).all();
  const refDC = [['Reference No.', 'วันที่', 'Claim No.', 'Store', 'Remark', 'Type']];
  const refTP = [['Reference No.', 'วันที่', 'Claim No.', 'Store', 'Remark', 'Type']];
  for (const row of refs.results || []) {
    const target = row.reference_type === 'TP' ? refTP : refDC;
    target.push([row.ref_no, row.reply_date, row.claim_no, row.store_code, row.remark, row.source_label]);
  }
  return json(200, {
    status: 'success',
    schema: { source: 'Claim CCD.xlsm', range: 'A:AQ', columns: 43 },
    data: {
      'Claim All BU': [CLAIM_CCD_HEADERS, ...(claims.results || []).map(claimCcdRow)],
      ReferenceDC: refDC,
      ReferenceTP: refTP
    }
  });
}

function claimCcdRow(row) {
  const date = cleanText(row.reply_date);
  const parts = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').map(Number) : [];
  const month = Number(row.data_month || parts[1] || 0);
  const year = Number(row.data_year || parts[0] || 0);
  return [
    row.store_code, row.store_name, row.claim_dc, row.received_date, row.reported_date,
    row.transport_no, row.vehicle_no, row.driver, row.dn_no, row.route, row.pallet_no,
    row.basket_no, row.article, row.barcode, row.description, row.sent_qty,
    row.received_qty, row.claim_qty, row.reason, Number(row.amount || 0), row.reply_date,
    row.update_status, row.who, row.format_type, row.claim_no, row.reference_no,
    row.cause_group || '', row.root_cause, row.check_result, row.remark_list || '',
    row.list_eggs, row.store_type, row.manage_weight, row.sc, row.complete_sc, row.remark,
    row.check_100, Number(row.sku_cost || 0), row.seg_description, row.created_by,
    row.unique_key || [row.store_code, row.transport_no, row.article].join('|'), month, year
  ];
}

async function requireUser(request, env, ctx) {
  const authUrl = new URL(request.url);
  authUrl.pathname = '/api/auth/me';
  authUrl.search = '';
  const authRequest = new Request(authUrl.toString(), {
    method: 'GET',
    headers: request.headers
  });
  const response = await baseWorker.fetch(authRequest, env, ctx);
  if (!response.ok) return { response, user: null };
  const body = await response.clone().json();
  return { response: null, user: body.user };
}

function checkMutationOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) {
    const error = new Error('Origin ไม่ถูกต้อง');
    error.statusCode = 403;
    throw error;
  }
}

async function readJson(request) {
  try { return await request.json(); }
  catch {
    const error = new Error('รูปแบบ JSON ไม่ถูกต้อง');
    error.statusCode = 400;
    throw error;
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
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
