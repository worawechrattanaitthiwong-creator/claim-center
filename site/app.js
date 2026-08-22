const runtimeStyle=document.createElement('link');
runtimeStyle.rel='stylesheet';
runtimeStyle.href='/v5-extra.css?v=20260822-hardening-v6';
document.head.appendChild(runtimeStyle);

globalThis.__CLAIM_V6_LOADER__=true;

const loginUser=document.getElementById('loginUsername');
if(loginUser){loginUser.value='';loginUser.placeholder='กรอก Username หรือรหัสพนักงาน';loginUser.autocomplete='username';loginUser.removeAttribute('value');}
const loginPass=document.getElementById('loginPassword');
if(loginPass){loginPass.value='';loginPass.placeholder='กรอกรหัสผ่าน';loginPass.autocomplete='current-password';}

const buildNode=document.getElementById('loginBuild');
if(buildNode){
  const holder=buildNode.parentElement;
  if(holder?.firstChild)holder.firstChild.textContent='System ';
  buildNode.textContent='กำลังเชื่อมต่อ…';
}

function loadClassic(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.async=false;
    s.onload=resolve;
    s.onerror=()=>reject(new Error(`Load failed: ${src}`));
    document.head.appendChild(s);
  });
}

try{
  await loadClassic('/app-core-v5.js?v=20260822-hardening-v6');
  await loadClassic('/claim-workspace-v5.js?v=20260822-hardening-v6');
  await loadClassic('/admin-v5.js?v=20260822-hardening-v6');
  if(document.readyState!=='loading' && typeof globalThis.init==='function')globalThis.init();
}catch(error){
  console.error('Claim Center runtime bootstrap failed',error);
  if(buildNode){buildNode.textContent='ระบบโหลดไม่สมบูรณ์';buildNode.style.color='#e44b60';}
  const button=document.querySelector('.login-btn');
  if(button){button.disabled=true;const label=button.querySelector('span');if(label)label.textContent='ระบบยังไม่พร้อมใช้งาน';}
}
