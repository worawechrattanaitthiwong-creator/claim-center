import './app-core.js';

const CONTRACT_HEADERS = [
  'Store Code','Store Name (Thai)','Claim DC','Received Date','Claim Date','Transport No.','VehicleNo.','Driver','DN No.','Route','Pallet No.','Basket No.','Article','Barcode','Description','Delivery Qty (PU/Kg)','Received QTY (PU/Kg)','Claim Qty (PU/Kg)','Claims Reason','Amount claim','Ship Date','Update status','WHO','Format Type','Claim NO','Reference_No.','Cause Group','ROOT CAUSE','Check','Remark List','Eggs','Format Type','MANAGE_WEIGHT','SC','Complet SC','Remark','Store Hyper เช็ค 100 %','SKU_cost','SEG_DESCRIPTION','ผู้บันทึกข้อมูล','Unique Key','Month','Year'
];
const COLUMN_HINTS = {claimReason:'S',claimReplyDate:'U',claimStatus:'V',claimWho:'W',claimCauseGroup:'AA',claimRootCause:'AB',claimCheck:'AC',claimRemarkList:'AD',claimSc:'AH',claimCompleteSc:'AI',claimRemark:'AJ'};
let lastSavedMeta = null;
let historyContractValid = true;
const nativeFetch = window.fetch.bind(window);

window.fetch = async function claimContractFetch(input, init = {}) {
  const response = await nativeFetch(input, init);
  let url;
  try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch { return response; }
  const method = String(init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
  if (url.pathname === '/api/claims/bulk' && method === 'POST' && response.ok) {
    response.clone().json().then(body => {
      if (Array.isArray(body?.saved) && body.saved.length) {
        lastSavedMeta = body.saved[0];
        setClaimMeta(lastSavedMeta);
        toastCompat('บันทึกสำเร็จ', `Claim No. ${lastSavedMeta.claimNo || '-'} · Reference ${lastSavedMeta.referenceNo || '-'}`);
      }
    }).catch(() => {});
  }
  if (/^\/api\/claims\/group\//.test(url.pathname) && method === 'GET' && response.ok) {
    response.clone().json().then(body => {
      const row = body?.rows?.[0];
      if (!row) return;
      lastSavedMeta = {transportNo:row.transportNo,claimNo:row.claimNo,referenceNo:row.referenceNo,status:row.status,who:row.who,formatType:row.formatType};
      setTimeout(() => setClaimMeta(lastSavedMeta), 0);
    }).catch(() => {});
  }
  return response;
};

document.addEventListener('DOMContentLoaded', () => {
  installMasterProgress();
  installExcelEntryPanel();
  installExactExport();
  installHistoryContractGuard();
  relabelAndHintFields();
});

function installMasterProgress() {
  const busy=document.querySelector('#busy'), busyText=document.querySelector('#busyText'), progress=document.querySelector('#masterProgressText');
  const file=document.querySelector('#masterFileName'), button=document.querySelector('#replaceMaster');
  if(!busy||!busyText||!progress)return;
  const fmt=new Intl.NumberFormat('th-TH');
  new MutationObserver(() => {
    if(busy.hidden)return;
    const m=String(progress.textContent||'').match(/Uploading\s+([\d,]+)\s*\/\s*([\d,]+)/i);
    if(!m)return;
    const done=Number(m[1].replaceAll(',',''))||0,total=Number(m[2].replaceAll(',',''))||0,pct=total?Math.min(100,Math.round(done/total*100)):0;
    busyText.textContent=`กำลังอัปโหลด Master Article · ${fmt.format(done)} / ${fmt.format(total)} (${pct}%)`;
  }).observe(progress,{childList:true,characterData:true,subtree:true});
  button?.addEventListener('click',()=>setTimeout(()=>{
    if(busy.hidden)return;
    const m=String(file?.textContent||'').match(/([\d,]+)\s*rows/i), total=m?Number(m[1].replaceAll(',',''))||0:0;
    if(total)busyText.textContent=`กำลังเตรียมอัปโหลด Master Article · 0 / ${fmt.format(total)} (0%)`;
  },0),true);
}

function installExcelEntryPanel() {
  const editor=document.querySelector('#claimEditor'), head=editor?.querySelector('.panel-head');
  if(!editor||!head||document.querySelector('#ccdMetaStrip'))return;
  const strip=document.createElement('div');
  strip.id='ccdMetaStrip';strip.className='ccd-meta-strip';
  strip.innerHTML=`<div><span>Transport No.</span><strong id="ccdMetaTransport">-</strong></div><div><span>Format Type</span><strong id="ccdMetaFormat">-</strong></div><div><span>Claim No.</span><strong id="ccdMetaClaim">สร้างอัตโนมัติหลังบันทึก</strong></div><div class="reference"><span>Reference No.</span><strong id="ccdMetaReference">-</strong></div>`;
  head.insertAdjacentElement('afterend',strip);
  injectStyles();
  const body=document.querySelector('#claimPreviewBody');
  if(body)new MutationObserver(updateMetaFromPreview).observe(body,{childList:true,subtree:true});
  document.querySelector('#claimStatus')?.addEventListener('change',updateReferenceExpectation);
  document.querySelector('#claimWho')?.addEventListener('change',updateReferenceExpectation);
  document.querySelector('#resetClaim')?.addEventListener('click',()=>{lastSavedMeta=null;setClaimMeta({referenceNo:'-'});});
  updateMetaFromPreview();
}
function updateMetaFromPreview(){
  const cells=document.querySelector('#claimPreviewBody tr')?.querySelectorAll('td');if(!cells?.length)return;
  const store=String(cells[1]?.textContent||'').trim(),transport=String(cells[2]?.textContent||'').trim();
  const format=store.startsWith('1')?'HYPER':store.startsWith('2')?'MBC':store.startsWith('3')?'FRANCHISE':'';
  setText('#ccdMetaTransport',transport||'-');setText('#ccdMetaFormat',lastSavedMeta?.formatType||format||'-');
  if(!lastSavedMeta||lastSavedMeta.transportNo!==transport){setText('#ccdMetaClaim','สร้างอัตโนมัติหลังบันทึก');updateReferenceExpectation();}
}
function setClaimMeta(meta={}){setText('#ccdMetaTransport',meta.transportNo||'-');setText('#ccdMetaFormat',meta.formatType||inferFormat()||'-');setText('#ccdMetaClaim',meta.claimNo||'สร้างอัตโนมัติหลังบันทึก');setText('#ccdMetaReference',meta.referenceNo||'-');}
function updateReferenceExpectation(){
  const status=document.querySelector('#claimStatus')?.value||'',who=document.querySelector('#claimWho')?.value||'',el=document.querySelector('#ccdMetaReference');if(!el)return;
  if(lastSavedMeta?.referenceNo&&lastSavedMeta.referenceNo!=='-')el.textContent=lastSavedMeta.referenceNo;
  else el.textContent=status==='Accept'&&['DC','TP'].includes(who)?'สร้างอัตโนมัติหลังบันทึก':'-';
}
function inferFormat(){const store=String(document.querySelector('#claimPreviewBody tr td:nth-child(2)')?.textContent||'').trim();return store.startsWith('1')?'HYPER':store.startsWith('2')?'MBC':store.startsWith('3')?'FRANCHISE':'';}

function relabelAndHintFields(){
  const ship=document.querySelector('#claimReplyDate')?.closest('label')?.querySelector('span');if(ship)ship.textContent='Ship Date';
  for(const [id,col] of Object.entries(COLUMN_HINTS)){const span=document.getElementById(id)?.closest('label')?.querySelector('span');if(span&&!span.querySelector('.col-hint'))span.insertAdjacentHTML('beforeend',` <small class="col-hint">${col}</small>`);}
}

function installExactExport(){
  const button=document.querySelector('#exportClaims');if(!button)return;
  button.addEventListener('click',async event=>{
    event.preventDefault();event.stopImmediatePropagation();setBusy(true,'กำลัง Export A:AQ 43 คอลัมน์');
    try{
      const response=await window.fetch('/api/claims/export'),body=await response.json();if(!response.ok)throw new Error(body?.message||`HTTP ${response.status}`);
      const headers=Array.isArray(body.headers)&&body.headers.length===43?body.headers:CONTRACT_HEADERS;
      const rows=(body.rows||[]).map(normalizeExportRow);const ws=XLSX.utils.aoa_to_sheet([headers,...rows],{cellDates:true});styleSheet(ws,rows.length+1);
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Data Worksheet');XLSX.writeFile(wb,`Claim_Data_${new Date().toISOString().slice(0,10)}.xlsx`,{cellDates:true});
      toastCompat('Export สำเร็จ',`${rows.length.toLocaleString('th-TH')} แถว · A:AQ 43 คอลัมน์`);
    }catch(e){toastCompat('Export ไม่สำเร็จ',e.message||String(e),'error');}finally{setBusy(false);}
  },true);
}
function normalizeExportRow(row){const out=Array.isArray(row)?[...row]:[];while(out.length<43)out.push('');out.length=43;for(const i of [3,4,20])out[i]=asDate(out[i]);return out;}
function asDate(value){if(value instanceof Date||!value)return value||'';const s=String(value).trim(),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/),dmy=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(iso)return new Date(+iso[1],+iso[2]-1,+iso[3]);if(dmy)return new Date(+dmy[3],+dmy[2]-1,+dmy[1]);return value;}
function styleSheet(ws,rowCount){
  ws['!cols']=CONTRACT_HEADERS.map((h,i)=>({wch:Math.min(34,Math.max(11,h.length+2,[1,2,7,14,18,26,27,28,29,35,38].includes(i)?20:11))}));
  for(let c=0;c<43;c++){const cell=ws[XLSX.utils.encode_cell({r:0,c})];if(cell)cell.s={font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'1E3A5F'}},alignment:{horizontal:'center',vertical:'center'}};}
  for(let r=1;r<rowCount;r++)for(const c of [3,4,20]){const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell&&cell.v instanceof Date)cell.z='dd/mm/yyyy';}
  ws['!autofilter']={ref:`A1:AQ${Math.max(1,rowCount)}`};
}

function installHistoryContractGuard(){
  const input=document.querySelector('#historyFile'),button=document.querySelector('#importHistory');if(!input||!button)return;
  input.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file||typeof XLSX==='undefined')return;
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
      const raw=rows[0]||[],headers=raw.slice(0,43).map(v=>String(v??'').trim()),errors=compareHeaders(headers,CONTRACT_HEADERS);
      historyContractValid=errors.length===0&&raw.length===43;const label=document.querySelector('#historyFileName');
      if(historyContractValid){if(label)label.textContent=`${file.name} · A:AQ 43 คอลัมน์ ✓`;button.disabled=false;}
      else{if(label)label.textContent=`${file.name} · ${errors.slice(0,3).join(' | ')||`พบ ${raw.length} คอลัมน์`}`;button.disabled=true;toastCompat('Import ถูกระงับ','หัวตารางต้องตรง Claim_Data A:AQ 43 คอลัมน์','error');}
    }catch(e){historyContractValid=false;button.disabled=true;toastCompat('อ่านไฟล์ไม่สำเร็จ',e.message||String(e),'error');}
  },true);
  button.addEventListener('click',event=>{if(historyContractValid)return;event.preventDefault();event.stopImmediatePropagation();toastCompat('ยัง Import ไม่ได้','หัวตารางไม่ตรง A:AQ 43 คอลัมน์','error');},true);
}
function compareHeaders(actual,expected){const e=[];for(let i=0;i<expected.length;i++)if((actual[i]||'')!==expected[i])e.push(`${excelCol(i)} ต้องเป็น “${expected[i]}”`);return e;}
function excelCol(index){let n=index+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;}

function injectStyles(){if(document.querySelector('#ccdCompatStyles'))return;const s=document.createElement('style');s.id='ccdCompatStyles';s.textContent=`.ccd-meta-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 16px;margin:-2px 0 18px;border:1px solid var(--line,#dbe4f0);border-radius:16px;background:linear-gradient(135deg,rgba(79,70,229,.06),rgba(14,165,233,.04))}.ccd-meta-strip>div{min-width:0;padding:10px 12px;border-radius:12px;background:var(--surface,#fff);border:1px solid var(--line,#e5e7eb)}.ccd-meta-strip span{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--muted,#64748b);text-transform:uppercase}.ccd-meta-strip strong{display:block;margin-top:4px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ccd-meta-strip .reference{border-color:rgba(16,185,129,.32);box-shadow:inset 3px 0 0 #10b981}.col-hint{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;margin-left:4px;padding:0 6px;border-radius:99px;background:rgba(79,70,229,.08);color:#4f46e5;font-size:10px;font-weight:900}@media(max-width:900px){.ccd-meta-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}`;document.head.appendChild(s);}
function setBusy(show,text='กำลังทำงาน…'){const busy=document.querySelector('#busy'),label=document.querySelector('#busyText');if(busy)busy.hidden=!show;if(label&&show)label.textContent=text;}
function toastCompat(title,message='',type='success'){const host=document.querySelector('#toastHost');if(!host)return;const d=document.createElement('div');d.className=`toast ${type}`;d.innerHTML=`<strong>${escapeHtml(title)}</strong>${message?`<span>${escapeHtml(message)}</span>`:''}`;host.appendChild(d);setTimeout(()=>d.remove(),4500);}
function setText(selector,value){const el=document.querySelector(selector);if(el)el.textContent=value;}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
