// YOS 通知 v0.3 一括更新：更新時だけGitHubから取得（普段の通知には使いません）
// 既存の2本をバックアップしてから置き換えます。ショートカット設定は変更しません。
const BASE='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/feat/yos-notification-v03-20261022/tools/yos-notification/';
const ITEMS=[
 {names:['Notification Bridge.js','YOS Notification Bridge.js'],file:'Notification-Bridge-v0.3.js',mark:'YOS Notification Bridge',hash:'af354605'},
 {names:['Notification Context.js','YOS Notification Context.js'],file:'Notification-Context-v0.3.js',mark:'YOS Notification Context',hash:'28db70dd'}
];
function digest(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
async function message(s){const a=new Alert();a.title='YOS通知アップデート';a.message=s;a.addAction('OK');await a.present()}
const managers=[{fm:FileManager.local(),cloud:false}];
try{managers.push({fm:FileManager.iCloud(),cloud:true})}catch(_){}
try{
 const changes=[];
 for(const item of ITEMS){
   const hits=[];
   for(const site of managers)for(const n of item.names){
     const p=site.fm.joinPath(site.fm.documentsDirectory(),n);
     if(site.fm.fileExists(p))hits.push({fm:site.fm,cloud:site.cloud,path:p});
   }
   if(hits.length!==1)throw Error(item.mark+': 保存先が'+hits.length+'件。安全のため中止');
   const f=hits[0];
   if(f.cloud)await f.fm.downloadFileFromiCloud(f.path);
   f.old=f.fm.readString(f.path);
   if(!f.old?.includes(item.mark))throw Error(item.mark+': 既存コードを識別できず中止');
   const req=new Request(BASE+item.file);req.timeoutInterval=15;
   const source=await req.loadString();
   if(req.response?.statusCode!==200||digest(source)!==item.hash||!source.includes(item.mark)){
     throw Error(item.mark+': 配布コードの検証失敗。変更せず中止');
   }
   f.next=source;changes.push(f);
 }
 const stamp=String(Date.now());
 for(const f of changes){
   f.backup=f.path+'.YOS-'+stamp+'.backup';
   f.fm.writeString(f.backup,f.old);
   if(f.fm.readString(f.backup)!==f.old)throw Error('バックアップに失敗');
 }
 try{
   for(const f of changes){f.fm.writeString(f.path,f.next);if(f.fm.readString(f.path)!==f.next)throw Error('更新後の確認に失敗')}
 }catch(e){
   for(const f of changes){try{f.fm.writeString(f.path,f.old)}catch(_){}}
   throw Error('更新失敗。復元を試みました。'+String(e.message||e));
 }
 await message('更新成功：Bridge / Context v0.3。元コードはバックアップ済み。ショートカットは変更不要。');
}catch(e){await message('未更新：'+String(e.message||e)+'。既存スクリプトは削除しないでください。')}
Script.complete();
