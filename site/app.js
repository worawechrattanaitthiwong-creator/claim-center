const runtimeStyle=document.createElement('link');
runtimeStyle.rel='stylesheet';
runtimeStyle.href='/v5-extra.css?v=20260822-v5-runtimefix3';
document.head.appendChild(runtimeStyle);

// Keep the sign-in surface neutral and professional. Never expose a real account as sample data.
const loginUser=document.getElementById('loginUsername');
if(loginUser){
  loginUser.value='';
  loginUser.placeholder='กรอก Username หรือรหัสพนักงาน';
  loginUser.autocomplete='off';
  loginUser.setAttribute('name','claim_login_identity');
  loginUser.removeAttribute('value');
}
const loginPass=document.getElementById('loginPassword');
if(loginPass){
  loginPass.value='';
  loginPass.placeholder='กรอกรหัสผ่าน';
  loginPass.autocomplete='off';
  loginPass.setAttribute('name','claim_login_password');
}

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
    }else if(value && value!=='checking…' && value!=='กำลังเชื่อมต่อ…' && value!=='ไม่สามารถเชื่อมต่อระบบ' && value!=='ระบบโหลดไม่สมบูรณ์'){
      buildNode.textContent='พร้อมใช้งาน';
      buildNode.style.color='#1ca676';
    }
  }).observe(buildNode,{childList:true,characterData:true,subtree:true});
}

const files=[
  '/app-core-v5.js?v=20260822-v5-runtimefix3',
  '/claim-workspace-v5.js?v=20260822-v5-runtimefix3',
  '/admin-v5.js?v=20260822-v5-runtimefix3'
];

try{
  const parts=await Promise.all(files.map(async url=>{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error(`Load failed: ${url} (${r.status})`);
    return r.text();
  }));

  // app-core already registered DOMContentLoaded in the original source. Remove that
  // registration and bootstrap inside the same global-eval scope so init() is always
  // reachable even in Android custom tabs/WebViews where eval declarations are not
  // consistently exposed as properties on globalThis.
  const runtime=parts.join('\n\n').replace("document.addEventListener('DOMContentLoaded',init);",'');
  const boot=`\n;(()=>{\n  const start=()=>{\n    if(globalThis.__CLAIM_V5_STARTED__) return;\n    globalThis.__CLAIM_V5_STARTED__=true;\n    Promise.resolve(init()).catch(error=>{\n      console.error('Claim Center init failed',error);\n      const node=document.getElementById('loginBuild');\n      if(node){node.textContent='ระบบเชื่อมต่อไม่สำเร็จ';node.style.color='#e44b60';}\n      const btn=document.querySelector('.login-btn');\n      if(btn) btn.disabled=false;\n    });\n  };\n  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});\n  else queueMicrotask(start);\n})();`;
  (0,eval)(runtime+boot);
}catch(error){
  console.error('Claim Center runtime bootstrap failed',error);
  if(buildNode){
    buildNode.textContent='ระบบโหลดไม่สมบูรณ์';
    buildNode.style.color='#e44b60';
  }
  const button=document.querySelector('.login-btn');
  if(button){
    button.disabled=true;
    const label=button.querySelector('span');
    if(label)label.textContent='ระบบยังไม่พร้อมใช้งาน';
  }
}
