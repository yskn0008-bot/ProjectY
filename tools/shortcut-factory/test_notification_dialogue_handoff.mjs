import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const code=fs.readFileSync(new URL('./notification_dialogue_handoff.js',import.meta.url),'utf8');
const files=new Map(),sent=[];let idx=0,now=Date.now();
const fm={documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),createDirectory:p=>files.set(p,''),writeString:(p,s)=>files.set(p,s),readString:p=>files.get(p)};
async function run(mode,input,fail=false){let output;class N{async schedule(){if(fail)throw Error('fail');sent.push(this);}}
 const c={FileManager:{local:()=>fm},args:{shortcutParameter:input},UUID:{string:()=> (++idx).toString(16).padStart(32,'0')},Notification:N,Script:{setShortcutOutput:x=>output=x,complete:()=>{}},Date:{now:()=>now}};
 await vm.runInNewContext('(async()=>{const MODE='+JSON.stringify(mode)+';'+code+'})()',c);return output;}
assert.match(await run('dispatch','YOS_SILENT advert'),/^YOS_NOTIFY_SKIP/);
assert.match(await run('dispatch',''),/^YOS_NOTIFY_SKIP/);assert.equal(sent.length,0);
assert.match(await run('dispatch','YOS_ALERT\nprivate example'),/^YOS_NOTIFY_OK/);assert.equal(sent.length,1);assert.equal(sent[0].body,'確認事項があります。');assert.ok(!sent[0].openURL.includes('private'));
let id=new URL(sent[0].openURL).searchParams.get('text');assert.match(await run('resolve',id),/private example/);
assert.match(await run('resolve','YOS_NOTICE_V1:../../x'),/未取得/);
assert.match(await run('dispatch','YOS_ALERT\nother'),/^YOS_NOTIFY_OK/);assert.equal(sent.length,2);assert.match(await run('resolve',id),/private example/);
assert.match(await run('dispatch','YOS_ALERT\nfailed',true),/^YOS_NOTIFY_ERROR/);
now+=8*86400000;assert.match(await run('resolve',id),/期限切れ/);
assert.equal(await run('resolve','ordinary text'),'ordinary text');
console.log('PASS: SILENT, empty, private body, opaque URL, exact lookup, traversal, two independent IDs, failed schedule, expiry, manual input');
