const style=document.createElement('link');style.rel='stylesheet';style.href='/v5-extra.css?v=20260822-v5';document.head.appendChild(style);
const files=['/app-core-v5.js?v=20260822-v5','/claim-workspace-v5.js?v=20260822-v5','/admin-v5.js?v=20260822-v5'];
const parts=await Promise.all(files.map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`Load failed: ${url}`);return r.text();}));
(0,eval)(parts.join('\n\n'));
