import fs from 'node:fs';
const worker=fs.readFileSync('worker/v7-entry.js','utf8');
const html=fs.readFileSync('site/index.html','utf8');
const app=fs.readFileSync('site/app.js','utf8');
for(const token of ['claim_drafts','reference_reservations','store_cases','case_messages','notifications','toContractRow']) if(!worker.includes(token)) throw new Error('missing V7 worker token '+token);
for(const token of ['Claim Workbench','Store Queue','Export Studio','STORE CLAIM PORTAL']) if(!html.includes(token)) throw new Error('missing V7 UI '+token);
for(const token of ['syncReference','downloadExport','submitStoreCase','createUser']) if(!app.includes(token)) throw new Error('missing V7 app '+token);
console.log('V7 collaboration contract ok');
