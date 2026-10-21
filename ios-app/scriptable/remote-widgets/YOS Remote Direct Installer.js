// YOS Remote Direct Installer v1.0
// Installs two new scripts. Does not overwrite existing remote or shortcuts.
const base="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/765e5103504f1901c7d3c01e5d14584927efe16d/ios-app/scriptable/remote-widgets/";
const names=["YOS BRAVIA Smart Power.js","YOS Remote Direct Actions.js"];
const fm=FileManager.local(),dir=fm.documentsDirectory();
const result=[];
for(const name of names){
 const target=fm.joinPath(dir,name);
 if(fm.fileExists(target)){result.push(name+"：既存ファイルを保持");continue}
 const r=new Request(base+encodeURIComponent(name));
 const src=await r.loadString();
 if(r.response?.statusCode!==200||!src.startsWith("// YOS "))throw Error(name+" の取得失敗");
 fm.writeString(target,src);
 result.push(name+"：追加");
}
const a=new Alert();a.title="YOS Remote 導入結果";a.message=result.join("\n");a.addAction("OK");await a.presentAlert();
Script.complete();