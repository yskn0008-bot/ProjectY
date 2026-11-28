// Local-only notification handoff. No credentials or network requests.
const PREFIX='YOS_NOTICE_V1:';
const NAME='YOS 通知対話 統合版';
const fm=FileManager.local();
const dir=fm.joinPath(fm.documentsDirectory(),'YOS Notification Dialogue');
const input=typeof args.shortcutParameter==='string'?args.shortcutParameter:'';
const legal=/^[a-f0-9]{32}$/i;
const path=id=>fm.joinPath(dir,id+'.json');
function result(v){Script.setShortcutOutput(v);Script.complete();}
async function dispatch(){
 if(!input.trim())return 'YOS_NOTIFY_SKIP: 入力なし';
 if(!/^YOS_ALERT(?:\s|$)/u.test(input))return 'YOS_NOTIFY_SKIP: ALERT以外';
 if(input.length>10000)return 'YOS_NOTIFY_ERROR: 内容が長すぎます';
 if(!fm.fileExists(dir))fm.createDirectory(dir,true);
 // Keep the full private text locally; URL contains only the generated identifier.
 const id=UUID.string().replace(/-/g,'').toLowerCase();
 if(!legal.test(id)||fm.fileExists(path(id)))throw Error('ID_COLLISION');
 const item={id,createdAt:Date.now(),text:input};
 fm.writeString(path(id),JSON.stringify(item));
 const got=JSON.parse(fm.readString(path(id)));
 if(got.id!==id||got.text!==input)throw Error('READBACK');
 const n=new Notification();
 n.identifier='yos-dialogue-'+id;
 n.title='YOS';
 n.body='確認事項があります。';
 n.openURL='shortcuts://run-shortcut?name='+encodeURIComponent(NAME)+'&input=text&text='+encodeURIComponent(PREFIX+id);
 await n.schedule();
 return 'YOS_NOTIFY_OK: '+id;
}
function resolve(){
 if(!input.startsWith(PREFIX))return input||'（通知資料なし）';
 const id=input.slice(PREFIX.length);
 if(!legal.test(id)||!fm.fileExists(path(id)))return '通知資料未取得。対象を推測せず本人に確認すること。';
 const item=JSON.parse(fm.readString(path(id)));
 if(item.id!==id||typeof item.text!=='string'||!Number.isFinite(item.createdAt)||Date.now()-item.createdAt>7*86400000)return '通知資料の有効期限切れまたは不正。対象を推測しないこと。';
 return '通知案件ID: '+id+'\n'+item.text;
}
try{result(MODE==='dispatch'?await dispatch():resolve());}catch(e){result(MODE==='dispatch'?'YOS_NOTIFY_ERROR: 通知を確認できません':'通知資料未取得。対象を推測しないこと。');}
