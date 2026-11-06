// YOS GitHub Scriptable Installer v1.3
// Installs YOS JOURNAL from GitHub; saves the Scriptable name automatically.
// Never overwrites an existing script.
const raw="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/yos-journal-editorial-v15-20261107/ios-app/scriptable/YOS%20JOURNAL.js";
const fm=FileManager.local(),dir=fm.documentsDirectory();
const names=["YOS JOURNAL","YOS JOURNAL v1.5 テスト"];
const name=names.find(n=>!fm.fileExists(fm.joinPath(dir,n+".js")));
if(!name)throw Error("同名スクリプトが両方あるため、上書きしません。");
const target=fm.joinPath(dir,name+".js");
if(fm.fileExists(target))throw Error("「"+name+"」は既にあります。別名にするか既存を保持してください。");
const req=new Request(raw);const code=await req.loadString();
if(req.response?.statusCode!==200||!code.includes("YOS JOURNAL v1.5")||!code.includes("WebView"))throw Error("GitHub取得検証に失敗しました。保存は行っていません。");
fm.writeString(target,code);
if(fm.readString(target)!==code)throw Error("保存後の読戻しに失敗しました");
const done=new Alert();done.title="Scriptable登録完了";done.message="「"+name+"」として自動保存しました。Scriptable一覧から開けます。既存のスクリプトは上書きしていません。";done.addAction("OK");await done.presentAlert();
Script.complete();
