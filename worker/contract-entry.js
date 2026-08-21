import core from './main.js';

export const CLAIM_HEADERS = [
  'Store Code','Store Name (Thai)','Claim DC','Received Date','Claim Date','Transport No.','VehicleNo.','Driver','DN No.','Route','Pallet No.','Basket No.','Article','Barcode','Description','Delivery Qty (PU/Kg)','Received QTY (PU/Kg)','Claim Qty (PU/Kg)','Claims Reason','Amount claim','Ship Date','Update status','WHO','Format Type','Claim NO','Reference_No.','Cause Group','ROOT CAUSE','Check','Remark List','Eggs','Format Type','MANAGE_WEIGHT','SC','Complet SC','Remark','Store Hyper เช็ค 100 %','SKU_cost','SEG_DESCRIPTION','ผู้บันทึกข้อมูล','Unique Key','Month','Year'
];

const BUILD = '2026-08-21-ccd-contract-v4';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/build') {
        const base = await core.fetch(request, env);
        let info = {};
        try { info = await base.json(); } catch {}
        return json({ ...info, build: BUILD, contract: 'A:AQ/43', entrypoint: 'worker/contract-entry.js' });
      }
      if (url.pathname === '/api/claims/bulk' && request.method === 'POST') return saveAndAlign(request, env);
      if (url.pathname === '/api/history/import' && request.method === 'POST') return importAndAlign(request, env);
      if (url.pathname === '/api/claims/export' && request.method === 'GET') return exportContract(request, env, url);
      return core.fetch(request, env);
    } catch (error) {
      console.error('Claim contract layer error', error);
      return json({ status: 'error', message: error?.message || 'Contract layer error' }, 500);
    }
  }
};

async function saveAndAlign(request, env) {
  const clone = request.clone();
  let input = {};
  try { input = await clone.json(); } catch {}
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const coreInput = { ...input, rows: rows.map(row => {
    const who = clean(row?.who);
    return (who && !['DC','TP'].includes(who)) ? { ...row, who: 'DC' } : row;
  }) };
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  const coreRequest = new Request(request.url, { method: 'POST', headers, body: JSON.stringify(coreInput) });
  const response = await core.fetch(coreRequest, env);
  if (!response.ok) return response;
  const saved = [];
  const affected = new Set();

  for (const source of rows) {
    const refId = clean(source?.refId);
    const transport = clean(source?.transportNo);
    const article = clean(source?.article).replaceAll("'", '');
    let row = null;
    if (refId) {
      row = await env.DB.prepare('SELECT * FROM claims WHERE ref_id=? LIMIT 1').bind(refId).first();
    } else if (transport && (article || clean(source?.barcode))) {
      const barcode = clean(source?.barcode).replaceAll("'", '');
      row = await env.DB.prepare('SELECT * FROM claims WHERE transport_no=? AND (article=? OR barcode=?) ORDER BY id DESC LIMIT 1').bind(transport, article, barcode).first();
    }
    if (!row) continue;

    const claimDcRaw = clean(source?.claimDc);
    const originalWho = clean(source?.who);
    const uniqueKey = normalizeUniqueKey(row.unique_key, row.created_at, row.id);
    const displayCheck100 = clean(row.store_check_100) || clean(row.check_100);
    const effectiveWho = originalWho || row.who || '';
    const effectiveReference = ['DC','TP'].includes(effectiveWho) ? (row.reference_no || '-') : '-';
    await env.DB.prepare('UPDATE claims SET claim_dc=?, unique_key=?, store_check_100=?, who=?, reference_no=? WHERE id=?')
      .bind(claimDcRaw || row.claim_dc || '', uniqueKey, displayCheck100, effectiveWho, effectiveReference, row.id).run();
    if (!['DC','TP'].includes(effectiveWho) && row.reference_no && row.reference_no !== '-') {
      await env.DB.prepare('DELETE FROM claim_references WHERE ref_no=? AND claim_no=?').bind(row.reference_no, row.claim_no || '').run();
    }

    affected.add(row.transport_no);
    if (!saved.some(x => x.transportNo === row.transport_no && x.status === row.update_status && x.who === effectiveWho)) {
      saved.push({ transportNo: row.transport_no, claimNo: row.claim_no || '', referenceNo: effectiveReference, status: row.update_status || '', who: effectiveWho, formatType: row.format_type || '' });
    }
  }
  for (const transport of affected) await refreshCase(env, transport);
  let body = {};
  try { body = await response.clone().json(); } catch {}
  return json({ ...body, saved, contract: 'A:AQ/43' }, response.status);
}

async function importAndAlign(request, env) {
  const clone = request.clone();
  let input = {};
  try { input = await clone.json(); } catch {}
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const coreRows = rows.map(a => {
    if (!Array.isArray(a)) return a;
    const copy = [...a];
    copy[41] = monthNumber(copy[41], copy[20]);
    if (!copy[42]) copy[42] = yearFromAnyDate(copy[20]);
    return copy;
  });
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  const coreRequest = new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ ...input, rows: coreRows }) });
  const response = await core.fetch(coreRequest, env);
  if (!response.ok) return response;

  for (const a of rows) {
    if (!Array.isArray(a) || a.length < 43) continue;
    const uniqueKey = clean(a[40]);
    const transport = clean(a[5]);
    const article = clean(a[12]).replaceAll("'", '');
    const claimDc = clean(a[2]);
    const storeCheck100 = clean(a[36]);
    let row = uniqueKey ? await env.DB.prepare('SELECT id FROM claims WHERE ref_id=? OR unique_key=? ORDER BY id DESC LIMIT 1').bind(uniqueKey, uniqueKey).first() : null;
    if (!row && transport && (article || clean(a[13]))) {
      const barcode = clean(a[13]).replaceAll("'", '');
      row = await env.DB.prepare('SELECT id FROM claims WHERE transport_no=? AND (article=? OR barcode=?) ORDER BY id DESC LIMIT 1').bind(transport, article, barcode).first();
    }
    if (!row) continue;
    await env.DB.prepare('UPDATE claims SET claim_dc=?, unique_key=?, store_check_100=? WHERE id=?')
      .bind(claimDc, uniqueKey || `${transport}|${article}`, storeCheck100, row.id).run();
  }
  return response;
}

async function exportContract(request, env, url) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const where = ['archived=0'];
  const params = [];
  const start = clean(url.searchParams.get('startDate'));
  const end = clean(url.searchParams.get('endDate'));
  const status = clean(url.searchParams.get('status'));
  const format = clean(url.searchParams.get('format'));
  if (start) { where.push('reply_date>=?'); params.push(start); }
  if (end) { where.push('reply_date<=?'); params.push(end); }
  if (status && status !== 'all') { where.push('update_status=?'); params.push(status); }
  if (format && format !== 'all') { where.push('format_type=?'); params.push(format); }
  const result = await env.DB.prepare(`SELECT * FROM claims WHERE ${where.join(' AND ')} ORDER BY id`).bind(...params).all();
  const rows = (result.results || []).map(toContractRow);
  return json({ status: 'success', headers: CLAIM_HEADERS, rows, count: rows.length, contract: 'A:AQ/43' });
}

async function authenticate(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/auth/me';
  url.search = '';
  const response = await core.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  let body = {};
  try { body = await response.json(); } catch {}
  return { user: body.user || null };
}

function toContractRow(r) {
  return [
    r.store_code || '', r.store_name || '', r.claim_dc || '', r.received_date || '', r.reported_date || '',
    r.transport_no || '', r.vehicle_no || '', r.driver || '', r.dn_no || '', r.route || '', r.pallet_no || '',
    r.basket_no || '', r.article || '', r.barcode || '', r.description || '', r.sent_qty || '', r.received_qty || '',
    r.claim_qty || '', r.reason || '', Number(r.amount || 0), r.reply_date || '', r.update_status || '', r.who || '',
    r.format_type || '', r.claim_no || '', r.reference_no === '-' ? '' : (r.reference_no || ''), r.cause_group || '',
    r.root_cause || '', r.check_result || '', r.remark_list || '', r.list_eggs || '', r.store_type || '',
    r.manage_weight || '', r.sc || '', r.complete_sc || '', r.remark || '', clean(r.store_check_100) || clean(r.check_100),
    Number(r.sku_cost || 0), r.seg_description || '', r.created_by || '', normalizeUniqueKey(r.unique_key, r.created_at, r.id),
    monthFromIso(r.reply_date), yearFromIso(r.reply_date)
  ];
}

function normalizeUniqueKey(value, createdAt, id) {
  const current = clean(value);
  if (current && !current.includes('|')) return current;
  const stamp = clean(createdAt).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (stamp) return `${stamp[1]}${stamp[2]}${stamp[3]}_${stamp[4]}${stamp[5]}${stamp[6]}_${String(Number(id || 0) % 1000).padStart(3, '0')}`;
  return current || `ROW_${String(id || '')}`;
}
function monthFromIso(value) { const m = clean(value).match(/^\d{4}-(\d{2})-\d{2}/); return m ? (MONTHS[Number(m[1]) - 1] || '') : ''; }
function yearFromIso(value) { const m = clean(value).match(/^(\d{4})-/); return m ? Number(m[1]) : ''; }
function monthNumber(value, fallbackDate = '') {
  const textValue = clean(value);
  if (/^\d{1,2}$/.test(textValue)) return Math.min(12, Math.max(1, Number(textValue)));
  const index = MONTHS.findIndex(m => m.toLowerCase() === textValue.slice(0,3).toLowerCase());
  if (index >= 0) return index + 1;
  const iso = clean(fallbackDate).match(/^\d{4}-(\d{2})-\d{2}$/);
  const dmy = clean(fallbackDate).match(/^\d{1,2}\/(\d{1,2})\/\d{4}$/);
  return iso ? Number(iso[1]) : dmy ? Number(dmy[1]) : 0;
}
function yearFromAnyDate(value) {
  const textValue = clean(value);
  const iso = textValue.match(/^(\d{4})-/);
  const dmy = textValue.match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
  return iso ? Number(iso[1]) : dmy ? Number(dmy[1]) : 0;
}
function clean(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function bangkokTimestamp() { return new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date()); }
async function refreshCase(env, transport) {
  const row = await env.DB.prepare(`SELECT transport_no,MAX(store_code) store_code,MAX(reply_date) reply_date,CASE WHEN SUM(CASE WHEN update_status='Reject' THEN 1 ELSE 0 END)>0 THEN 'Reject' WHEN SUM(CASE WHEN update_status='Pending' THEN 1 ELSE 0 END)>0 THEN 'Pending' ELSE 'Accept' END dominant_status,MAX(who) who,MAX(format_type) format_type,MAX(store_type) hub,SUM(amount) total_amount,COUNT(*) item_count FROM claims WHERE archived=0 AND transport_no=? GROUP BY transport_no`).bind(transport).first();
  if (!row) { await env.DB.prepare('DELETE FROM claim_case_summary WHERE transport_no=?').bind(transport).run(); return; }
  await env.DB.prepare(`INSERT INTO claim_case_summary(transport_no,store_code,reply_date,dominant_status,who,format_type,hub,total_amount,item_count,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(transport_no) DO UPDATE SET store_code=excluded.store_code,reply_date=excluded.reply_date,dominant_status=excluded.dominant_status,who=excluded.who,format_type=excluded.format_type,hub=excluded.hub,total_amount=excluded.total_amount,item_count=excluded.item_count,updated_at=excluded.updated_at`)
    .bind(row.transport_no,row.store_code,row.reply_date,row.dominant_status,row.who,row.format_type,row.hub,Number(row.total_amount||0),Number(row.item_count||0),bangkokTimestamp()).run();
}
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-claim-build':BUILD, 'x-claim-contract':'A:AQ/43' } }); }
