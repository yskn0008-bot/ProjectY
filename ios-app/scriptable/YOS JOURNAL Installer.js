// YOS GitHub Scriptable Installer v1.4
// Installs YOS JOURNAL from GitHub; saves the Scriptable name automatically.
// Never overwrites an existing script.
const raw="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/yos-journal-editorial-v15-20261107/ios-app/scriptable/YOS%20JOURNAL.js";
const fm=FileManager.local(),dir=fm.documentsDirectory();
const names=["YOS JOURNAL","YOS JOURNAL v1.5 テスト"];
const installed=names.find(n=>{
 const p=fm.joinPath(dir,n+".js");
 if(!fm.fileExists(p))return false;
 try { const body=fm.readString(p); return body.includes("YOS JOURNAL v1.5")&&body.includes("WebView"); }
 catch(_){return false;}
});
if(installed){
 const done=new Alert();done.title="YOS JOURNAL 導入済み";
 done.message="「"+installed+"」が既にあります。Scriptable一覧でその名前をタップして開いてください。既存版は変更していません。";
 done.addAction("OK");await done.presentAlert();
 Script.complete();
}else{
 const pool=names.concat(Array.from({length:30},(_,i)=>"YOS JOURNAL v1.5 テスト "+(i+2)));
 const name=pool.find(n=>!fm.fileExists(fm.joinPath(dir,n+".js")));
 if(!name)throw Error("保存名の空きがないため上書きせず終了しました。");
 const target=fm.joinPath(dir,name+".js");
const req=new Request(raw);const code=await req.loadString();
if(req.response?.statusCode!==200||!code.includes("YOS JOURNAL v1.5")||!code.includes("WebView"))throw Error("GitHub取得検証に失敗しました。保存は行っていません。");
fm.writeString(target,code);
if(fm.readString(target)!==code)throw Error("保存後の読戻しに失敗しました");
const done=new Alert();done.title="Scriptable登録完了";done.message="「"+name+"」として自動保存しました。Scriptable一覧から開けます。既存のスクリプトは上書きしていません。";done.addAction("OK");await done.presentAlert();
Script.complete();
}
