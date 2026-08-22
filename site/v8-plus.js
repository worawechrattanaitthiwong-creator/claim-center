const Plus = {
  user:null,
  activeCaseId:0,
  storeSubmitBypass:false,
  claimSaveBypass:false,
  pendingEvidence:null,
  queueInstalled:false,
  auditInstalled:false,
  reportInstalled:false,
  dashboardInstalled:false,
  searchTimer:null
};

const q = (s,r=document) => r.querySelector(s);
const qa = (s,r=document) => [...r.querySelectorAll(s)];
const plusFetch = window.fetch.bind(window);
const moneyPlus = new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const escPlus = v => String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const todayPlus = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());

async function apiPlus(path,opt={}) {
  const init={method:opt.method||'GET',headers:{...(opt.headers||{})}};
  if(opt.body!==undefined){init.headers['content-type']='application/json';init.body=JSON.stringify(opt.body);}
  const r=await plusFetch(path,init);let d={};try{d=await r.json();}catch{}
  if(!r.ok){const e=new Error(d.message||`HTTP ${r.status}`);e.status=r.status;e.data=d;throw e;}return d;
}
async function formPlus(path,form,method='POST') {
  const r=await plusFetch(path,{method,body:form});let d={};try{d=await r.json();}catch{}
  if(!r.ok){const e=new Error(d.message||`HTTP ${r.status}`);e.status=r.status;e.data=d;throw e;}return d;
}
function plusToast(title,msg='',kind='') {
  const host=q('#toastHost');if(!host)return;
  const n=document.createElement('div');n.className=`toast ${kind}`;n.innerHTML=`<b>${escPlus(title)}</b>${msg?`<div>${escPlus(msg)}</div>`:''}`;host.append(n);setTimeout(()=>n.remove(),4500);
}
function isAdminPlus(){return Plus.user?.role==='admin'||Plus.user?.userType==='admin';}
function isDcPlus(){return Plus.user?.userType==='dc';}
function isStorePlus(){return Plus.user?.userType==='store';}
function canReviewPlus(){return isAdminPlus()||isDcPlus();}

function startPlus(){
  installDialogs();
  installGlobalSearch();
  installDashboardEnhancement();
  installQueueTools();
  installReports();
  installStoreEvidenceCompose();
  installAuditWhenReady();
  watchLoginState();
  watchPages();
  document.addEventListener('click',captureClicks,true);
  document.addEventListener('submit',captureSubmits,true);
  setTimeout(loadMePlus,120);
}

async function loadMePlus(){
  try{const m=await apiPlus('/api/v8/me');Plus.user=m.user;applyPlusRole();refreshActivePlus();}
  catch{}
}

function watchLoginState(){
  const app=q('#app');if(!app)return;
  new MutationObserver(()=>{if(!app.hidden)setTimeout(loadMePlus,80);}).observe(app,{attributes:true,attributeFilter:['hidden']});
}
function watchPages(){
  const dash=q('#page-dashboard'),queue=q('#page-queue'),audit=q('#page-plus-audit');
  if(dash)new MutationObserver(()=>{if(dash.classList.contains('active'))setTimeout(loadDashboardPlus,120);}).observe(dash,{attributes:true,attributeFilter:['class']});
  if(queue)new MutationObserver(()=>{if(queue.classList.contains('active'))setTimeout(loadQueuePlus,140);}).observe(queue,{attributes:true,attributeFilter:['class']});
  if(audit)new MutationObserver(()=>{if(audit.classList.contains('active'))setTimeout(loadAuditPlus,80);}).observe(audit,{attributes:true,attributeFilter:['class']});
}
function refreshActivePlus(){
  const active=q('.page.active');
  if(active?.id==='page-dashboard')loadDashboardPlus();
  if(active?.id==='page-queue')loadQueuePlus();
  if(active?.id==='page-plus-audit')loadAuditPlus();
}

function installGlobalSearch(){
  const actions=q('.top-actions');if(!actions||q('#plusGlobalSearch'))return;
  actions.insertAdjacentHTML('afterbegin',`<div id="plusGlobalSearch" class="plus-global-search"><input id="plusGlobalInput" autocomplete="off" placeholder="ค้นหา Transport / Claim / Store / Article"><div id="plusGlobalResults" class="plus-search-results" hidden></div></div>`);
  const input=q('#plusGlobalInput');
  input.addEventListener('input',()=>{clearTimeout(Plus.searchTimer);Plus.searchTimer=setTimeout(runGlobalSearch,220);});
  input.addEventListener('keydown',e=>{if(e.key==='Escape')q('#plusGlobalResults').hidden=true;});
  document.addEventListener('click',e=>{if(!e.target.closest('#plusGlobalSearch')){const r=q('#plusGlobalResults');if(r)r.hidden=true;}});
}
async function runGlobalSearch(){
  const input=q('#plusGlobalInput'),host=q('#plusGlobalResults');if(!input||!host)return;
  const term=input.value.trim();if(term.length<2){host.hidden=true;host.innerHTML='';return;}
  try{
    const r=await apiPlus(`/api/v8/plus/search?q=${encodeURIComponent(term)}`),d=r.data||{};
    const sections=[];
    if((d.cases||[]).length)sections.push(`<div class="plus-search-group"><b>Tickets</b>${d.cases.map(x=>`<button type="button" data-plus-case="${x.id}"><strong>${escPlus(x.transport_no||x.case_no)}</strong><span>${escPlus(x.case_no)} · Store ${escPlus(x.store_code)} · ${escPlus(x.status)}</span></button>`).join('')}</div>`);
    if((d.claims||[]).length)sections.push(`<div class="plus-search-group"><b>Claims</b>${d.claims.map(x=>`<button type="button" data-plus-claim="${escPlus(x.claim_no)}"><strong>${escPlus(x.claim_no)}</strong><span>${escPlus(x.transport_no)} · Store ${escPlus(x.store_code)} · ฿${moneyPlus.format(x.amount||0)}</span></button>`).join('')}</div>`);
    if((d.articles||[]).length)sections.push(`<div class="plus-search-group"><b>Master Article</b>${d.articles.map(x=>`<button type="button" data-plus-article="${escPlus(x.article)}"><strong>${escPlus(x.article)} · ${escPlus(x.description)}</strong><span>${escPlus(x.barcode)} · ฿${moneyPlus.format(x.sku_cost||0)}</span></button>`).join('')}</div>`);
    host.innerHTML=sections.join('')||'<div class="plus-search-empty">ไม่พบข้อมูลที่ตรงกัน</div>';host.hidden=false;
  }catch(e){host.innerHTML=`<div class="plus-search-empty">${escPlus(e.message)}</div>`;host.hidden=false;}
}

function installDashboardEnhancement(){
  const page=q('#page-dashboard');if(!page||q('#plusDashboardOps'))return;
  const anchor=q('.kpis',page);
  const html=`<section id="plusDashboardOps" class="plus-dashboard-ops">
    <div class="plus-section-head"><div><span class="eyebrow">CLAIM OPERATIONS PULSE</span><h3>งานวันนี้ · SLA · จุดที่ต้องติดตาม</h3></div><button id="plusRefreshDashboard" class="btn ghost small">↻ Refresh</button></div>
    <div id="plusOpsKpis" class="plus-kpis"></div>
    <div class="grid two plus-dashboard-grid"><article class="card"><div class="card-head"><div><span class="eyebrow">AGING / SLA</span><h3>Ticket ที่เสี่ยงค้าง</h3></div></div><div id="plusAgingList" class="plus-aging-list"></div></article>
    <article class="card"><div class="card-head"><div><span class="eyebrow">TOP CAUSES</span><h3>สาเหตุที่เกิดบ่อย</h3></div></div><div id="plusCauseList" class="plus-ranking"></div></article></div>
    <div class="grid two plus-dashboard-grid"><article class="card"><div class="card-head"><div><span class="eyebrow">TOP STORES</span><h3>Store ที่มี Ticket สูง</h3></div></div><div id="plusStoreList" class="plus-ranking"></div></article>
    <article class="card"><div class="card-head"><div><span class="eyebrow">HIGH VALUE TRANSPORT</span><h3>Transport มูลค่าสูง</h3></div></div><div id="plusTransportList" class="plus-ranking"></div></article></div>
  </section>`;
  if(anchor)anchor.insertAdjacentHTML('afterend',html);else page.insertAdjacentHTML('afterbegin',html);
  q('#plusRefreshDashboard').onclick=loadDashboardPlus;Plus.dashboardInstalled=true;
}
async function loadDashboardPlus(){
  if(!Plus.user||!q('#plusDashboardOps'))return;
  try{
    const r=await apiPlus('/api/v8/plus/dashboard'),d=r.data||{},t=d.today||{},m=d.monthClaims||{},a=d.aging||{};
    q('#plusOpsKpis').innerHTML=[
      ['Transport วันนี้',t.transports||0,'1 Transport = 1 Ticket',''],
      ['รอ/กำลังดำเนินการ',t.open_cases||0,'งานที่ยังไม่จบ','attention'],
      ['เกิน SLA',a.overdue||0,`เกิน ${d.slaHours||24} ชั่วโมง`,'danger'],
      ['งานของฉัน',d.myWork||0,'Assigned / Store ของฉัน',''],
      ['Claim เดือนนี้',m.claims||0,`${m.lines||0} รายการ`,''],
      ['มูลค่าเดือนนี้','฿'+moneyPlus.format(m.amount||0),'Claim Amount','']
    ].map(x=>`<article class="${x[3]}"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join('');
    q('#plusAgingList').innerHTML=(a.oldest||[]).map(x=>`<button type="button" class="plus-aging ${x.slaState}" data-plus-case="${x.id}"><div><b>${escPlus(x.transport_no)}</b><span>${escPlus(x.case_no)} · Store ${escPlus(x.store_code)}</span></div><strong>${x.ageHours} ชม.</strong></button>`).join('')||'<div class="muted">ไม่มี Ticket ค้าง</div>';
    rankList('#plusCauseList',d.topCauses||[],x=>x.reason||'ไม่ระบุ',x=>`${x.lines||0} รายการ · ฿${moneyPlus.format(x.amount||0)}`);
    rankList('#plusStoreList',d.topStores||[],x=>`Store ${x.store_code} ${x.store_name||''}`,x=>`${x.transports||0} Transport · ฿${moneyPlus.format(x.amount||0)}`);
    rankList('#plusTransportList',d.topTransports||[],x=>x.transport_no||'—',x=>`Store ${x.store_code||'—'} · ฿${moneyPlus.format(x.amount||0)}`);
  }catch(e){console.error(e);}
}
function rankList(selector,rows,title,meta){const h=q(selector);if(!h)return;h.innerHTML=rows.map((x,i)=>`<div><span>${i+1}</span><div><b>${escPlus(title(x))}</b><small>${escPlus(meta(x))}</small></div></div>`).join('')||'<div class="muted">ยังไม่มีข้อมูล</div>';}

function installQueueTools(){
  const page=q('#page-queue');if(!page||q('#plusQueueTools'))return;
  const stats=q('#queueStats');
  const html=`<article id="plusQueueTools" class="card plus-queue-tools"><div class="plus-section-head"><div><span class="eyebrow">MY WORK / SAVED FILTERS</span><h3>จัดลำดับงานจาก Transport และ SLA</h3></div><div class="plus-inline-actions"><button id="plusSaveFilter" class="btn ghost small" type="button">บันทึก Filter</button><button id="plusClearQueue" class="btn ghost small" type="button">ล้าง</button></div></div>
    <form id="plusQueueForm" class="plus-queue-filter"><input id="plusQueueQ" placeholder="Transport / Ticket / Store / Claim"><select id="plusQueueStatus"><option value="">ทุกสถานะ</option><option>SUBMITTED</option><option>UNDER_REVIEW</option><option>PENDING</option><option>RETURNED_TO_STORE</option><option>ACCEPT</option><option>REJECT</option><option>PARTIAL</option><option>CLOSED</option></select><select id="plusQueueAging"><option value="">ทุก Aging</option><option value="warning">ใกล้เกิน SLA</option><option value="overdue">เกิน SLA</option></select><label class="plus-check"><input id="plusQueueMine" type="checkbox"> My Work</label><select id="plusSavedFilters"><option value="">Saved Filter</option></select><button class="btn primary">ค้นหา</button></form>
    <div id="plusQueueSummary" class="plus-queue-summary"></div></article>`;
  if(stats)stats.insertAdjacentHTML('beforebegin',html);else page.querySelector('.page-intro')?.insertAdjacentHTML('afterend',html);
  q('#plusQueueForm').addEventListener('submit',e=>{e.preventDefault();loadQueuePlus();});
  q('#plusClearQueue').onclick=()=>{q('#plusQueueQ').value='';q('#plusQueueStatus').value='';q('#plusQueueAging').value='';q('#plusQueueMine').checked=false;loadQueuePlus();};
  q('#plusSaveFilter').onclick=saveQueueFilter;
  q('#plusSavedFilters').onchange=applySavedFilter;
  refreshSavedFilters();Plus.queueInstalled=true;
}
function queueParams(){const p=new URLSearchParams();const v=q('#plusQueueQ')?.value.trim();if(v)p.set('q',v);const s=q('#plusQueueStatus')?.value;if(s)p.set('status',s);const a=q('#plusQueueAging')?.value;if(a)p.set('aging',a);if(q('#plusQueueMine')?.checked)p.set('mine','1');return p;}
async function loadQueuePlus(){
  if(!Plus.user||isStorePlus()||!q('#plusQueueTools'))return;
  try{
    const r=await apiPlus('/api/v8/plus/queue?'+queueParams().toString());
    const sum=r.summary||{};q('#plusQueueSummary').innerHTML=`<span>${sum.total||0} Tickets</span><span class="warn">${sum.warning||0} ใกล้ SLA</span><span class="danger">${sum.overdue||0} เกิน SLA</span>`;
    const host=q('#queueList');if(host)host.innerHTML=(r.data||[]).map(plusTicketCard).join('')||'<div class="card muted">ไม่มี Ticket ตามเงื่อนไข</div>';
  }catch(e){plusToast('Queue',e.message,'error');}
}
function plusTicketCard(c){return `<article class="case-card v8-case-card plus-ticket ${escPlus(c.slaState)}" data-v8-case="${c.id}"><div class="v8-ticket-main"><span class="eyebrow">TRANSPORT / TICKET</span><div class="v8-transport">${escPlus(c.transport_no||'—')}</div><div class="v8-ticket-sub"><b>${escPlus(c.case_no)}</b><span>Store ${escPlus(c.store_code)} ${escPlus(c.store_name||'')}</span></div></div><div class="v8-ticket-facts"><div><span>สินค้า</span><b>${Number(c.item_count||0)} รายการ</b></div><div><span>มูลค่า</span><b>฿${moneyPlus.format(c.amount||0)}</b></div><div><span>Aging</span><b>${Number(c.ageHours||0).toFixed(1)} ชม.</b></div></div><div class="v8-ticket-status"><span class="plus-sla ${escPlus(c.slaState)}">${slaLabel(c.slaState)}</span><span class="status ${escPlus(c.status)}">${escPlus(c.status)}</span></div><button class="btn ghost small">เปิด Ticket →</button></article>`;}
function slaLabel(s){return s==='overdue'?'เกิน SLA':s==='warning'?'ใกล้ SLA':s==='done'?'เสร็จแล้ว':'อยู่ใน SLA';}
function filterKey(){return `claimCenterSavedFilters:${Plus.user?.username||'user'}`;}
function readFilters(){try{return JSON.parse(localStorage.getItem(filterKey())||'[]');}catch{return[];}}
function saveQueueFilter(){const name=prompt('ตั้งชื่อ Filter นี้');if(!name)return;const rows=readFilters().filter(x=>x.name!==name);rows.unshift({name,q:q('#plusQueueQ').value,status:q('#plusQueueStatus').value,aging:q('#plusQueueAging').value,mine:q('#plusQueueMine').checked});localStorage.setItem(filterKey(),JSON.stringify(rows.slice(0,12)));refreshSavedFilters();plusToast('Saved Filter','บันทึกแล้ว','success');}
function refreshSavedFilters(){const s=q('#plusSavedFilters');if(!s)return;s.innerHTML='<option value="">Saved Filter</option>'+readFilters().map((x,i)=>`<option value="${i}">${escPlus(x.name)}</option>`).join('');}
function applySavedFilter(){const i=Number(q('#plusSavedFilters').value),x=readFilters()[i];if(!x)return;q('#plusQueueQ').value=x.q||'';q('#plusQueueStatus').value=x.status||'';q('#plusQueueAging').value=x.aging||'';q('#plusQueueMine').checked=Boolean(x.mine);loadQueuePlus();}

function installStoreEvidenceCompose(){
  const tryInstall=()=>{
    const form=q('#storeClaimForm');if(!form||q('#plusEvidenceCompose'))return false;
    const actions=q('.v8-form-actions',form)||form.lastElementChild;
    const html=`<article id="plusEvidenceCompose" class="card plus-evidence-compose"><div class="card-head"><div><span class="eyebrow">EVIDENCE</span><h3>รูปหลักฐาน</h3><p class="muted">สูงสุด 5 รูป ระบบย่อภาพก่อนอัปโหลดเพื่อลดพื้นที่</p></div><span id="plusEvidenceCount" class="chip">0 / 5</span></div><input id="plusEvidenceFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple><div id="plusEvidencePreview" class="plus-evidence-preview"></div></article>`;
    actions?.insertAdjacentHTML('beforebegin',html);
    q('#plusEvidenceFiles').addEventListener('change',previewEvidenceFiles);return true;
  };
  if(tryInstall())return;let n=0;const t=setInterval(()=>{if(tryInstall()||++n>80)clearInterval(t);},100);
}
function previewEvidenceFiles(){const input=q('#plusEvidenceFiles'),host=q('#plusEvidencePreview');if(!input||!host)return;const files=[...input.files].slice(0,5);q('#plusEvidenceCount').textContent=`${files.length} / 5`;host.innerHTML=files.map((f,i)=>`<div><span>${i+1}</span><b>${escPlus(f.name)}</b><small>${Math.round(f.size/1024)} KB · จะบีบอัดก่อนส่ง</small></div>`).join('');}

async function captureSubmits(e){
  if(e.target?.id!=='storeClaimForm')return;
  if(Plus.storeSubmitBypass){Plus.storeSubmitBypass=false;rememberEvidenceForNewTicket();return;}
  e.preventDefault();e.stopImmediatePropagation();
  const form=e.target,transport=q('#storeClaimTransport')?.value.trim()||'';
  if(!transport)return plusToast('Transport','กรุณาระบุ Transport No.','error');
  const files=[...(q('#plusEvidenceFiles')?.files||[])];
  if(files.length>5)return plusToast('รูปหลักฐาน','สูงสุด 5 รูปต่อ Ticket','error');
  const warnings=storeDraftWarnings();
  try{
    const existing=await apiPlus(`/api/v8/plus/queue?transport=${encodeURIComponent(transport)}`);
    if((existing.data||[]).some(x=>String(x.transport_no)===transport))return plusToast('Transport ซ้ำ',`Transport ${transport} มี Ticket อยู่แล้ว`,'error');
  }catch{}
  showStoreConfirm(form,warnings,files.length);
}
function storeDraftWarnings(){
  const out=[];const receivedDate=q('#storeClaimReceivedDate')?.value||'',claimDate=q('#storeClaimDate')?.value||'';
  if(receivedDate&&claimDate&&claimDate<receivedDate)out.push('วันที่แจ้งเคลมอยู่ก่อนวันที่รับสินค้า');
  qa('#storeItemRows .v8-item-row').forEach((row,i)=>{
    const delivery=numberOrNull(q('.siDelivery',row)?.value),received=numberOrNull(q('.siReceived',row)?.value),claim=numberOrNull(q('.siClaim',row)?.value),price=Number(q('.siPrice',row)?.value||0);
    if(!(price>0))out.push(`รายการ ${i+1}: ยังไม่มีราคาจาก Master`);
    if(received!==null&&delivery!==null&&received>delivery)out.push(`รายการ ${i+1}: Received Qty มากกว่า Delivery Qty`);
    if(claim!==null&&received!==null&&claim>received)out.push(`รายการ ${i+1}: Claim Qty มากกว่า Received Qty`);
    if(!q('.siReason',row)?.value)out.push(`รายการ ${i+1}: ยังไม่ได้เลือก Claims Reason`);
  });return out;
}
function showStoreConfirm(form,warnings,fileCount){
  const d=q('#plusConfirmDialog'),body=q('#plusConfirmBody'),title=q('#plusConfirmTitle');title.textContent='ตรวจสอบ Ticket ก่อนส่ง';
  body.innerHTML=`<div class="plus-confirm-grid"><div><span>Transport</span><b>${escPlus(q('#storeClaimTransport')?.value||'—')}</b></div><div><span>Store</span><b>${escPlus(q('#storeClaimStore')?.value||'—')} ${escPlus(q('#v8StoreName')?.value||'')}</b></div><div><span>วันที่รับ</span><b>${escPlus(q('#storeClaimReceivedDate')?.value||'—')}</b></div><div><span>วันที่แจ้ง</span><b>${escPlus(q('#storeClaimDate')?.value||'—')}</b></div><div><span>สินค้า</span><b>${qa('#storeItemRows .v8-item-row').length} รายการ</b></div><div><span>รูปหลักฐาน</span><b>${fileCount} รูป</b></div><div class="span-2"><span>มูลค่า</span><b>${escPlus(q('#v8StoreTotal')?.textContent||'฿0.00')}</b></div></div>${warningBlock(warnings)}`;
  q('#plusConfirmAccept').textContent=warnings.length?'ยืนยันส่งพร้อมคำเตือน':'ยืนยันส่ง Ticket';
  q('#plusConfirmAccept').onclick=()=>{d.close();Plus.storeSubmitBypass=true;form.requestSubmit();};d.showModal();
}
function rememberEvidenceForNewTicket(){const files=[...(q('#plusEvidenceFiles')?.files||[])].slice(0,5);if(!files.length)return;Plus.pendingEvidence={transport:q('#storeClaimTransport')?.value.trim()||'',files};setTimeout(uploadPendingEvidence,700);}
async function uploadPendingEvidence(){const pending=Plus.pendingEvidence;if(!pending?.transport||!pending.files?.length)return;for(let attempt=0;attempt<18;attempt++){try{const r=await apiPlus(`/api/v8/plus/queue?transport=${encodeURIComponent(pending.transport)}`),row=(r.data||[]).find(x=>String(x.transport_no)===pending.transport);if(row){Plus.pendingEvidence=null;await uploadEvidenceFiles(row.id,pending.files);return;}}catch{}await sleep(450);}Plus.pendingEvidence=null;plusToast('รูปหลักฐาน','สร้าง Ticket แล้ว แต่ยังจับ Ticket เพื่ออัปโหลดรูปไม่สำเร็จ สามารถแนบจากหน้า Ticket ได้','error');}

function captureClicks(e){
  const caseEl=e.target.closest('[data-v8-case],[data-plus-case]');if(caseEl){const id=Number(caseEl.dataset.v8Case||caseEl.dataset.plusCase||0);if(id){Plus.activeCaseId=id;if(caseEl.dataset.plusCase){e.preventDefault();e.stopImmediatePropagation();openViaV8(id);}setTimeout(()=>loadCaseContext(id),420);}}
  const claim=e.target.closest('[data-plus-claim]');if(claim){e.preventDefault();openClaimInRegistry(claim.dataset.plusClaim);}
  if(e.target.closest('#notifyBtn'))setTimeout(renderNotificationCenterPlus,120);
  if(e.target.closest('#saveClaim'))captureClaimSave(e);
  if(e.target.closest('#plusAuditNav')){e.preventDefault();e.stopImmediatePropagation();showPlusAudit();}
  if(e.target.matches('[data-plus-reopen]')){e.preventDefault();reopenActiveCase();}
  if(e.target.matches('[data-plus-upload-evidence]')){e.preventDefault();uploadExistingEvidence();}
  const del=e.target.closest('[data-plus-delete-evidence]');if(del){e.preventDefault();deleteEvidence(Number(del.dataset.plusDeleteEvidence));}
  const notifyCase=e.target.closest('[data-plus-notify-case]');if(notifyCase){e.preventDefault();q('#notifyPanel').hidden=true;openViaV8(Number(notifyCase.dataset.plusNotifyCase));}
  if(e.target.closest('[data-v8-status],[data-v8-return]')&&Plus.activeCaseId)setTimeout(()=>loadCaseContext(Plus.activeCaseId),700);
}
function openViaV8(id){const ghost=document.createElement('button');ghost.dataset.v8Case=String(id);ghost.hidden=true;document.body.append(ghost);setTimeout(()=>{ghost.click();ghost.remove();},0);}
function openClaimInRegistry(claimNo){q('#plusGlobalResults').hidden=true;const nav=q('.nav[data-page="registry"]');if(nav)nav.click();setTimeout(()=>{if(q('#regClaim'))q('#regClaim').value=claimNo;q('#registryFilter')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));},120);}

function captureClaimSave(e){
  if(Plus.claimSaveBypass){Plus.claimSaveBypass=false;return;}
  e.preventDefault();e.stopImmediatePropagation();
  const d=q('#plusConfirmDialog'),body=q('#plusConfirmBody');q('#plusConfirmTitle').textContent='Claim Summary ก่อนบันทึก';
  const warnings=[];const meta=q('#metaItems')?.textContent||'';const m=meta.match(/(\d+) missing prices/i);if(m&&Number(m[1])>0)warnings.push(`มี ${m[1]} รายการที่ไม่มีราคา`);if(!q('#globalStatus')?.value)warnings.push('ยังไม่ได้เลือก Status');if(!q('#globalWho')?.value)warnings.push('ยังไม่ได้เลือก WHO');
  body.innerHTML=`<div class="plus-confirm-grid"><div><span>Claim No.</span><b>${escPlus(q('#metaClaim')?.textContent||'—')}</b></div><div><span>Transport</span><b>${escPlus(q('#metaTransport')?.textContent||'—')}</b></div><div><span>Store</span><b>${escPlus(q('#metaStore')?.textContent||'—')}</b></div><div><span>สินค้า</span><b>${qa('#decisionRows tr').length} รายการ</b></div><div><span>ยอดรวม</span><b>${escPlus(q('#metaAmount')?.textContent||'฿0.00')}</b></div><div><span>Decision</span><b>${escPlus(q('#decisionSummary')?.textContent||'—')}</b></div><div><span>Status</span><b>${escPlus(q('#globalStatus')?.value||'—')}</b></div><div><span>WHO</span><b>${escPlus(q('#globalWho')?.value||'—')}</b></div></div>${warningBlock(warnings)}`;
  q('#plusConfirmAccept').textContent='ยืนยันบันทึก Claim';q('#plusConfirmAccept').onclick=()=>{d.close();Plus.claimSaveBypass=true;q('#saveClaim')?.click();};d.showModal();
}
function warningBlock(warnings){return warnings.length?`<div class="plus-warning-block"><b>พบ ${warnings.length} คำเตือน</b>${warnings.map(x=>`<div>• ${escPlus(x)}</div>`).join('')}</div>`:'<div class="plus-ok-block">✓ ไม่พบเงื่อนไขผิดปกติจากการตรวจเบื้องต้น</div>';}

async function loadCaseContext(id){
  const content=q('#caseContent');if(!content||!id)return;
  try{
    const r=await apiPlus(`/api/v8/plus/cases/${id}/context`),d=r.data||{};Plus.activeCaseId=id;
    q('#plusCaseOps')?.remove();
    content.insertAdjacentHTML('beforeend',caseOpsHtml(d));
  }catch(e){console.error(e);}
}
function caseOpsHtml(d){const c=d.case||{},warnings=d.warnings||[],evidence=d.evidence||[],timeline=d.timeline||[];const canEditEvidence=(isStorePlus()&&['SUBMITTED','RETURNED_TO_STORE'].includes(String(c.status)))||canReviewPlus();return `<section id="plusCaseOps" class="plus-case-ops">
  <div class="plus-section-head"><div><span class="eyebrow">QUALITY & EVIDENCE</span><h3>ตรวจข้อมูลและหลักฐาน</h3></div><span class="plus-sla ${escPlus(d.age?.slaState||'ok')}">${slaLabel(d.age?.slaState)} · ${Number(d.age?.ageHours||0).toFixed(1)} ชม.</span></div>
  ${warningBlock(warnings.map(x=>x.message))}
  <div class="plus-evidence-head"><b>รูปหลักฐาน ${evidence.length} / 5</b><small>${d.evidenceEnabled?'R2 Evidence Storage':'R2 ยังไม่ได้เชื่อมกับ Worker'}</small></div>
  <div class="plus-gallery">${evidence.map(x=>`<figure><a href="/api/v8/plus/evidence/${x.id}" target="_blank" rel="noopener"><img loading="lazy" src="/api/v8/plus/evidence/${x.id}" alt="${escPlus(x.file_name)}"></a><figcaption><b>${escPlus(x.file_name)}</b><small>${escPlus(x.uploaded_by)} · ${escPlus(x.uploaded_at)}</small>${canEditEvidence?`<button type="button" class="link danger" data-plus-delete-evidence="${x.id}">ลบ</button>`:''}</figcaption></figure>`).join('')||'<div class="muted">ยังไม่มีรูปหลักฐาน</div>'}</div>
  ${canEditEvidence&&evidence.length<5?`<div class="plus-upload-row"><input id="plusCaseEvidenceFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple><button class="btn ghost small" type="button" data-plus-upload-evidence>เพิ่มรูป</button></div>`:''}
  <div class="plus-section-head timeline-head"><div><span class="eyebrow">TIMELINE</span><h3>ประวัติ Ticket</h3></div>${canReviewPlus()&&['ACCEPT','REJECT','PARTIAL','CLOSED'].includes(String(c.status))?'<button class="btn warning small" type="button" data-plus-reopen>Reopen Ticket</button>':''}</div>
  <div class="plus-timeline">${timeline.map(x=>`<div class="plus-event ${escPlus(x.type)}"><i></i><div><b>${escPlus(x.title)}</b><p>${escPlus(x.detail||'')}</p><small>${escPlus(x.at)}${x.by?` · ${escPlus(x.by)}`:''}</small></div></div>`).join('')||'<div class="muted">ยังไม่มี Timeline</div>'}</div>
</section>`;}
async function reopenActiveCase(){if(!Plus.activeCaseId)return;const reason=prompt('เหตุผลที่ Reopen Ticket');if(!reason)return;try{await apiPlus(`/api/v8/plus/cases/${Plus.activeCaseId}/reopen`,{method:'POST',body:{reason}});plusToast('Reopen','เปิด Ticket กลับเป็น Pending แล้ว','success');q('#caseDialog')?.close();setTimeout(()=>openViaV8(Plus.activeCaseId),120);}catch(e){plusToast('Reopen ไม่สำเร็จ',e.message,'error');}}
async function uploadExistingEvidence(){const files=[...(q('#plusCaseEvidenceFiles')?.files||[])].slice(0,5);if(!files.length)return plusToast('รูปหลักฐาน','เลือกรูปก่อน','error');await uploadEvidenceFiles(Plus.activeCaseId,files);loadCaseContext(Plus.activeCaseId);}
async function uploadEvidenceFiles(caseId,files){for(const file of files){try{const compressed=await compressImage(file);const form=new FormData();form.append('file',compressed,compressed.name);await formPlus(`/api/v8/plus/cases/${caseId}/evidence`,form);}catch(e){plusToast('อัปโหลดรูปไม่สำเร็จ',`${file.name}: ${e.message}`,'error');return;}}plusToast('รูปหลักฐาน',`อัปโหลด ${files.length} รูปแล้ว`,'success');}
async function deleteEvidence(id){if(!confirm('ลบรูปหลักฐานนี้หรือไม่?'))return;try{await apiPlus(`/api/v8/plus/evidence/${id}`,{method:'DELETE'});plusToast('รูปหลักฐาน','ลบแล้ว','success');loadCaseContext(Plus.activeCaseId);}catch(e){plusToast('ลบรูปไม่ได้',e.message,'error');}}

async function compressImage(file){
  if(file.size<=650000&&['image/jpeg','image/webp'].includes(file.type))return file;
  const bmp=await createImageBitmap(file);let max=1600,quality=.78,blob;
  for(let attempt=0;attempt<4;attempt++){
    const scale=Math.min(1,max/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bmp,0,0,w,h);
    blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob&&blob.size<=1150000)break;quality-=.12;max=Math.round(max*.82);
  }
  bmp.close?.();if(!blob)throw new Error('ไม่สามารถบีบอัดรูปได้');return new File([blob],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg',lastModified:Date.now()});
}

async function renderNotificationCenterPlus(){const host=q('#notifyList');if(!host||!Plus.user)return;try{const r=await apiPlus('/api/v7/notifications');host.innerHTML=(r.data||[]).map(n=>`<article class="notify ${n.is_read?'':'unread'}" ${n.store_case_id?`data-plus-notify-case="${n.store_case_id}" role="button" tabindex="0"`:''}><b>${escPlus(n.title)}</b><p>${escPlus(n.message)}</p><small>${escPlus(n.created_at)}</small>${n.store_case_id?'<span class="plus-open-hint">เปิด Ticket →</span>':''}</article>`).join('')||'<div class="muted">ไม่มีการแจ้งเตือน</div>';if(q('#notifyBadge'))q('#notifyBadge').textContent=r.unread||0;}catch(e){console.error(e);}}

function installAuditWhenReady(){
  const tryInstall=()=>{
    const ops=q('#opsNav'),content=q('.content');if(!ops||!content||q('#plusAuditNav'))return false;
    const btn=document.createElement('button');btn.id='plusAuditNav';btn.className='nav plus-admin-only';btn.innerHTML='<span>◎</span>Audit Log';ops.append(btn);
    content.insertAdjacentHTML('beforeend',`<section id="page-plus-audit" class="page plus-page" data-title="Audit Log" data-eyebrow="ADMIN TRACE"><div class="page-intro"><div><span class="eyebrow">AUDIT TRAIL</span><h1>ประวัติการเปลี่ยนแปลงระบบ</h1><p>ค้นว่าใครทำอะไร กับ Ticket / Claim / Master / Decision และเวลาใด</p></div><button id="plusAuditRefresh" class="btn ghost">↻ Refresh</button></div><form id="plusAuditForm" class="filter-card"><input id="plusAuditQ" placeholder="User / Action / Ticket / Claim / Transport"><input id="plusAuditFrom" type="date"><input id="plusAuditTo" type="date"><button class="btn primary">ค้นหา</button></form><article class="card"><div class="table-wrap"><table class="plus-audit-table"><thead><tr><th>เวลา</th><th>User</th><th>Action</th><th>Entity</th><th>Claim / Transport</th><th>รายละเอียด</th></tr></thead><tbody id="plusAuditRows"></tbody></table></div></article></section>`);
    q('#plusAuditForm').addEventListener('submit',e=>{e.preventDefault();loadAuditPlus();});q('#plusAuditRefresh').onclick=loadAuditPlus;Plus.auditInstalled=true;return true;
  };
  if(!tryInstall()){let n=0;const t=setInterval(()=>{if(tryInstall()||++n>60)clearInterval(t);},100);}
}
function applyPlusRole(){qa('.plus-admin-only').forEach(x=>x.hidden=!isAdminPlus());refreshSavedFilters();}
function showPlusAudit(){qa('.page').forEach(p=>p.classList.toggle('active',p.id==='page-plus-audit'));qa('.nav').forEach(n=>n.classList.toggle('active',n.id==='plusAuditNav'));q('#pageTitle').textContent='Audit Log';q('#pageEyebrow').textContent='ADMIN TRACE';loadAuditPlus();}
async function loadAuditPlus(){if(!isAdminPlus()||!q('#plusAuditRows'))return;const p=new URLSearchParams();if(q('#plusAuditQ').value.trim())p.set('q',q('#plusAuditQ').value.trim());if(q('#plusAuditFrom').value)p.set('from',q('#plusAuditFrom').value);if(q('#plusAuditTo').value)p.set('to',q('#plusAuditTo').value);try{const r=await apiPlus('/api/v8/plus/audit?'+p.toString());q('#plusAuditRows').innerHTML=(r.data||[]).map(x=>`<tr><td>${escPlus(x.created_at)}</td><td><b>${escPlus(x.username)}</b></td><td>${escPlus(x.action)}</td><td>${escPlus(x.entity_key)}</td><td>${escPlus(x.claim_no||'—')}<br><small>${escPlus(x.transport_no||'')}</small></td><td>${escPlus(x.details||'')}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">ไม่พบ Audit</td></tr>';}catch(e){plusToast('Audit',e.message,'error');}}

function installReports(){
  const page=q('#page-exports');if(!page||q('#plusBusinessReport'))return;
  page.insertAdjacentHTML('afterbegin',`<article id="plusBusinessReport" class="card plus-business-report"><div class="card-head"><div><span class="eyebrow">BUSINESS DOCUMENT</span><h3>Claim Summary สำหรับส่งต่อ</h3><p class="muted">Excel แบบอ่านง่าย หรือ Print/PDF พร้อมยอดรวม</p></div></div><div class="plus-report-filter"><label>จากวันที่<input id="plusReportFrom" type="date"></label><label>ถึงวันที่<input id="plusReportTo" type="date"></label><label>Store<input id="plusReportStore" placeholder="ทุก Store"></label><label>Status<select id="plusReportStatus"><option value="">ทุกสถานะ</option><option>Accept</option><option>Pending</option><option>Reject</option></select></label><button id="plusReportExcel" class="btn primary" type="button">Excel Report</button><button id="plusReportPdf" class="btn ghost" type="button">PDF / Print</button></div><div id="plusReportSummary" class="muted"></div></article>`);
  q('#plusReportExcel').onclick=()=>downloadBusinessReport('excel');q('#plusReportPdf').onclick=()=>downloadBusinessReport('print');Plus.reportInstalled=true;
}
function reportParams(){const p=new URLSearchParams();if(q('#plusReportFrom')?.value)p.set('from',q('#plusReportFrom').value);if(q('#plusReportTo')?.value)p.set('to',q('#plusReportTo').value);if(q('#plusReportStore')?.value.trim())p.set('store',q('#plusReportStore').value.trim());if(q('#plusReportStatus')?.value)p.set('status',q('#plusReportStatus').value);return p;}
async function downloadBusinessReport(mode){let printWin=null;if(mode==='print')printWin=window.open('','_blank');try{const r=await apiPlus('/api/v8/plus/report?'+reportParams().toString()),rows=r.data||[],s=r.summary||{};q('#plusReportSummary').textContent=`${s.claims||0} Claims · ${s.lines||0} รายการ · ฿${moneyPlus.format(s.amount||0)}`;if(mode==='excel')return exportExcel(rows,s);renderPrintReport(printWin,rows,s);}catch(e){printWin?.close();plusToast('Report',e.message,'error');}}
function exportExcel(rows,summary){if(!window.XLSX)return plusToast('Excel','XLSX library ยังไม่พร้อม','error');const data=rows.map(x=>({'Claim No.':x.claim_no,'Reference':x.reference_no,'Store':x.store_code,'Store Name':x.store_name,'Transport':x.transport_no,'Received Date':x.received_date,'Claim Date':x.claim_date,'Ship Date':x.ship_date,'Claim DC':x.claim_dc,'Article':x.article,'Barcode':x.barcode,'Description':x.description,'Delivery Qty':x.delivery_qty,'Received Qty':x.received_qty,'Claim Qty':x.claim_qty,'SKU Cost':x.sku_cost,'Amount':x.amount_claim,'Reason':x.claims_reason,'Status':x.update_status,'WHO':x.who,'Cause':x.cause_group,'Root Cause':x.root_cause,'Check':x.check_result,'Remark List':x.remark_list,'SC':x.sc,'Complete SC':x.complete_sc,'Remark':x.remark}));const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Claim Summary');const ss=XLSX.utils.aoa_to_sheet([['Claim Center Summary'],['Claims',summary.claims||0],['Lines',summary.lines||0],['Amount',summary.amount||0],['Generated',new Date().toLocaleString('th-TH')]]);XLSX.utils.book_append_sheet(wb,ss,'Summary');XLSX.writeFile(wb,`Claim-Center-Report-${todayPlus()}.xlsx`);}
function renderPrintReport(w,rows,s){if(!w)return plusToast('PDF / Print','Browser ปิดกั้นหน้าต่าง Print กรุณาอนุญาต Pop-up','error');const body=rows.slice(0,3000).map(x=>`<tr><td>${escPlus(x.claim_no)}</td><td>${escPlus(x.store_code)}</td><td>${escPlus(x.transport_no)}</td><td>${escPlus(x.article)}</td><td>${escPlus(x.description)}</td><td>${escPlus(x.claim_qty)}</td><td>${moneyPlus.format(x.amount_claim||0)}</td><td>${escPlus(x.update_status)}</td></tr>`).join('');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Claim Center Report</title><style>body{font-family:Arial,'Noto Sans Thai',sans-serif;padding:28px;color:#172033}h1{margin:0}p{color:#667085}section{display:flex;gap:28px;margin:18px 0;padding:14px;background:#f4f6f8}section b{font-size:20px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #d8dde6;padding:5px;text-align:left}th{background:#eef1f5}@media print{button{display:none}}</style></head><body><h1>Claim Center · Claim Summary</h1><p>Generated ${new Date().toLocaleString('th-TH')}</p><section><div>Claims<br><b>${s.claims||0}</b></div><div>Lines<br><b>${s.lines||0}</b></div><div>Total Amount<br><b>฿${moneyPlus.format(s.amount||0)}</b></div></section><table><thead><tr><th>Claim</th><th>Store</th><th>Transport</th><th>Article</th><th>Description</th><th>Qty</th><th>Amount</th><th>Status</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();}

function installDialogs(){if(q('#plusConfirmDialog'))return;document.body.insertAdjacentHTML('beforeend',`<dialog id="plusConfirmDialog" class="plus-confirm-dialog"><div class="dialog-head"><div><span class="eyebrow">FINAL CHECK</span><h3 id="plusConfirmTitle">ตรวจสอบก่อนบันทึก</h3></div><button id="plusConfirmClose" class="icon-btn" type="button">×</button></div><div id="plusConfirmBody"></div><div class="plus-confirm-actions"><button id="plusConfirmCancel" class="btn ghost" type="button">กลับไปแก้ไข</button><button id="plusConfirmAccept" class="btn primary" type="button">ยืนยัน</button></div></dialog>`);q('#plusConfirmClose').onclick=q('#plusConfirmCancel').onclick=()=>q('#plusConfirmDialog').close();}
function numberOrNull(v){if(v===undefined||v===null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

startPlus();
