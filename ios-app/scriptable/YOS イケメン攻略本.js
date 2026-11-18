// Variables used by Scriptable.
// icon-color: deep-gray; icon-glyph: book-open;
// YOS_SCRIPT_NAME: YOS イケメン攻略本
// YOS Scriptable offline magazine reader — personal HTML stays on this iPhone.
// Distribution: generic launcher only. Never upload user photos or HTML to GitHub.
const NAME='YOS イケメン攻略本';
const DATA_DIR='YOS Ikemen Guide';
const HTML_NAME='magazine.html';
const STATE_NAME='reading-state.json';
const RUNTIME_NAME='magazine-runtime.html';
const PHOTO_NAMES=['yos-ikemen-photo-1-v3.jpg','yos-ikemen-photo-2-v3.jpg','yos-ikemen-photo-3-v3.jpg'];
const DIAG_NAME='v3-display-confirmed.txt';
const VERSION='v3 / 2026-11-18';
const READER_KEY='YOS_IKEMEN_EDITORIAL_V1';
const fm=FileManager.local();
const folder=fm.joinPath(fm.documentsDirectory(),DATA_DIR);
const htmlPath=fm.joinPath(folder,HTML_NAME);
const statePath=fm.joinPath(folder,STATE_NAME);

function ensureDir(){if(!fm.fileExists(folder))fm.createDirectory(folder,true);}
async function showMessage(title,msg){const a=new Alert();a.title=title;a.message=msg;a.addAction('閉じる');await a.presentAlert();}
async function decision(title,msg,action,cancel='キャンセル'){
 const a=new Alert();a.title=title;a.message=msg;a.addAction(action);a.addCancelAction(cancel);
 return (await a.presentAlert())===0;
}
function validateHTML(html){
 if(typeof html!=='string'||html.length<200000||html.length>6000000)throw Error('攻略本データの大きさが想定と異なります');
 if(!html.includes('YOS_IKEMEN_EDITORIAL_V1')||!html.includes('id="p-0"')||!html.includes('id="p-47"')||!html.includes('</html>'))throw Error('この攻略本のHTMLではありません');
 const pages=(html.match(/<section id="p-\d+" class="sheet/g)||[]).length;
 if(pages!==48)throw Error('48ページが揃っていません（'+pages+'ページ）');
 if((html.match(/data:image\/jpeg;base64,/g)||[]).length<3)throw Error('本人写真が揃った版を選んでください');
 return html;
}
function validateState(value){
 const clean={last:0,seen:[],saved:[],done:[]};
 if(!value||typeof value!=='object'||Array.isArray(value))return clean;
 const bounded=v=>Array.isArray(v)?[...new Set(v.filter(n=>Number.isInteger(n)&&n>=0&&n<48))].slice(0,48):[];
 clean.last=Number.isInteger(value.last)&&value.last>=0&&value.last<48?value.last:0;
 for(const k of ['seen','saved','done'])clean[k]=bounded(value[k]);
 return clean;
}
function readState(){
 try{if(fm.fileExists(statePath))return validateState(JSON.parse(fm.readString(statePath)))}catch(e){console.warn('reading state unavailable: '+e)}
 return validateState(null);
}
function storeChecked(path,body){fm.writeString(path,body);if(fm.readString(path)!==body)throw Error('保存後の照合に失敗しました');}
async function pickHTML(){
 let chosen=null;
 try{chosen=await DocumentPicker.openFile()}catch(e){console.warn('file picker cancelled/unavailable: '+e);return false;}
 if(Array.isArray(chosen))chosen=chosen[0];
 if(typeof chosen!=='string'||!chosen)return false;
 if(!/\.html?$/i.test(chosen))throw Error('拡張子 .html のファイルを選んでください');
 let data=null,readError=null;
 try{data=fm.readString(chosen)}catch(e){readError=e;}
 if(data===null||data===undefined){
  try{const cloud=FileManager.iCloud();await cloud.downloadFileFromiCloud(chosen);data=cloud.readString(chosen);}catch(e){throw Error('選択したHTMLを読み取れませんでした（'+String(readError||e)+'）')}
 }
 validateHTML(data);
 ensureDir();
 // Never replace a working magazine without confirmation and recoverable backup.
 const isUpdate=fm.fileExists(htmlPath);
 let backup=null;
 if(isUpdate){
  if(!(await decision('攻略本の更新','既存の48ページ版を新しく選んだ版へ更新します。元のHTMLはバックアップし、実践記録は引き継ぎます。','バックアップして更新')))return false;
  backup=fm.joinPath(folder,'magazine-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.html');
  if(fm.fileExists(backup))throw Error('同名バックアップが存在します。変更せず停止しました');
  fm.copy(htmlPath,backup);
  if(fm.readString(backup)!==fm.readString(htmlPath))throw Error('旧版バックアップ照合に失敗しました');
 }
 try{storeChecked(htmlPath,data)}catch(e){
  if(backup&&fm.fileExists(backup))storeChecked(htmlPath,fm.readString(backup));
  throw e;
 }
 return true;
}
function injectedHTML(html,state){
 const stateValue=JSON.stringify(JSON.stringify(validateState(state)));
 const marker='const KEY=\'YOS_IKEMEN_EDITORIAL_V1\';';
 if(!html.includes(marker))throw Error('元のページ制御が見つかりません');
 const readMarker='JSON.parse(localStorage.getItem(KEY))';
 if(!html.includes(readMarker))throw Error('読書記録の読込処理を確認できません');
 const persistMarker='function persist(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}}';
 if(!html.includes(persistMarker))throw Error('読書記録の通知処理を確認できません');
 const exportMarker="setPage(location.hash?indexOfHash():data.last||0,!location.hash);\n</script>";
 if(!html.includes(exportMarker))throw Error('読書記録の保存処理を確認できません');
 return html.replace(marker,'window.__YOS_NATIVE_STATE__='+stateValue+';\n'+marker)
  .replace(readMarker,'JSON.parse(window.__YOS_NATIVE_STATE__ || localStorage.getItem(KEY))')
  .replace(persistMarker,"function persist(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}window.__YOS_PENDING_NATIVE_STATE__=JSON.stringify(data);document.dispatchEvent(new Event('yos-native-state'))}")
  .replace(exportMarker,"setPage(location.hash?indexOfHash():data.last||0,!location.hash);\nwindow.__YOS_EXPORT_DATA__=()=>JSON.stringify(data);\n</script>");
}
// Keep private photographs on this device as separate JPEG files. The 48-page
// HTML becomes ~70 KB rather than ~1.8 MB and can be loaded as a local document.
function lightweightHTML(html){
 let count=0;
 const slim=html.replace(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g,(whole,base64)=>{
  if(count>=PHOTO_NAMES.length||base64.length<100000)throw Error('写真データの整合性エラー');
  const name=PHOTO_NAMES[count++],path=fm.joinPath(folder,name);
  const fresh=Data.fromBase64String(base64);
  if(!fresh)throw Error('写真を読み込めませんでした');
  if(fm.fileExists(path)){
   const current=fm.read(path);
   if(!current||current.toBase64String()!==base64)throw Error('写真の保存先に別の内容があります。上書きせず停止しました：'+name);
  }else{
   fm.write(path,fresh);
   if(!fm.fileExists(path)||fm.read(path)?.toBase64String()!==base64){
    throw Error('写真ファイルの保存・照合に失敗しました：'+name);
   }
  }
  return './'+name;
 });
 if(count!==PHOTO_NAMES.length||slim.length>150000||slim.length<30000)throw Error('写真分離後のHTMLが不正です');
 return slim;
}
// Distinguish a real WebView document from a blank native preview. Always keep
// the original magazine, existing photos, and reading-state untouched on error.
async function verifyWebView(web){
 let timer=null;
 try{
  const check=web.evaluateJavaScript(`JSON.stringify({pages:document.querySelectorAll('section.sheet').length,hasCover:!!document.querySelector('#p-0'),body:document.body?.offsetHeight||0,title:document.title})`,false);
  const timeout=new Promise(resolve=>{timer=Timer.schedule(6000,false,()=>resolve(null))});
  const raw=await Promise.race([check,timeout]);
  if(!raw)throw Error('画面の内容を6秒以内に確認できませんでした（WebViewが応答していません）');
  const o=typeof raw==='string'?JSON.parse(raw):raw;
  if(o.pages!==48||!o.hasCover||o.body<50)throw Error('画面の構築に失敗しました（page='+o.pages+', body='+o.body+'）');
  return o;
 }finally{if(timer)timer.invalidate()}
}
function saveState(raw){
 if(typeof raw!=='string'||raw.length>20000)throw Error('保存データが不正です');
 const next=validateState(JSON.parse(raw));
 ensureDir();const text=JSON.stringify(next);
 const temp=fm.joinPath(folder,'.reading-state-pending.json');
 const previous=fm.fileExists(statePath)?fm.readString(statePath):null;
 storeChecked(temp,text);
 try{storeChecked(statePath,text)}catch(e){
  if(previous!==null)storeChecked(statePath,previous);
  else if(fm.fileExists(statePath))fm.remove(statePath);
  throw e;
 }
 if(fm.fileExists(temp))fm.remove(temp);
}
function captureNext(web){
 // This listener is installed while the magazine is visible. The page keeps
 // the newest snapshot pending, so rapid taps do not lose updates between polls.
 return web.evaluateJavaScript(`(function(){
   const send=()=>{
     const raw=window.__YOS_PENDING_NATIVE_STATE__;
     if(!raw)return;
     window.__YOS_PENDING_NATIVE_STATE__=null;
     document.removeEventListener('yos-native-state',send);
     completion(raw);
   };
   document.addEventListener('yos-native-state',send);
   send();
 })();`,true);
}
async function launch(){
 const original=validateHTML(fm.readString(htmlPath));
 const before=readState();
 const runtimePath=fm.joinPath(folder,RUNTIME_NAME);
 // Load the large photo-rich document from the private file system. Passing its
 // 1.8 MB HTML as a string through a Shortcuts WebView may leave a blank view.
 // This generated copy is never sent to GitHub or an external web service.
 const ready=lightweightHTML(injectedHTML(original,before));
 storeChecked(runtimePath,ready);
 if(!fm.fileExists(runtimePath)||fm.readString(runtimePath)!==ready)
  throw Error('表示用ファイルの準備・照合に失敗しました');
 const web=new WebView();
 await web.loadFile(runtimePath);
 const check=await verifyWebView(web);
 // A single native confirmation identifies whether the new code is actually
 // running on the device. The previous versions displayed a black WebView.
 const diag=fm.joinPath(folder,DIAG_NAME);
 if(!fm.fileExists(diag)){
  await showMessage('攻略本 '+VERSION+' 検証',
   'Scriptableの修正版が起動しました。\n48ページを検出。写真3枚は端末内に保存済み。\n今から攻略本を表示します。');
  storeChecked(diag,VERSION);
 }
 // The WebView can be discarded when dismissed; capture updates while visible.
 const dismissed=web.present(true).then(()=>({kind:'dismissed'}),e=>({kind:'dismissed',error:String(e)}));
 let saved=false,bridgeError=null;
 for(;;){
  const change=captureNext(web).then(value=>({kind:'change',value}),e=>({kind:'bridge-error',error:String(e)}));
  const result=await Promise.race([dismissed,change]);
  if(result.kind==='dismissed')break;
  if(result.kind==='bridge-error'){bridgeError=result.error;break;}
  try{saveState(result.value);saved=true}
  catch(e){bridgeError=String(e);break}
 }
 if(bridgeError){
  // The reader stays available but its last native checkpoint may be stale.
  await dismissed;
  await showMessage('読書記録の保存は未確認','攻略本を閉じましたが、一部の記録をiPhoneへ保存できませんでした。\n'+bridgeError);
 }
 if(!saved&&!bridgeError){
  // No checkpoint event is expected only if the user closed extremely quickly.
  // An existing saved state is kept and never reset.
  console.warn('No native checkpoint received; existing state preserved');
 }
}
async function main(){
 // Shortcuts may host the reader inside a memory-limited extension. Transfer
 // execution to the installed Scriptable app before loading embedded photos.
 if(typeof config!=='undefined'&&config.runsInApp===false){
  try{Safari.open('scriptable:///run/'+encodeURIComponent(NAME));}
  catch(e){await showMessage('Scriptableアプリで開いてください','ショートカット内では写真付きの画面を表示できない場合があります。Scriptableアプリを開き「'+NAME+'」を実行してください。\n'+String(e));}
  return;
 }
 ensureDir();
 if(!fm.fileExists(htmlPath)){
  const ok=await decision('イケメン攻略本｜初回設定','写真入り48ページのHTMLを、iPhoneの「ファイル」から1度だけ選びます。取り込んだ内容はこのiPhone内で保存し、公開しません。','HTMLを選ぶ');
  if(!ok)return;
  if(!(await pickHTML()))return;
 }else if(args?.queryParameters?.action==='update'){
  if(!(await pickHTML()))return;
 }
 await launch();
}
try{await main()}catch(e){await showMessage('イケメン攻略本 '+VERSION+'｜未完了',String(e).replace(/^Error:\s*/,''))}
Script.complete();
