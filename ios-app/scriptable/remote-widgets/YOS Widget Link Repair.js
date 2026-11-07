// YOS Widget Link Repair v1.0.
// Target ONLY the self-run URLs of the existing light/AC Scriptable widgets.
// Leave existing remote scripts, H110 Keychain and all other scripts untouched.
// A local JSON backup is kept before any changes; failure tries to restore.
const TARGETS = [
  { kind:'light', names:['照明ウィジェット.js','YOS Light Widget.js'], marker:'tapo.fireFriendly(' },
  { kind:'ac', names:['エアコンウィジェット.js','YOS AC Widget.js'], marker:'getClientAndState()' }
];
const SELF_RUN = `function runURL(action){
  return "scriptable:///run?scriptName="+encodeURIComponent(Script.name())+
    "&action="+encodeURIComponent(action);
}
`;
function corrected(source,target){
  if(!source.includes(target.marker))throw Error(target.kind+': expected widget contract missing');
  const start=source.indexOf('function runURL(action){');
  const end=source.indexOf('function remoteURL(){',start);
  if(start<0||end<start)throw Error(target.kind+': URL action boundary missing');
  return source.slice(0,start)+SELF_RUN+source.slice(end);
}
async function repairWidgets() {
  const managerList = [FileManager.iCloud(),FileManager.local()];
  const patches=[],present=new Set();
  for(const m of managerList){
    const docs=m.documentsDirectory();
    for(const target of TARGETS){
      for(const name of target.names){
        const path=m.joinPath(docs,name);
        if(!m.fileExists(path))continue;
        if(typeof m.isFileStoredIniCloud==='function'&&m.isFileStoredIniCloud(path))
          await m.downloadFileFromiCloud(path);
        const oldText=m.readString(path);
        const next=corrected(oldText,target);
        present.add(target.kind);
        if(next!==oldText){
          // Parse before touching installed files.
          const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
          new AsyncFunction('args','Script','config','importModule',next);
          patches.push({m,path,kind:target.kind,name,oldText,next});
        }
      }
    }
  }
  const status={updated:[],unchanged:TARGETS.filter(x=>present.has(x.kind)&&!patches.some(p=>p.kind===x.kind)).map(x=>x.kind),
    missing:TARGETS.filter(x=>!present.has(x.kind)).map(x=>x.kind),backup:""};
  if(patches.length===0)return status;
  const local=FileManager.local();
  const backupPath=local.joinPath(local.documentsDirectory(),'YOS_Widget_Link_Backup_'+Date.now()+'.json');
  const backup={type:'YOS_Widget_Link_Backup',createdAt:new Date().toISOString(),
    entries:patches.map(x=>({name:x.name,kind:x.kind,source:x.oldText,
      storage:x.m===managerList[0]?'iCloud':'local'}))};
  local.writeString(backupPath,JSON.stringify(backup));
  if(JSON.parse(local.readString(backupPath)).entries.length!==patches.length)
    throw Error('ウィジェットのバックアップ検証失敗。変更は行っていません');
  status.backup=backupPath;
  const applied=[];
  try{
    for(const p of patches){
      p.m.writeString(p.path,p.next);
      applied.push(p);
      if(!p.m.fileExists(p.path)||p.m.readString(p.path)!==p.next)
        throw Error(p.name+' の書き込み確認失敗');
      status.updated.push(p.name);
    }
    // After writing both scripts, verify the complete set again.
    for(const p of patches)
      if(p.m.readString(p.path)!==p.next)throw Error(p.name+' の最終確認失敗');
  }catch(error){
    const restoreErrors=[];
    for(const p of applied.reverse()){
      try {
        p.m.writeString(p.path,p.oldText);
        if(p.m.readString(p.path)!==p.oldText)throw Error('restore mismatch');
      }catch(e){restoreErrors.push(p.name+': '+String(e));}
    }
    if(restoreErrors.length)throw Error('更新/復旧失敗。バックアップ: '+backupPath+
      ' / '+restoreErrors.join(' / ')+' / 原因: '+String(error));
    throw Error('更新失敗、元に戻しました。'+String(error));
  }
  return status;
}
module.exports={repairWidgets,corrected};
