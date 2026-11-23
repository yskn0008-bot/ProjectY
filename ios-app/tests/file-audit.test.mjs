import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../scriptable/YOS ファイル調査.js',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
function fixture({bookmark=true,inApp=false,pickerError=false}={}){
 const calls=[],outputs=[],alerts=[];
 const tree={'/icloud':['Shortcuts','Archive','Documents'],'/icloud/Shortcuts':['existing.shortcut'],'/icloud/Archive':['note.pdf'],'/icloud/Documents':['note.pdf','photo.png']};
 const folders=new Set(Object.keys(tree)),files=new Set(['/icloud/Shortcuts/existing.shortcut','/icloud/Archive/note.pdf','/icloud/Documents/note.pdf','/icloud/Documents/photo.png']);
 const fm={bookmarkExists:n=>n==='YOS Files Root'&&bookmark,bookmarkedPath:()=>'/icloud',isDirectory:p=>folders.has(p),joinPath:(a,b)=>a+'/'+b,
  listContents(p){calls.push(['list',p]);if(!folders.has(p))throw Error('unreadable');return tree[p]},
  fileSize(p){calls.push(['size',p]);if(!files.has(p))throw Error('not a file');return p.endsWith('note.pdf')?100:30},
  read(){throw Error('forbidden content read')},readString(){throw Error('forbidden content read')},
  writeString(){throw Error('forbidden write')},move(){throw Error('forbidden move')},remove(){throw Error('forbidden remove')},copy(){throw Error('forbidden copy')},createDirectory(){throw Error('forbidden mkdir')}};
 class Alert{constructor(){this.title='';this.message=''}addAction(){}addCancelAction(){}async presentAlert(){alerts.push(this.title);return alerts.length===1?0:-1}}
 const scope={FileManager:{iCloud:()=>fm,local:()=>fm},config:{runsInApp:inApp},
  DocumentPicker:{async openFolder(){calls.push(['pick']);if(pickerError)throw Error('permission denied');return '/icloud'}},
  Alert,Script:{setShortcutOutput:s=>outputs.push(s),complete(){}},
  ShareSheet:{async present(){}},QuickLook:{async present(){}},Pasteboard:{copyString(){}},Date,console};
 return {calls,outputs,async execute(){await vm.runInNewContext('(async()=>{'+script+'\n})()',scope,{timeout:5000})}};
}
test('catalog pins exact source bytes and canonical name',()=>{
 const e=catalog.targets.find(x=>x.id==='file-audit');assert.ok(e);
 assert.equal(e.name,'YOS ファイル調査');assert.equal(e.path,'ios-app/scriptable/YOS ファイル調査.js');
 assert.match(e.commit,/^[0-9a-f]{40}$/);
 assert.equal(e.sha256,crypto.createHash('sha256').update(script).digest('hex'));
 assert.match(script,/^\/\/ YOS_SCRIPT_NAME: YOS ファイル調査$/m);
});
test('read-only recursive scan reports file metadata and duplicate candidates',async()=>{
 const x=fixture();await x.execute();assert.equal(x.outputs.length,1);
 assert.match(x.outputs[0],/フォルダ: 3 \/ ファイル: 4/);
 assert.match(x.outputs[0],/\[フォルダ\] Shortcuts/);
 assert.match(x.outputs[0],/Archive\/note.pdf｜100KB/);
 assert.match(x.outputs[0],/Archive\/note.pdf \/ Documents\/note.pdf/);
 assert.equal(x.calls.filter(a=>a[0]==='list').length,4);
 assert.equal(x.calls.filter(a=>a[0]==='pick').length,0);
});
test('Siri without bookmark fails closed and shows setup',async()=>{
 const x=fixture({bookmark:false});await x.execute();
 assert.match(x.outputs[0],/YOS ファイル調査：中止/);
 assert.match(x.outputs[0],/Create File Bookmark/);
 assert.equal(x.calls.length,0);
});
test('interactive Scriptable may choose a folder explicitly',async()=>{
 const x=fixture({bookmark:false,inApp:true});await x.execute();
 assert.equal(x.calls.filter(a=>a[0]==='pick').length,1);
 assert.match(x.outputs[0],/フォルダ: 3 \/ ファイル: 4/);
});
test('picker denial never silently scans unrelated folder',async()=>{
 const x=fixture({bookmark:false,inApp:true,pickerError:true});await x.execute();
 assert.match(x.outputs[0],/中止（元ファイル変更なし）/);
 assert.match(x.outputs[0],/permission denied/);
 assert.equal(x.calls.filter(a=>a[0]==='list').length,0);
});