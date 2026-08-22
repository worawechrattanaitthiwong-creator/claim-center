const runtimeStyle=document.createElement('link');
runtimeStyle.rel='stylesheet';
runtimeStyle.href='/v5-extra.css?v=20260822-v5-loginfix1';
document.head.appendChild(runtimeStyle);

// Keep the sign-in surface professional: never expose a real account as UI guidance.
const loginUser=document.getElementById('loginUsername');
if(loginUser){
  loginUser.placeholder='กรอก Username หรือรหัสพนักงาน';
  loginUser.removeAttribute('value');
}
const loginPass=document.getElementById('loginPassword');
if(loginPass) loginPass.placeholder='กรอกรหัสผ่าน';

const buildNode=document.getElementById('loginBuild');
if(buildNode){
  const label=buildNode.parentElement;
  if(label){
    label.firstChild && (label.firstChild.textContent='System ');
    buildNode.textContent='กำลังเชื่อมต่อ…';
  }
  new MutationObserver(()=>{
    const value=(buildNode.textContent||'').trim();
    const holder=buildNode.parentElement;
    if(!holder)return;
    if(value==='unavailable'){
      buildNode.textContent='ไม่สามารถเชื่อมต่อระบบ';
      buildNode.style.color='#e44b60';
    }else if(value && value!=='checking…' && value!=='กำลังเชื่อมต่อ…'){
      buildNode.textContent='พร้อมใช้งาน';
      buildNode.style.color='#1ca676';
    }
  }).observe(buildNode,{childList:true,characterData:true,subtree:true});
}

const files=[
  '/app-core-v5.js?v=20260822-v5-loginfix1',
  '/claim-workspace-v5.js?v=20260822-v5-loginfix1',
  '/admin-v5.js?v=20260822-v5-loginfix1'
];

try{
  const parts=await Promise.all(files.map(async url=>{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error(`Load failed: ${url} (${r.status})`);
    return r.text();
  }));
  (0,eval)(parts.join('\n\n'));

  // On mobile/custom tabs DOMContentLoaded can already be finished while the
  // runtime chunks are downloading. Start immediately in that case.
  if(document.readyState!=='loading' && typeof globalThis.init==='function'){
    queueMicrotask(()=>globalThis.init());
  }
}catch(error){
  console.error('Claim Center runtime bootstrap failed',error);
  if(buildNode){
    buildNode.textContent='ระบบโหลดไม่สมบูรณ์';
    buildNode.style.color='#e44b60';
  }
  const button=document.querySelector('.login-btn');
  if(button){
    button.disabled=true;
    button.querySelector('span').textContent='กำลังแก้ไขการเชื่อมต่อระบบ';
  }
}
