const SLA_HOURS = 24;
const OPEN_STATUSES = new Set(['SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED']);
const TERMINAL_STATUSES = new Set(['ACCEPT','REJECT','PARTIAL','CLOSED']);

export default async function handlePlus(request, env, user, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (path === '/api/v8/plus/dashboard' && method === 'GET') return dashboard(env, user, url);
  if (path === '/api/v8/plus/queue' && method === 'GET') return queue(env, user, url);
  if (path === '/api/v8/plus/search' && method === 'GET') return globalSearch(env, user, url);
  if (path === '/api/v8/plus/audit' && method === 'GET') return auditList(env, user, url);
  if (path === '/api/v8/plus/report' && method === 'GET') return reportData(env, user, url);
  if (path === '/api/v8/plus/evidence/status' && method === 'GET') return json({ status:'success', enabled:Boolean(env.EVIDENCE), maxFiles:5, maxBytes:1200000 });

  const contextMatch = path.match(/^\/api\/v8\/plus\/cases\/(\d+)\/context$/);
  if (contextMatch && method === 'GET') return caseContext(env, user, Number(contextMatch[1]));

  const reopenMatch = path.match(/^\/api\/v8\/plus\/cases\/(\d+)\/reopen$/);
  if (reopenMatch && method === 'POST') return reopenCase(request, env, user, Number(reopenMatch[1]));

  const evidenceUpload = path.match(/^\/api\/v8\/plus\/cases\/(\d+)\/evidence$/);
  if (evidenceUpload && method === 'POST') return uploadEvidence(request, env, user, Number(evidenceUpload[1]));

  const evidenceMatch = path.match(/^\/api\/v8\/plus\/evidence\/(\d+)$/);
  if (evidenceMatch && method === 'GET') return getEvidence(env, user, Number(evidenceMatch[1]));
  if (evidenceMatch && method === 'DELETE') return deleteEvidence(env, user, Number(evidenceMatch[1]));

  return json({ status:'error', message:'Claim Center Plus API not found' }, 404);
}

async function dashboard(env, user, url) {
  const day = date(url.searchParams.get('date')) || today();
  const month = text(url.searchParams.get('month')) || day.slice(0, 7);
  const store = scopedStore(user, url.searchParams.get('store'));
  const storeSql = store ? ' AND store_code=?' : '';
  const storeParams = store ? [store] : [];

  const [todayCases, monthCases, monthClaims, topStores, topCauses, topTransports, myWork] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) cases, COUNT(DISTINCT transport_no) transports,
      SUM(CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END) submitted,
      SUM(CASE WHEN status='RETURNED_TO_STORE' THEN 1 ELSE 0 END) returned,
      SUM(CASE WHEN status IN ('SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED') THEN 1 ELSE 0 END) open_cases,
      COALESCE(SUM(amount),0) amount
      FROM store_cases WHERE substr(COALESCE(NULLIF(claim_date,''),created_at),1,10)=?${storeSql}`)
      .bind(day, ...storeParams).first(),
    env.DB.prepare(`SELECT COUNT(*) cases, COUNT(DISTINCT transport_no) transports,
      SUM(CASE WHEN status IN ('SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED') THEN 1 ELSE 0 END) open_cases,
      SUM(CASE WHEN status IN ('ACCEPT','REJECT','PARTIAL','CLOSED') THEN 1 ELSE 0 END) closed_cases,
      COALESCE(SUM(amount),0) amount
      FROM store_cases WHERE substr(COALESCE(NULLIF(claim_date,''),created_at),1,7)=?${storeSql}`)
      .bind(month, ...storeParams).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT claim_no) claims, COUNT(*) lines,
      COALESCE(SUM(amount_claim),0) amount,
      SUM(CASE WHEN update_status='Accept' THEN 1 ELSE 0 END) accept_lines,
      SUM(CASE WHEN update_status='Pending' THEN 1 ELSE 0 END) pending_lines,
      SUM(CASE WHEN update_status='Reject' THEN 1 ELSE 0 END) reject_lines
      FROM claims WHERE archived=0 AND substr(COALESCE(NULLIF(claim_date,''),ship_date),1,7)=?${storeSql}`)
      .bind(month, ...storeParams).first(),
    env.DB.prepare(`SELECT store_code,MAX(store_name) store_name,COUNT(DISTINCT transport_no) transports,COUNT(*) cases,COALESCE(SUM(amount),0) amount
      FROM store_cases WHERE substr(COALESCE(NULLIF(claim_date,''),created_at),1,7)=?${storeSql}
      GROUP BY store_code ORDER BY cases DESC,amount DESC LIMIT 8`).bind(month, ...storeParams).all(),
    env.DB.prepare(`SELECT claims_reason reason,COUNT(*) lines,COALESCE(SUM(amount_claim),0) amount
      FROM claims WHERE archived=0 AND substr(COALESCE(NULLIF(claim_date,''),ship_date),1,7)=?${storeSql}
      GROUP BY claims_reason HAVING claims_reason<>'' ORDER BY lines DESC,amount DESC LIMIT 8`).bind(month, ...storeParams).all(),
    env.DB.prepare(`SELECT transport_no,MAX(store_code) store_code,MAX(store_name) store_name,COUNT(*) lines,COALESCE(SUM(amount_claim),0) amount
      FROM claims WHERE archived=0 AND substr(COALESCE(NULLIF(claim_date,''),ship_date),1,7)=?${storeSql}
      GROUP BY transport_no HAVING transport_no<>'' ORDER BY amount DESC,lines DESC LIMIT 8`).bind(month, ...storeParams).all(),
    isStore(user)
      ? env.DB.prepare(`SELECT COUNT(*) n FROM store_cases WHERE store_code=? AND status IN ('SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED')`).bind(user.store_code).first()
      : env.DB.prepare(`SELECT COUNT(*) n FROM store_cases WHERE assigned_to=? AND status IN ('SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED')`).bind(user.username).first()
  ]);

  const agingRows = await env.DB.prepare(`SELECT id,case_no,store_code,store_name,transport_no,status,assigned_to,created_at,updated_at,amount
    FROM store_cases WHERE status IN ('SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED')${storeSql}
    ORDER BY created_at ASC LIMIT 500`).bind(...storeParams).all();
  const aging = (agingRows.results || []).map(withAge);
  const overdue = aging.filter(x => x.slaState === 'overdue').length;
  const warning = aging.filter(x => x.slaState === 'warning').length;

  return json({ status:'success', data:{
    day, month, slaHours:SLA_HOURS,
    today:normalizeAgg(todayCases), monthCases:normalizeAgg(monthCases), monthClaims:normalizeAgg(monthClaims),
    aging:{ open:aging.length, overdue, warning, oldest:aging.slice(0,5) },
    myWork:Number(myWork?.n || 0),
    topStores:topStores.results || [], topCauses:topCauses.results || [], topTransports:topTransports.results || []
  }});
}

async function queue(env, user, url) {
  const where = [], params = [];
  if (isStore(user)) { where.push('c.store_code=?'); params.push(user.store_code); }
  else if (text(url.searchParams.get('store'))) { where.push('c.store_code=?'); params.push(digits(url.searchParams.get('store'))); }

  const status = text(url.searchParams.get('status')).toUpperCase();
  if (status) { where.push('c.status=?'); params.push(status); }
  const transport = text(url.searchParams.get('transport'));
  if (transport) { where.push('c.transport_no LIKE ?'); params.push(`%${transport}%`); }
  const q = text(url.searchParams.get('q'));
  if (q) {
    where.push('(c.case_no LIKE ? OR c.transport_no LIKE ? OR c.store_code LIKE ? OR c.store_name LIKE ? OR c.claim_no LIKE ? OR c.subject LIKE ?)');
    const like = `%${q}%`; params.push(like,like,like,like,like,like);
  }
  if (url.searchParams.get('mine') === '1') {
    if (isStore(user)) { where.push('c.store_code=?'); params.push(user.store_code); }
    else { where.push('c.assigned_to=?'); params.push(user.username); }
  }
  if (url.searchParams.get('open') === '1') where.push("c.status IN ('SUBMITTED','UNDER_REVIEW','PENDING','RETURNED_TO_STORE','DISPUTED')");

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const r = await env.DB.prepare(`SELECT c.*,(SELECT COUNT(*) FROM store_case_items i WHERE i.store_case_id=c.id) item_count
    FROM store_cases c ${sqlWhere} ORDER BY c.updated_at DESC LIMIT 300`).bind(...params).all();
  let data = (r.results || []).map(withAge);
  const aging = text(url.searchParams.get('aging'));
  if (aging === 'overdue') data = data.filter(x => x.slaState === 'overdue');
  else if (aging === 'warning') data = data.filter(x => x.slaState === 'warning');
  return json({ status:'success', data, summary:{ total:data.length, overdue:data.filter(x=>x.slaState==='overdue').length, warning:data.filter(x=>x.slaState==='warning').length } });
}

async function globalSearch(env, user, url) {
  const q = text(url.searchParams.get('q'));
  if (q.length < 2) return json({ status:'success', data:{ cases:[],claims:[],articles:[] } });
  const like = `%${q}%`;
  const storeFilter = isStore(user) ? ' AND store_code=?' : '';
  const storeParams = isStore(user) ? [user.store_code] : [];

  const cases = await env.DB.prepare(`SELECT id,case_no,store_code,store_name,transport_no,status,claim_no,subject,amount,updated_at
    FROM store_cases WHERE (case_no LIKE ? OR transport_no LIKE ? OR store_code LIKE ? OR store_name LIKE ? OR claim_no LIKE ? OR subject LIKE ?)${storeFilter}
    ORDER BY updated_at DESC LIMIT 20`).bind(like,like,like,like,like,like,...storeParams).all();

  const claims = await env.DB.prepare(`SELECT claim_no,transport_no,store_code,MAX(store_name) store_name,MAX(update_status) status,
      COUNT(*) lines,COALESCE(SUM(amount_claim),0) amount,MAX(updated_at) updated_at
    FROM claims WHERE archived=0 AND (claim_no LIKE ? OR transport_no LIKE ? OR store_code LIKE ? OR article LIKE ? OR barcode LIKE ? OR description LIKE ?)${storeFilter}
    GROUP BY claim_no,transport_no,store_code ORDER BY updated_at DESC LIMIT 20`).bind(like,like,like,like,like,like,...storeParams).all();

  const articles = isStore(user) ? {results:[]} : await env.DB.prepare(`SELECT a.article,a.barcode,a.description,a.item_value sku_cost
    FROM master_articles a JOIN master_article_state s ON s.id=1 AND a.batch_id=s.active_batch_id
    WHERE a.article LIKE ? OR a.barcode LIKE ? OR a.description LIKE ? ORDER BY a.description LIMIT 15`).bind(like,like,like).all();

  return json({ status:'success', data:{ cases:cases.results||[], claims:claims.results||[], articles:articles.results||[] } });
}

async function caseContext(env, user, id) {
  const c = await getCase(env, user, id);
  const [items, evidence, audits, notices, messages] = await Promise.all([
    env.DB.prepare('SELECT * FROM store_case_items WHERE store_case_id=? ORDER BY line_no,id').bind(id).all(),
    env.DB.prepare('SELECT id,file_name,content_type,bytes,uploaded_by,uploaded_at FROM store_case_evidence WHERE store_case_id=? ORDER BY id DESC').bind(id).all(),
    env.DB.prepare(`SELECT id,username,action,details,created_at FROM audit_log
      WHERE entity_key=? OR transport_no=? OR (?<>'' AND claim_no=?) ORDER BY id DESC LIMIT 120`).bind(c.case_no,c.transport_no,c.claim_no,c.claim_no).all(),
    env.DB.prepare('SELECT id,title,message,level,created_at FROM notifications WHERE store_case_id=? ORDER BY id DESC LIMIT 120').bind(id).all(),
    env.DB.prepare('SELECT id,sender_username,sender_name,sender_side,message,created_at FROM case_messages WHERE store_case_id=? ORDER BY id DESC LIMIT 120').bind(id).all()
  ]);
  const lines = items.results || [];
  const warnings = qualityWarnings(c, lines);
  const timeline = [
    ...(audits.results||[]).map(x=>({type:'audit',at:x.created_at,title:actionLabel(x.action),detail:x.details||'',by:x.username||''})),
    ...(notices.results||[]).map(x=>({type:'notification',at:x.created_at,title:x.title,detail:x.message||'',by:''})),
    ...(messages.results||[]).map(x=>({type:'message',at:x.created_at,title:`ข้อความจาก ${x.sender_side}`,detail:x.message||'',by:x.sender_name||x.sender_username||''}))
  ].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,160);
  return json({ status:'success', data:{ case:c, age:withAge(c), warnings, evidence:evidence.results||[], evidenceEnabled:Boolean(env.EVIDENCE), timeline } });
}

async function reopenCase(request, env, user, id) {
  reviewer(user);
  const c = await getCase(env, user, id, true);
  if (!TERMINAL_STATUSES.has(String(c.status||'').toUpperCase())) return json({ status:'error', message:'Ticket นี้ยังไม่ได้ปิด จึงไม่ต้อง Reopen' }, 409);
  const b = await readJson(request);
  const reason = text(b.reason);
  if (!reason) return json({ status:'error', message:'กรุณาระบุเหตุผลที่ Reopen' }, 422);
  const t = now();
  await env.DB.prepare("UPDATE store_cases SET status='PENDING',closed_at='',assigned_to=?,version=version+1,updated_at=? WHERE id=?").bind(user.username,t,id).run();
  await notify(env,'STORE',c.store_code,id,`${c.case_no} ถูกเปิดใหม่`,reason,'warning');
  await audit(env,user.username,'REOPEN_STORE_TICKET',c.case_no,c.claim_no,'',c.transport_no,reason);
  return json({ status:'success', id, statusText:'PENDING', message:'เปิด Ticket กลับมาดำเนินการแล้ว' });
}

async function uploadEvidence(request, env, user, id) {
  if (!env.EVIDENCE) return json({ status:'error', message:'Evidence Storage (R2) ยังไม่ได้เชื่อมกับ Worker' }, 503);
  const c = await getCase(env, user, id, true);
  evidenceEditor(user, c);
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM store_case_evidence WHERE store_case_id=?').bind(id).first();
  if (Number(n?.n || 0) >= 5) return json({ status:'error', message:'Ticket หนึ่งแนบหลักฐานได้สูงสุด 5 รูป' }, 409);
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ status:'error', message:'ไม่พบไฟล์รูป' }, 422);
  const type = text(file.type).toLowerCase();
  if (!['image/jpeg','image/png','image/webp'].includes(type)) return json({ status:'error', message:'รองรับเฉพาะ JPG, PNG และ WebP' }, 415);
  if (Number(file.size || 0) > 1200000) return json({ status:'error', message:'รูปหลังบีบอัดต้องไม่เกิน 1.2 MB' }, 413);
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const key = `case/${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await env.EVIDENCE.put(key, await file.arrayBuffer(), { httpMetadata:{ contentType:type }, customMetadata:{ caseId:String(id), uploadedBy:user.username } });
  const t = now();
  const row = await env.DB.prepare(`INSERT INTO store_case_evidence(store_case_id,object_key,file_name,content_type,bytes,uploaded_by,uploaded_at)
    VALUES(?,?,?,?,?,?,?) RETURNING id`).bind(id,key,text(file.name)||`evidence.${ext}`,type,Number(file.size||0),user.username,t).first();
  await audit(env,user.username,'ADD_CASE_EVIDENCE',c.case_no,c.claim_no,'',c.transport_no,`evidence_id=${row?.id||''}; bytes=${file.size||0}`);
  return json({ status:'success', id:Number(row?.id||0), fileName:text(file.name), bytes:Number(file.size||0), uploadedAt:t }, 201);
}

async function getEvidence(env, user, evidenceId) {
  if (!env.EVIDENCE) return json({ status:'error', message:'Evidence Storage (R2) ยังไม่ได้เชื่อมกับ Worker' }, 503);
  const e = await env.DB.prepare(`SELECT e.*,c.store_code,c.case_no FROM store_case_evidence e JOIN store_cases c ON c.id=e.store_case_id WHERE e.id=?`).bind(evidenceId).first();
  if (!e) return json({ status:'error', message:'ไม่พบรูปหลักฐาน' }, 404);
  accessCase(user, e);
  const object = await env.EVIDENCE.get(e.object_key);
  if (!object) return json({ status:'error', message:'ไฟล์หลักฐานไม่อยู่ใน Storage' }, 404);
  const headers = new Headers();
  headers.set('content-type', e.content_type || 'application/octet-stream');
  headers.set('cache-control', 'private, max-age=300');
  headers.set('content-disposition', `inline; filename="${safeFileName(e.file_name)}"`);
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
}

async function deleteEvidence(env, user, evidenceId) {
  if (!env.EVIDENCE) return json({ status:'error', message:'Evidence Storage (R2) ยังไม่ได้เชื่อมกับ Worker' }, 503);
  const e = await env.DB.prepare(`SELECT e.*,c.store_code,c.case_no,c.claim_no,c.transport_no,c.status FROM store_case_evidence e JOIN store_cases c ON c.id=e.store_case_id WHERE e.id=?`).bind(evidenceId).first();
  if (!e) return json({ status:'error', message:'ไม่พบรูปหลักฐาน' }, 404);
  evidenceEditor(user, e);
  await env.EVIDENCE.delete(e.object_key);
  await env.DB.prepare('DELETE FROM store_case_evidence WHERE id=?').bind(evidenceId).run();
  await audit(env,user.username,'DELETE_CASE_EVIDENCE',e.case_no,e.claim_no,'',e.transport_no,`evidence_id=${evidenceId}`);
  return json({ status:'success', deleted:true });
}

async function auditList(env, user, url) {
  admin(user);
  const where = [], params = [];
  const q = text(url.searchParams.get('q'));
  if (q) { const like=`%${q}%`; where.push('(username LIKE ? OR action LIKE ? OR entity_key LIKE ? OR claim_no LIKE ? OR transport_no LIKE ? OR details LIKE ?)'); params.push(like,like,like,like,like,like); }
  const action = text(url.searchParams.get('action'));
  if (action) { where.push('action=?'); params.push(action); }
  const from = date(url.searchParams.get('from'));
  const to = date(url.searchParams.get('to'));
  if (from) { where.push('substr(created_at,1,10)>=?'); params.push(from); }
  if (to) { where.push('substr(created_at,1,10)<=?'); params.push(to); }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const r = await env.DB.prepare(`SELECT id,username,action,entity_type,entity_key,claim_no,reference_no,transport_no,details,created_at FROM audit_log ${sqlWhere} ORDER BY id DESC LIMIT 500`).bind(...params).all();
  return json({ status:'success', data:r.results||[] });
}

async function reportData(env, user, url) {
  const where = ['archived=0'], params = [];
  const from = date(url.searchParams.get('from'));
  const to = date(url.searchParams.get('to'));
  const status = text(url.searchParams.get('status'));
  const requestedStore = digits(url.searchParams.get('store'));
  const store = isStore(user) ? user.store_code : requestedStore;
  if (from) { where.push("COALESCE(NULLIF(claim_date,''),ship_date)>=?"); params.push(from); }
  if (to) { where.push("COALESCE(NULLIF(claim_date,''),ship_date)<=?"); params.push(to); }
  if (status) { where.push('update_status=?'); params.push(status); }
  if (store) { where.push('store_code=?'); params.push(store); }
  const r = await env.DB.prepare(`SELECT claim_no,reference_no,store_code,store_name,transport_no,received_date,claim_date,ship_date,claim_dc,
    article,barcode,description,delivery_qty,received_qty,claim_qty,sku_cost,amount_claim,claims_reason,update_status,who,cause_group,root_cause,check_result,remark_list,sc,complete_sc,remark,created_by,updated_by,updated_at
    FROM claims WHERE ${where.join(' AND ')} ORDER BY claim_date DESC,claim_no DESC,id LIMIT 10000`).bind(...params).all();
  const rows = r.results || [];
  return json({ status:'success', data:rows, summary:{ lines:rows.length, claims:new Set(rows.map(x=>x.claim_no).filter(Boolean)).size, amount:round(rows.reduce((s,x)=>s+Number(x.amount_claim||0),0)) } });
}

function qualityWarnings(c, items) {
  const out = [];
  if (c.received_date && c.claim_date && c.claim_date < c.received_date) out.push({ code:'DATE_ORDER', level:'error', message:'วันที่แจ้งเคลมอยู่ก่อนวันที่รับสินค้า' });
  if (!c.transport_no) out.push({ code:'TRANSPORT', level:'error', message:'ไม่มี Transport No.' });
  for (const [i,item] of items.entries()) {
    const line = Number(item.line_no || i + 1);
    const delivery = num(item.delivery_qty), received = num(item.received_qty), claim = num(item.claim_qty), cost = Number(item.sku_cost || 0);
    if (!Number(item.master_matched || 0)) out.push({ code:'MASTER', level:'warning', line, message:`รายการ ${line}: ไม่พบข้อมูล Master ที่ยืนยันแล้ว` });
    if (!(cost > 0)) out.push({ code:'PRICE', level:'warning', line, message:`รายการ ${line}: ไม่มีราคาจาก Master` });
    if (received !== null && delivery !== null && received > delivery) out.push({ code:'OVER_RECEIVE', level:'warning', line, message:`รายการ ${line}: Received Qty มากกว่า Delivery Qty` });
    if (claim !== null && received !== null && received >= 0 && claim > received) out.push({ code:'CLAIM_QTY', level:'warning', line, message:`รายการ ${line}: Claim Qty มากกว่า Received Qty` });
    if (!text(item.claims_reason)) out.push({ code:'REASON', level:'warning', line, message:`รายการ ${line}: ยังไม่ได้ระบุ Claims Reason` });
  }
  return out.slice(0,80);
}

async function getCase(env, user, id, noAccessCheck=false) {
  const c = await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();
  if (!c) throw pub(404,'ไม่พบ Ticket');
  if (!noAccessCheck) accessCase(user,c); else accessCase(user,c);
  return c;
}
function accessCase(user,c) {
  if (isStore(user) && String(c.store_code) !== String(user.store_code)) throw pub(403,'ไม่มีสิทธิ์ดู Ticket นี้');
  if (!isStore(user) && !['dc','trainer','admin'].includes(String(user.user_type||'dc')) && user.role !== 'admin') throw pub(403,'ไม่มีสิทธิ์ดูข้อมูล Store');
}
function evidenceEditor(user,c) {
  if (isStore(user)) {
    if (String(c.store_code) !== String(user.store_code)) throw pub(403,'ไม่มีสิทธิ์แก้ไขหลักฐานของสาขาอื่น');
    if (!['SUBMITTED','RETURNED_TO_STORE'].includes(String(c.status||'').toUpperCase())) throw pub(409,'Ticket อยู่ระหว่างตรวจหรือปิดแล้ว จึงแก้หลักฐานไม่ได้');
    return;
  }
  if (user.role === 'admin' || ['admin','dc'].includes(String(user.user_type||''))) return;
  throw pub(403,'บัญชีนี้ดูหลักฐานได้อย่างเดียว');
}
function reviewer(user) {
  if (user.role === 'admin' || ['admin','dc'].includes(String(user.user_type||''))) return;
  throw pub(403,'เฉพาะ DC หรือ Admin เท่านั้น');
}
function admin(user) { if (user.role !== 'admin' && user.user_type !== 'admin') throw pub(403,'Admin only'); }
function isStore(user) { return String(user.user_type||'') === 'store'; }
function scopedStore(user, requested) { return isStore(user) ? digits(user.store_code) : digits(requested); }

function withAge(row) {
  const created = parseTime(row.created_at || row.updated_at);
  const hours = created ? Math.max(0,(Date.now()-created.getTime())/3600000) : 0;
  const terminal = TERMINAL_STATUSES.has(String(row.status||'').toUpperCase());
  const slaState = terminal ? 'done' : hours >= SLA_HOURS ? 'overdue' : hours >= SLA_HOURS*0.75 ? 'warning' : 'ok';
  return { ...row, ageHours:Math.round(hours*10)/10, slaHours:SLA_HOURS, slaState };
}
function parseTime(v) {
  const s = text(v); if (!s) return null;
  const normalized = s.includes('T') ? s : s.replace(' ','T') + '+07:00';
  const d = new Date(normalized); return Number.isNaN(d.getTime()) ? null : d;
}
function normalizeAgg(x) { const out={}; for (const [k,v] of Object.entries(x||{})) out[k]=typeof v==='number'?v:Number(v||0); return out; }
function actionLabel(action) {
  const map={CREATE_STORE_TICKET_V8:'Store สร้าง Ticket',UPDATE_STORE_TICKET_V8:'Store/ผู้ดูแลแก้ไข Ticket',RETURN_TO_STORE_V8:'DC ส่งกลับ Store แก้ไข',REVIEW_STORE_TICKET_V8:'DC อัปเดตสถานะ',CREATE_CLAIM_V7:'สร้าง Claim',REOPEN_STORE_TICKET:'เปิด Ticket ใหม่',ADD_CASE_EVIDENCE:'เพิ่มรูปหลักฐาน',DELETE_CASE_EVIDENCE:'ลบรูปหลักฐาน'};
  return map[action] || action || 'Activity';
}
async function notify(env,type,key,caseId,title,message,level='info') {
  await env.DB.prepare('INSERT INTO notifications(recipient_type,recipient_key,store_case_id,title,message,level,is_read,created_at) VALUES(?,?,?,?,?,?,0,?)').bind(type,key||'',caseId||null,title,message,level,now()).run();
}
async function audit(env,username,action,key,claim='',reference='',transport='',details='') {
  await env.DB.prepare('INSERT INTO audit_log(username,action,entity_type,entity_key,claim_no,reference_no,transport_no,details,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(username,action,'OPS_PLUS',key,claim,reference,transport,details,now()).run();
}
async function readJson(req) { try { return await req.json(); } catch { return {}; } }
function pub(status,message) { const e=new Error(message); e.status=status; e.publicMessage=message; return e; }
function json(data,status=200) { return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}); }
function text(v){return String(v??'').trim();}
function digits(v){return text(v).replace(/[^0-9A-Za-z_-]/g,'');}
function date(v){const s=text(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());}
function now(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'medium'}).format(new Date());}
function num(v){if(v===null||v===undefined||text(v)==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function round(n){return Math.round((Number(n)||0)*100)/100;}
function safeFileName(v){return text(v).replace(/[\r\n"\\/]/g,'_').slice(0,120)||'evidence';}
