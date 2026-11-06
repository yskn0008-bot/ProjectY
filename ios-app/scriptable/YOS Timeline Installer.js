// Variables used by Scriptable.
// icon-color: blue; icon-glyph: arrow-down-circle;
// YOS Timeline Installer v0.2 — fetches named Scriptable from GitHub.
const raw="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/YOS%20Timeline.js";
const fm=FileManager.local(),dir=fm.documentsDirectory();
const p=new Alert();p.title="YOS Timeline 導入";p.message="Scriptableに登録する名前を入力してください。既存ファイルは上書きしません。";p.addTextField("登録名","YOS Timeline");p.addAction("登録");p.addCancelAction("中止");
if(await p.presentAlert()!==-1){const name=p.textFieldValue(0).trim();if(!name||name.length>50||/[\\/:*?"<>|]/.test(name)||name==="."||name==="..")throw Error("使用できない名前です");const target=fm.joinPath(dir,name+".js");if(fm.fileExists(target))throw Error("同名のスクリプトが既に存在します。上書きしません。");const req=new Request(raw),src=await req.loadString();if(req.response?.statusCode!==200||!src.includes("YOS Timeline v0.2")||!src.includes("WebView"))throw Error("GitHubからの取得検証に失敗");fm.writeString(target,src);if(fm.readString(target)!==src)throw Error("保存後の確認に失敗");const a=new Alert();a.title="登録完了";a.message="Scriptableに「"+name+"」を登録しました。";a.addAction("OK");await a.presentAlert()}Script.complete();
