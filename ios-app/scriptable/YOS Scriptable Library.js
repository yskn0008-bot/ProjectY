// YOS Scriptable Library v0.1 — read-only catalog and safe GitHub installer.
// Scriptable does not expose native search/folders; this provides a separate catalog.
// No script is renamed, moved, overwritten or deleted.
const fm=FileManager.local(), root=fm.documentsDirectory();
const META="YOS Scriptable Library Catalog.json";
const categories=["通知","Money","Health","Self","Life","Work","STREAM","リモコン","その他"];
function clean(s){return String(s||"").trim();}
function safeName(s){const n=clean(s).replace(/\.js$/i,"");if(!n||/[\\/:*?"<>|\r\n]/.test(n)||n==="."||n==="..")throw Error("使用できない名前");return n;}
function path(n){return fm.joinPath(root,n);}
function load(){try{return JSON.parse(fm.readString(path(META)));}catch(_){return {};}}
function save(x){fm.writeString(path(META),JSON.stringify(x,null,2));}
function list(){return fm.listContents(root).filter(n=>n.endsWith(".js")).sort((a,b)=>a.localeCompare(b,"ja"));}
function info(n,meta){let head="";try{head=fm.readString(path(n)).split("\n").slice(0,8).filter(x=>/^\s*\/\//.test(x)).map(x=>x.replace(/^\s*\/\/\s*/,"")).filter(x=>!x.startsWith("Variables used")).slice(0,2).join(" / ");}catch(_){}return {name:n,category:meta[n]?.category||"その他",description:meta[n]?.description||head||"説明未登録"};}
async function menu(title,items){const a=new Alert();a.title=title;items.forEach(x=>a.addAction(x));a.addCancelAction("閉じる");const i=await a.presentSheet();return i<0?null:i;}
async function edit(n,meta){const a=new Alert();a.title=n;a.addTextField("機能説明",meta[n]?.description||"");a.addTextField("分類",meta[n]?.category||"その他");a.addAction("保存");a.addCancelAction("戻る");if(await a.presentAlert()<0)return;const d=clean(a.textFieldValue(0)),c=clean(a.textFieldValue(1));meta[n]={description:d,category:categories.includes(c)?c:"その他"};save(meta);}
async function install(meta){
 const a=new Alert();a.title="GitHubから登録";a.message="GitHubのraw.githubusercontent.comの.js URLのみ対応。既存ファイルは上書きしません。";
 a.addTextField("コードのraw URL","https://raw.githubusercontent.com/");
 a.addTextField("Scriptableに登録する名前","");
 a.addTextField("機能説明","");
 a.addTextField("分類（例：通知）","その他");
 a.addAction("取得して登録");a.addCancelAction("戻る");
 if(await a.presentAlert()<0)return;
 const url=clean(a.textFieldValue(0)),name=safeName(a.textFieldValue(1))+".js",description=clean(a.textFieldValue(2)),category=clean(a.textFieldValue(3));
 if(!/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[\w./%-]+\.js(?:\?[^#]*)?$/.test(url))throw Error("GitHub raw URLを指定してください");
 if(fm.fileExists(path(name)))throw Error("同じ名前が既にあります。上書きしません");
 const req=new Request(url);req.timeoutInterval=20;const code=await req.loadString();
 if(!code||code.length>1000000||/^\s*</.test(code))throw Error("JavaScriptとして取得できませんでした");
 fm.writeString(path(name),code);
 if(fm.readString(path(name))!==code)throw Error("保存検証に失敗");
 meta[name]={description,category:categories.includes(category)?category:"その他",source:url};save(meta);
 const done=new Alert();done.title="登録完了";done.message=name+"\n"+description;done.addAction("OK");await done.present();
}
async function browse(meta,filtered){const items=(filtered||list()).map(n=>info(n,meta));if(!items.length){const a=new Alert();a.title="該当なし";a.addAction("OK");await a.present();return;}
 const i=await menu("スクリプト一覧",items.map(x=>x.name.replace(/\.js$/,"")+"｜"+x.description.slice(0,35)));if(i!==null)await edit(items[i].name,meta);
}
async function main(){const meta=load();const i=await menu("YOS Scriptable Library",["一覧・説明","検索","分類別","GitHubから新規登録"]);if(i===null)return;
 if(i===0)return browse(meta);
 if(i===1){const a=new Alert();a.title="検索";a.addTextField("名前・機能説明・分類");a.addAction("検索");a.addCancelAction("戻る");if(await a.presentAlert()<0)return;const q=clean(a.textFieldValue(0)).toLowerCase();return browse(meta,list().filter(n=>{const x=info(n,meta);return [x.name,x.description,x.category].some(v=>v.toLowerCase().includes(q));}));}
 if(i===2){const j=await menu("分類",categories);if(j!==null)return browse(meta,list().filter(n=>info(n,meta).category===categories[j]));}
 if(i===3)return install(meta);
}
try{await main();}catch(e){const a=new Alert();a.title="処理を中断";a.message=String(e.message||e);a.addAction("OK");await a.present();}
Script.complete();
