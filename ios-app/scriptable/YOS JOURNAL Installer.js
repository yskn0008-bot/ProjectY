// YOS GitHub Scriptable Installer v1
// Installs YOS JOURNAL from GitHub; prompts for its Scriptable name.
// Never overwrites an existing script.
const raw="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/YOS%20JOURNAL.js";
const fm=FileManager.local(),dir=fm.documentsDirectory();
const prompt=new Alert();prompt.title="YOS JOURNAL 導入";prompt.message="Scriptableに表示する名前を入力。既存の同名スクリプトは上書きしません。";prompt.addTextField("名前","YOS JOURNAL");prompt.addAction("登録");prompt.addCancelAction("キャンセル");
if(await prompt.presentAlert()===-1){Script.complete();}else{
const name=prompt.textFieldValue(0).trim();
if(!name||name.length>50||/[\\/:*?"<>|]/.test(name)||name==="."||name==="..")throw Error("使用できない名前です");
const target=fm.joinPath(dir,name+".js");
if(fm.fileExists(target))throw Error("「"+name+"」は既にあります。別名にするか既存を保持してください。");
const req=new Request(raw);const code=await req.loadString();
if(req.response?.statusCode!==200||!/YOS JOURNAL v1\\.[3-9]/.test(code)||!code.includes("WebView"))throw Error("GitHub取得検証に失敗しました。保存は行っていません。");
fm.writeString(target,code);
if(fm.readString(target)!==code)throw Error("保存後の読戻しに失敗しました");
const done=new Alert();done.title="Scriptable登録完了";done.message="「"+name+"」を登録しました。Scriptable一覧に表示されます。\n※ショートカットと通知の設定は別途必要です。";done.addAction("OK");await done.presentAlert();
Script.complete();
}
