import { createHash, randomBytes, scryptSync } from 'node:crypto';
import legacy, { CLAIM_HEADERS } from './v5-entry.js';

const BUILD='2026-08-22-collaboration-v7';
const COOKIE='claim_session';
const TERMINAL=new Set(['ACCEPT','REJECT','CLOSED','PARTIAL']);
const STORE_STATUSES=new Set(['SUBMITTED','UNDER_REVIEW','PENDING','ACCEPT','REJECT','PARTIAL','DISPUTED','CLOSED']);
export { CLAIM_HEADERS };

export default {async fetch(request,env){
  const url=new URL(request.url);
  try{
    if(url.pathname==='/api/build')return json({status:'success',build:BUILD,contract:'A:AQ 43 columns',runtime:'worker/v7-entry.js',features:['per-item-decision','claim-reservation','reference-per-item','store-portal','chat','notifications','filtered-export']});
    if(url.pathname==='/api/health'){const x=await env.DB.prepare('SELECT 1 ok').first();return json({status:x?.ok===1?'success':'error',build:BUILD,time:now()});}
    if(url.pathname.startsWith('/api/v7/')||isIntercepted(url,request.method))return await v7Api(request,env,url);
    return await legacy.fetch(request,env);
  }catch(e){console.error(e);return json({status:'error',message:e?.publicMessage||e?.message||'Internal error'},e?.status||500);}
}};

function isIntercepted(url,method){
  const m=method.toUpperCase();
  return (url.pathname==='/api/auth/me'&&m==='GET')||
    (url.pathname==='/api/claims/prepare'&&m==='POST')||
    (url.pathname==='/api/claims/save'&&m==='POST')||
    (url.pathname==='/api/claims/export'&&m==='GET')||
    (url.pathname==='/api/users'&&['GET','POST'].includes(m));
}

async function v7Api(req,env,url){
  const m=req.method.toUpperCase();
  if(m==='OPTIONS')return new Response(null,{status:204});
  const user=await requireUser(req,env);
  if(!['GET','HEAD'].includes(m))checkOrigin(req,url);

  if(url.pathname==='/api/auth/me'&&m==='GET')return json({status:'success',user:publicUser(user)});
  if(url.pathname==='/api/v7/me'&&m==='GET')return json({status:'success',user:publicUser(user)});

  if(url.pathname==='/api/claims/prepare'&&m==='POST'){operations(user);return prepareV7(req,env,user,url);}
  if(url.pathname==='/api/v7/reference/reserve'&&m==='POST'){operations(user);return reserveReference(req,env,user);}
  if(url.pathname==='/api/claims/save'&&m==='POST'){operations(user);return saveV7(req,env,user);}
  if(url.pathname==='/api/claims/export'&&m==='GET')return exportData(env,url,user);
  if(url.pathname==='/api/v7/export-data'&&m==='GET')return exportData(env,url,user);

  if(url.pathname==='/api/users'&&m==='GET'){admin(user);return usersList(env);}
  if(url.pathname==='/api/users'&&m==='POST'){admin(user);return usersCreate(req,env,user);}

  if(url.pathname==='/api/v7/notifications'&&m==='GET')return notificationsList(env,user);
  if(url.pathname==='/api/v7/notifications/read'&&m==='POST')return notificationsRead(req,env,user);
  if(url.pathname==='/api/v7/dc/queue'&&m==='GET'){operations(user);return dcQueue(env,url);}

  if(url.pathname==='/api/v7/store/summary'&&m==='GET')return storeSummary(env,url,user);
  if(url.pathname==='/api/v7/store/cases'&&m==='GET')return storeCasesList(env,url,user);
  if(url.pathname==='/api/v7/store/cases'&&m==='POST')return storeCaseCreate(req,env,user);

  const caseMatch=url.pathname.match(/^\/api\/v7\/store\/cases\/(\d+)$/);
  if(caseMatch&&m==='GET')return storeCaseGet(env,Number(caseMatch[1]),user);
  const statusMatch=url.pathname.match(/^\/api\/v7\/store\/cases\/(\d+)\/status$/);
  if(statusMatch&&m==='POST'){operations(user);return storeCaseStatus(req,env,Number(statusMatch[1]),user);}
  const disputeMatch=url.pathname.match(/^\/api\/v7\/store\/cases\/(\d+)\/dispute$/);
  if(disputeMatch&&m==='POST')return storeCaseDispute(req,env,Number(disputeMatch[1]),user);
  const msgMatch=url.pathname.match(/^\/api\/v7\/store\/cases\/(\d+)\/messages$/);
  if(msgMatch&&m==='GET')return messagesList(env,Number(msgMatch[1]),user);
  if(msgMatch&&m==='POST')return messageCreate(req,env,Number(msgMatch[1]),user);

  return json({status:'error',message:'V7 API not found'},404);
}

async function prepareV7(req,env,user,url){
  const raw=await req.text();
  const clone=new Request(url.toString(),{method:'POST',headers:req.headers,body:raw});
  const response=await legacy.fetch(clone,env);
  const data=await response.json();
  if(!response.ok||data.status!=='success')return json(data,response.status);
  const input=safeJson(raw),first=data.rows?.[0]||{},ship=dateIso(input.shipDate)||today();
  await cleanupReservations(env);
  const claimNo=await nextUniqueClaim(env,ship.slice(0,7).replace('-',''));
  const draftToken=randomBytes(24).toString('base64url'),expires=Date.now()+12*3600*1000;
  await env.DB.prepare('INSERT INTO claim_drafts(draft_token,claim_no,transport_no,store_code,created_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(draftToken,claimNo,text(first.transportNo),text(first.storeCode),user.username,expires,now()).run();
  const rows=(data.rows||[]).map((r,i)=>({...r,itemKey:`${i+1}-${text(r.article)||text(r.barcode)||'ITEM'}-${crypto.randomUUID().slice(0,6)}`,decision:{status:'Pending',who:'DC',referenceNo:''}}));
  return json({...data,build:BUILD,draftToken,claimNo,rows});
}

async function reserveReference(req,env,user){
  const b=await body(req),token=text(b.draftToken),itemKey=text(b.itemKey),status=text(b.status),who=text(b.who).toUpperCase();
  const draft=await getDraft(env,token,user);
  if(!itemKey)return json({status:'error',message:'itemKey ห้ามว่าง'},422);
  const old=await env.DB.prepare('SELECT * FROM reference_reservations WHERE draft_token=? AND item_key=?').bind(token,itemKey).first();
  if(status!=='Accept'||!['DC','TP'].includes(who)){
    if(old&&!old.claimed)await env.DB.prepare('DELETE FROM reference_reservations WHERE id=?').bind(old.id).run();
    return json({status:'success',claimNo:draft.claim_no,referenceNo:''});
  }
  if(old&&old.ref_type===who)return json({status:'success',claimNo:draft.claim_no,referenceNo:old.ref_no});
  if(old&&!old.claimed)await env.DB.prepare('DELETE FROM reference_reservations WHERE id=?').bind(old.id).run();
  const refNo=await nextUniqueRef(env,who);
  await env.DB.prepare('INSERT INTO reference_reservations(draft_token,item_key,ref_type,ref_no,claimed,created_by,created_at) VALUES(?,?,?,?,0,?,?)').bind(token,itemKey,who,refNo,user.username,now()).run();
  return json({status:'success',claimNo:draft.claim_no,referenceNo:refNo});
}

async function saveV7(req,env,user){
  const b=await body(req,4*1024*1024),token=text(b.draftToken),rows=Array.isArray(b.rows)?b.rows:[],global=b.global||{},decisions=Array.isArray(b.decisions)?b.decisions:[];
  if(!rows.length)return json({status:'error',message:'ไม่พบรายการสินค้า'},422);
  if(rows.length>100)return json({status:'error',message:'บันทึกครั้งละไม่เกิน 100 รายการ'},413);
  const draft=await getDraft(env,token,user),claimNo=draft.claim_no,transport=text(rows[0]?.transportNo);
  if(transport){const dup=await env.DB.prepare('SELECT claim_no FROM claims WHERE archived=0 AND transport_no=? AND claim_no<>? LIMIT 1').bind(transport,claimNo).first();if(dup&&!b.confirmDuplicate)return json({status:'duplicate',message:`Transport ${transport} มี Claim ${dup.claim_no} อยู่แล้ว`,requiresConfirmation:true},409);}
  const ship=dateIso(global.shipDate)||today(),month=new Intl.DateTimeFormat('en',{month:'short',timeZone:'Asia/Bangkok'}).format(new Date(ship+'T00:00:00+07:00')),year=Number(ship.slice(0,4)),t=now();
  const refs=[],stmts=[],saved=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i]||{},d={...global,...(decisions[i]||{}),...(r.decision||{})};
    const status=normalizeStatus(d.status),who=text(d.who||'DC').toUpperCase();
    if(!status)return json({status:'error',message:`รายการ ${i+1}: Status ต้องเป็น Accept, Pending หรือ Reject`},422);
    if(!['DC','TP','QC'].includes(who))return json({status:'error',message:`รายการ ${i+1}: WHO ไม่ถูกต้อง`},422);
    if(!text(r.storeCode)||!text(r.transportNo)||!text(r.article))return json({status:'error',message:`รายการ ${i+1}: Store / Transport / Article ห้ามว่าง`},422);
    let refNo='';
    if(status==='Accept'&&['DC','TP'].includes(who)){
      const key=text(r.itemKey)||String(i+1);let rr=await env.DB.prepare('SELECT * FROM reference_reservations WHERE draft_token=? AND item_key=?').bind(token,key).first();
      if(!rr||rr.ref_type!==who){if(rr&&!rr.claimed)await env.DB.prepare('DELETE FROM reference_reservations WHERE id=?').bind(rr.id).run();refNo=await nextUniqueRef(env,who);await env.DB.prepare('INSERT INTO reference_reservations(draft_token,item_key,ref_type,ref_no,claimed,created_by,created_at) VALUES(?,?,?,?,0,?,?)').bind(token,key,who,refNo,user.username,t).run();}
      else refNo=rr.ref_no;
      refs.push({type:who,refNo,row:i});
    }
    const reason=text(d.reason||d.claimsReason),cause=text(d.causeGroup),root=text(d.rootCause),check=text(d.checkResult||d.check),remarkList=text(d.remarkList),sc=text(d.sc),completeSc=text(d.completeSc),remark=text(d.remark);
    const amount=roundMoney(r.amount),sku=roundMoney(r.skuCost),unique=`${Date.now()}_${String(i+1).padStart(3,'0')}_${crypto.randomUUID().slice(0,8)}`,source=text(b.storeCaseId)?'STORE':'DC',caseState=status==='Pending'?'OPEN':'CLOSED',closed=status==='Pending'?'':t;
    const v=[digits(r.storeCode),text(r.storeName),text(r.claimDc),dateIso(r.receivedDate),dateIso(r.claimDate),text(r.transportNo),text(r.vehicleNo),text(r.driver),text(r.dnNo),text(r.route),text(r.palletNo).replace(/^'/,''),text(r.basketNo),text(r.article).replaceAll("'",''),text(r.barcode).replaceAll("'",''),text(r.description),numericText(r.deliveryQty),numericText(r.receivedQty),numericText(r.claimQty),reason,amount,ship,status,who,text(r.formatType),claimNo,refNo,cause,root,check,remarkList,text(r.eggs),text(r.storeFormat),text(r.manageWeight),sc,completeSc,remark,text(r.storeCheck100),sku,text(r.segDescription),user.username,unique,month,year,0,t,t,user.username,source,text(b.storeCaseId||''),caseState,'',closed];
    stmts.push(env.DB.prepare(`INSERT INTO claims(store_code,store_name,claim_dc,received_date,claim_date,transport_no,vehicle_no,driver,dn_no,route,pallet_no,basket_no,article,barcode,description,delivery_qty,received_qty,claim_qty,claims_reason,amount_claim,ship_date,update_status,who,format_type,claim_no,reference_no,cause_group,root_cause,check_result,remark_list,eggs,store_format,manage_weight,sc,complete_sc,remark,store_check_100,sku_cost,seg_description,created_by,unique_key,data_month,data_year,archived,created_at,updated_at,updated_by,source_channel,store_case_id,case_state,dispute_status,closed_at) VALUES(${marks(v.length)})`).bind(...v));
    saved.push({itemKey:text(r.itemKey),article:text(r.article),status,who,referenceNo:refNo,amount});
  }
  for(let i=0;i<stmts.length;i+=20)await env.DB.batch(stmts.slice(i,i+20));
  for(const x of refs){const row=saved[x.row],source=rows[x.row];await env.DB.prepare('INSERT OR IGNORE INTO references_ledger(ref_type,ref_no,claim_no,transport_no,store_code,ship_date,remark,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(x.type,x.refNo,claimNo,text(source.transportNo),digits(source.storeCode),ship,text(row.status),user.username,t).run();await env.DB.prepare('UPDATE reference_reservations SET claimed=1 WHERE draft_token=? AND ref_no=?').bind(token,x.refNo).run();}
  await env.DB.prepare('DELETE FROM reference_reservations WHERE draft_token=? AND claimed=0').bind(token).run();
  await env.DB.prepare('DELETE FROM claim_drafts WHERE draft_token=?').bind(token).run();
  const overall=overallStatus(saved.map(x=>x.status));
  if(b.storeCaseId){const id=Number(b.storeCaseId),closed=overall==='PENDING'?'':t;await env.DB.prepare('UPDATE store_cases SET status=?,claim_no=?,assigned_to=?,closed_at=?,version=version+1,updated_at=? WHERE id=?').bind(overall,claimNo,user.username,closed,t,id).run();const c=await env.DB.prepare('SELECT store_code FROM store_cases WHERE id=?').bind(id).first();if(c)await notify(env,'STORE',c.store_code,id,`เคส ${claimNo} อัปเดตแล้ว`,`สถานะล่าสุด ${overall}`,'status');}
  await audit(env,user.username,'CREATE_CLAIM_V7',claimNo,claimNo,'',transport,`${saved.length} items · ${overall} · refs=${refs.length}`);
  return json({status:'success',claimNo,overallStatus:overall,count:saved.length,references:refs.map(x=>x.refNo),items:saved,totalAmount:roundMoney(saved.reduce((s,x)=>s+x.amount,0))});
}

async function exportData(env,url,user){
  const q=['archived=0'],p=[];const add=(name,col)=>{const v=text(url.searchParams.get(name));if(v){q.push(`${col}=?`);p.push(v);}};
  add('status','update_status');add('causeGroup','cause_group');add('rootCause','root_cause');add('store','store_code');add('year','data_year');add('month','data_month');
  const from=dateIso(url.searchParams.get('from')),to=dateIso(url.searchParams.get('to'));if(from){q.push('ship_date>=?');p.push(from);}if(to){q.push('ship_date<=?');p.push(to);}if(isStore(user)){q.push('store_code=?');p.push(user.store_code);}
  const r=await env.DB.prepare(`SELECT * FROM claims WHERE ${q.join(' AND ')} ORDER BY ship_date DESC,id DESC LIMIT 10000`).bind(...p).all(),rows=(r.results||[]).map(toContractRow);
  return json({status:'success',headers:CLAIM_HEADERS,rows,count:rows.length,filters:Object.fromEntries(url.searchParams)});
}

async function usersList(env){const r=await env.DB.prepare('SELECT id,username,display_name,first_name,nickname,user_type,store_code,role,active,last_login_at,created_at FROM users ORDER BY active DESC,user_type,username').all();return json({status:'success',data:r.results||[]});}
async function usersCreate(req,env,actor){const b=await body(req),username=text(b.username),password=String(b.password||''),userType=['admin','dc','trainer','store'].includes(text(b.userType))?text(b.userType):'dc',storeCode=digits(b.storeCode),first=text(b.firstName),nick=text(b.nickname),display=text(b.displayName)||nick||first||username;let role=userType==='admin'?'admin':(text(b.role)==='supervisor'?'supervisor':'user');if(userType==='store'&&!storeCode)return json({status:'error',message:'Store user ต้องระบุ Store Code'},422);if(!username)return json({status:'error',message:'กรุณาระบุ Username'},422);if(!strong(password))return json({status:'error',message:'รหัสผ่านอย่างน้อย 10 ตัว มีตัวอักษรและตัวเลข'},422);try{await env.DB.prepare('INSERT INTO users(username,password_hash,display_name,role,active,last_login_at,created_at,updated_at,first_name,nickname,user_type,store_code) VALUES(?,?,?,?,1,?,?,?,?,?,?,?)').bind(username,hashPassword(password),display,role,'',now(),now(),first,nick,userType,storeCode).run();}catch(e){if(String(e.message).includes('UNIQUE'))return json({status:'error',message:'Username นี้มีอยู่แล้ว'},409);throw e;}await audit(env,actor.username,'CREATE_USER_V7',username,'','','',`${userType}/${storeCode}`);return usersList(env);}

async function dcQueue(env,url){const status=text(url.searchParams.get('status')),q=status?'WHERE status=?':'',p=status?[status]:[];const r=await env.DB.prepare(`SELECT * FROM store_cases ${q} ORDER BY CASE status WHEN 'SUBMITTED' THEN 0 WHEN 'DISPUTED' THEN 1 WHEN 'UNDER_REVIEW' THEN 2 WHEN 'PENDING' THEN 3 ELSE 4 END,updated_at DESC LIMIT 500`).bind(...p).all();const c=await env.DB.prepare("SELECT SUM(CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END) submitted,SUM(CASE WHEN status='DISPUTED' THEN 1 ELSE 0 END) disputed,SUM(CASE WHEN status IN ('UNDER_REVIEW','PENDING') THEN 1 ELSE 0 END) working FROM store_cases").first();return json({status:'success',data:r.results||[],summary:{submitted:Number(c?.submitted||0),disputed:Number(c?.disputed||0),working:Number(c?.working||0)}});}

async function storeCaseCreate(req,env,user){const b=await body(req,2*1024*1024),storeCode=isStore(user)?user.store_code:digits(b.storeCode);if(!storeCode)return json({status:'error',message:'ไม่พบ Store Code ของผู้ใช้งาน'},422);const transport=text(b.transportNo),items=(Array.isArray(b.items)?b.items:[]).slice(0,100).map(x=>({article:text(x.article).replaceAll("'",''),qty:num(x.qty),description:text(x.description),remark:text(x.remark)})).filter(x=>x.article);if(!transport)return json({status:'error',message:'Transport No. ห้ามว่าง'},422);if(!items.length)return json({status:'error',message:'กรุณาระบุสินค้าอย่างน้อย 1 รายการ'},422);const prices=await priceItems(env,items),amount=roundMoney(prices.reduce((s,x)=>s+x.amount,0)),store=await env.DB.prepare('SELECT store_name FROM master_stores WHERE store_code=?').bind(storeCode).first(),caseNo=await nextStoreCaseNo(env),t=now();const r=await env.DB.prepare('INSERT INTO store_cases(case_no,store_code,store_name,transport_no,ship_date,subject,reason,details,items_json,amount,status,claim_no,created_by,assigned_to,version,dispute_status,closed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,? ,\'SUBMITTED\',\'\',\?,\'\',1,\'\',\'\',?,?) RETURNING id').bind(caseNo,storeCode,text(store?.store_name),transport,dateIso(b.shipDate)||today(),text(b.subject)||`Claim ${transport}`,text(b.reason),text(b.details),JSON.stringify(prices),amount,user.username,t,t).first();await notify(env,'DC','',Number(r.id),`Store ${storeCode} แจ้งเคสใหม่`,`กรุณาตรวจสอบ ${caseNo} · Transport ${transport}`,'new');return json({status:'success',id:Number(r.id),caseNo,amount,statusText:'SUBMITTED'},201);}

async function storeCasesList(env,url,user){const q=[],p=[];if(isStore(user)){q.push('store_code=?');p.push(user.store_code);}else{const s=digits(url.searchParams.get('store'));if(s){q.push('store_code=?');p.push(s);}}const st=text(url.searchParams.get('status'));if(st){q.push('status=?');p.push(st);}const r=await env.DB.prepare(`SELECT id,case_no,store_code,store_name,transport_no,ship_date,subject,reason,amount,status,claim_no,created_by,assigned_to,version,dispute_status,closed_at,created_at,updated_at FROM store_cases ${q.length?'WHERE '+q.join(' AND '):''} ORDER BY updated_at DESC LIMIT 500`).bind(...p).all();return json({status:'success',data:r.results||[]});}
async function storeCaseGet(env,id,user){const c=await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();accessCase(user,c);if(!c)return json({status:'error',message:'ไม่พบเคส'},404);return json({status:'success',data:{...c,items:safeJson(c.items_json)||[]}});}
async function storeCaseStatus(req,env,id,user){const b=await body(req),status=text(b.status).toUpperCase();if(!STORE_STATUSES.has(status))return json({status:'error',message:'Status ไม่ถูกต้อง'},422);const c=await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();if(!c)return json({status:'error',message:'ไม่พบเคส'},404);if(b.version&&Number(b.version)!==Number(c.version))return json({status:'conflict',message:'เคสนี้มีการอัปเดตจากผู้ใช้งานคนอื่น กรุณาโหลดข้อมูลล่าสุด'},409);const closed=TERMINAL.has(status)?now():'',t=now();await env.DB.prepare('UPDATE store_cases SET status=?,assigned_to=?,closed_at=?,version=version+1,updated_at=? WHERE id=?').bind(status,user.username,closed,t,id).run();await notify(env,'STORE',c.store_code,id,`${c.case_no} · ${status}`,text(b.message)||`DC อัปเดตสถานะเป็น ${status}`,'status');return storeCaseGet(env,id,user);}
async function storeCaseDispute(req,env,id,user){const b=await body(req),c=await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();accessCase(user,c,true);if(!c)return json({status:'error',message:'ไม่พบเคส'},404);if(!['REJECT','CLOSED'].includes(c.status))return json({status:'error',message:'โต้แย้งได้เฉพาะเคส Reject/Closed'},422);await env.DB.prepare("UPDATE store_cases SET status='DISPUTED',dispute_status='OPEN',closed_at='',version=version+1,updated_at=? WHERE id=?").bind(now(),id).run();await messageInsert(env,id,user,text(b.message)||'ขอโต้แย้งผลการพิจารณา');await notify(env,'DC','',id,`${c.case_no} มีการโต้แย้ง`,`Store ${c.store_code} เปิดข้อโต้แย้ง`,'warning');return json({status:'success'});}

async function messagesList(env,id,user){const c=await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();accessCase(user,c);const r=await env.DB.prepare('SELECT * FROM case_messages WHERE store_case_id=? ORDER BY id').bind(id).all();return json({status:'success',data:r.results||[]});}
async function messageCreate(req,env,id,user){const b=await body(req),msg=text(b.message);if(!msg)return json({status:'error',message:'ข้อความห้ามว่าง'},422);const c=await env.DB.prepare('SELECT * FROM store_cases WHERE id=?').bind(id).first();accessCase(user,c);await messageInsert(env,id,user,msg);if(isStore(user))await notify(env,'DC','',id,`${c.case_no} · ข้อความจาก Store`,msg.slice(0,120),'chat');else await notify(env,'STORE',c.store_code,id,`${c.case_no} · ข้อความจาก DC`,msg.slice(0,120),'chat');return messagesList(env,id,user);}
async function messageInsert(env,id,user,msg){await env.DB.prepare('INSERT INTO case_messages(store_case_id,sender_user_id,sender_username,sender_name,sender_side,message,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,user.id,user.username,userLabel(user),isStore(user)?'STORE':'DC',msg,now()).run();}

async function storeSummary(env,url,user){const store=isStore(user)?user.store_code:digits(url.searchParams.get('store')),ym=text(url.searchParams.get('month'))||today().slice(0,7);if(!store&&!isOperations(user))return json({status:'error',message:'Store Code required'},422);const q=store?'store_code=? AND ':'';const p=store?[store,ym+'%']:[ym+'%'];const r=await env.DB.prepare(`SELECT COUNT(*) cases,COALESCE(SUM(amount),0) amount,SUM(CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END) submitted,SUM(CASE WHEN status IN ('UNDER_REVIEW','PENDING','DISPUTED') THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status IN ('ACCEPT','PARTIAL','CLOSED') THEN 1 ELSE 0 END) accepted,SUM(CASE WHEN status='REJECT' THEN 1 ELSE 0 END) rejected FROM store_cases WHERE ${q}ship_date LIKE ?`).bind(...p).first();return json({status:'success',month:ym,storeCode:store,data:{cases:Number(r?.cases||0),amount:roundMoney(r?.amount),submitted:Number(r?.submitted||0),pending:Number(r?.pending||0),accepted:Number(r?.accepted||0),rejected:Number(r?.rejected||0)}});}

async function notificationsList(env,user){let where,params;if(isStore(user)){where="recipient_type='STORE' AND recipient_key=?";params=[user.store_code];}else{where="recipient_type='DC'";params=[];}const r=await env.DB.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY id DESC LIMIT 100`).bind(...params).all();return json({status:'success',data:r.results||[],unread:(r.results||[]).filter(x=>!x.is_read).length});}
async function notificationsRead(req,env,user){const b=await body(req),id=Number(b.id||0);if(id)await env.DB.prepare('UPDATE notifications SET is_read=1 WHERE id=?').bind(id).run();else if(isStore(user))await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE recipient_type='STORE' AND recipient_key=?").bind(user.store_code).run();else await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE recipient_type='DC'").run();return notificationsList(env,user);}
async function notify(env,type,key,caseId,title,message,level='info'){await env.DB.prepare('INSERT INTO notifications(recipient_type,recipient_key,store_case_id,title,message,level,is_read,created_at) VALUES(?,?,?,?,?,?,0,?)').bind(type,key||'',caseId||null,title,message,level,now()).run();}

async function priceItems(env,items){const active=await env.DB.prepare('SELECT active_batch_id FROM master_article_state WHERE id=1').first(),out=[];for(const item of items){let p=null;if(active?.active_batch_id)p=await env.DB.prepare('SELECT article,description,item_value FROM master_articles WHERE batch_id=? AND article=?').bind(active.active_batch_id,item.article).first();const price=roundMoney(p?.item_value||0),qty=num(item.qty);out.push({...item,description:item.description||text(p?.description),skuCost:price,amount:roundMoney(price*qty)});}return out;}

async function getDraft(env,token,user){if(!token)throw pub(422,'ไม่พบ Draft Token');const d=await env.DB.prepare('SELECT * FROM claim_drafts WHERE draft_token=? AND expires_at>?').bind(token,Date.now()).first();if(!d)throw pub(410,'Draft หมดอายุ กรุณาตรวจข้อมูลใหม่');if(d.created_by!==user.username&&!isOperations(user))throw pub(403,'Draft นี้เป็นของผู้ใช้งานอื่น');return d;}
async function cleanupReservations(env){const expired=await env.DB.prepare('SELECT draft_token FROM claim_drafts WHERE expires_at<=? LIMIT 100').bind(Date.now()).all();for(const x of expired.results||[]){await env.DB.prepare('DELETE FROM reference_reservations WHERE draft_token=? AND claimed=0').bind(x.draft_token).run();await env.DB.prepare('DELETE FROM claim_drafts WHERE draft_token=?').bind(x.draft_token).run();}}
async function reserve(env,key){const r=await env.DB.prepare('INSERT INTO sequences(sequence_key,current_value) VALUES(?,1) ON CONFLICT(sequence_key) DO UPDATE SET current_value=current_value+1 RETURNING current_value').bind(key).first();return Number(r?.current_value||1);}
async function nextUniqueClaim(env,ym){for(let i=0;i<20;i++){const n=await reserve(env,`CLAIM:${ym}`),v=`CM-${ym}${String(n).padStart(6,'0')}`;const x=await env.DB.prepare('SELECT 1 ok FROM claims WHERE claim_no=? UNION ALL SELECT 1 ok FROM claim_drafts WHERE claim_no=? LIMIT 1').bind(v,v).first();if(!x)return v;}throw pub(503,'ไม่สามารถจอง Claim No. ได้');}
async function nextUniqueRef(env,type){const prefix=type==='DC'?'CCD':'TF';for(let i=0;i<20;i++){const n=await reserve(env,`REF:${type}`),v=`${prefix}${String(n).padStart(7,'0')}`;const x=await env.DB.prepare('SELECT 1 ok FROM references_ledger WHERE ref_no=? UNION ALL SELECT 1 ok FROM reference_reservations WHERE ref_no=? LIMIT 1').bind(v,v).first();if(!x)return v;}throw pub(503,'ไม่สามารถจอง Reference No. ได้');}
async function nextStoreCaseNo(env){const ym=today().slice(0,7).replace('-',''),n=await reserve(env,`STORECASE:${ym}`);return`SC-${ym}-${String(n).padStart(6,'0')}`;}

async function requireUser(req,env){const token=getCookie(req);if(!token)throw pub(401,'กรุณาเข้าสู่ระบบ');const r=await env.DB.prepare('SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(sha(token),Date.now()).first();if(!r)throw pub(401,'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');return r;}
function publicUser(u){return{id:u.id,username:u.username,displayName:u.display_name||u.nickname||u.first_name||u.username,firstName:u.first_name||'',nickname:u.nickname||'',userType:u.user_type||'dc',storeCode:u.store_code||'',role:u.role,active:Boolean(u.active),lastLoginAt:u.last_login_at||''};}
function isStore(u){return (u.user_type||'dc')==='store';}
function isOperations(u){return u.role==='admin'||u.role==='supervisor'||['admin','dc','trainer'].includes(u.user_type||'dc');}
function operations(u){if(!isOperations(u))throw pub(403,'บัญชี Store เข้าใช้เฉพาะ Store Portal');}
function admin(u){if(u.role!=='admin')throw pub(403,'Administrator only');}
function accessCase(user,c,storeOnly=false){if(!c)throw pub(404,'ไม่พบเคส');if(isStore(user)&&c.store_code!==user.store_code)throw pub(403,'ไม่มีสิทธิ์ดูเคสของ Store อื่น');if(storeOnly&&!isStore(user))throw pub(403,'สิทธิ์นี้สำหรับ Store เท่านั้น');}
function userLabel(u){return u.nickname||u.first_name||u.display_name||u.username;}

function toContractRow(r){return [r.store_code,r.store_name,r.claim_dc,r.received_date,r.claim_date,r.transport_no,r.vehicle_no,r.driver,r.dn_no,r.route,r.pallet_no,r.basket_no,r.article,r.barcode,r.description,r.delivery_qty,r.received_qty,r.claim_qty,r.claims_reason,roundMoney(r.amount_claim),r.ship_date,r.update_status,r.who,r.format_type,r.claim_no,r.reference_no,r.cause_group,r.root_cause,r.check_result,r.remark_list,r.eggs,r.store_format,r.manage_weight,r.sc,r.complete_sc,r.remark,r.store_check_100,roundMoney(r.sku_cost),r.seg_description,r.created_by,r.unique_key,r.data_month,r.data_year];}
function overallStatus(statuses){if(statuses.some(x=>x==='Pending'))return'PENDING';if(statuses.every(x=>x==='Accept'))return'ACCEPT';if(statuses.every(x=>x==='Reject'))return'REJECT';return'PARTIAL';}
function normalizeStatus(v){const s=text(v).toLowerCase();return s==='accept'?'Accept':s==='pending'?'Pending':s==='reject'?'Reject':'';}
function hashPassword(v){const salt=randomBytes(16),h=scryptSync(String(v),salt,64);return`scrypt$${salt.toString('hex')}$${h.toString('hex')}`;}
function strong(v){const s=String(v||'');return s.length>=10&&/[A-Za-z]/.test(s)&&/\d/.test(s);}
function sha(v){return createHash('sha256').update(String(v)).digest('hex');}
function getCookie(req){for(const x of (req.headers.get('cookie')||'').split(';')){const[k,...v]=x.trim().split('=');if(k===COOKIE)return decodeURIComponent(v.join('='));}return'';}
function checkOrigin(req,url){const o=req.headers.get('origin');if(o&&o!==url.origin)throw pub(403,'Origin not allowed');}
async function body(req,max=1024*1024){const len=Number(req.headers.get('content-length')||0);if(len>max)throw pub(413,'Payload too large');try{return await req.json();}catch{throw pub(400,'JSON ไม่ถูกต้อง');}}
function pub(status,msg){const e=new Error(msg);e.status=status;e.publicMessage=msg;return e;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function text(v){return String(v??'').trim();}
function digits(v){const s=text(v).replaceAll(',','');return /^[+-]?\d+\.0+$/.test(s)?s.replace(/\.0+$/,''):s;}
function num(v){const n=Number(String(v??0).replaceAll(',',''));return Number.isFinite(n)?n:0;}
function numericText(v){const s=text(v).replaceAll(',','');return s===''?'':String(Number(s)||0);}
function roundMoney(v){return Math.round((num(v)+Number.EPSILON)*100)/100;}
function marks(n){return Array(n).fill('?').join(',');}
function safeJson(v){try{return JSON.parse(String(v||'{}'));}catch{return{};}}
function dateIso(v){const s=text(v);if(!s)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;const n=Number(s);if(Number.isFinite(n)&&n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toISOString().slice(0,10);}return'';}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());}
function now(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'medium'}).format(new Date());}
async function audit(env,username,action,key,claim='',reference='',transport='',details=''){await env.DB.prepare('INSERT INTO audit_log(username,action,entity_type,entity_key,claim_no,reference_no,transport_no,details,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(username,action,'V7',key,claim,reference,transport,details,now()).run();}
