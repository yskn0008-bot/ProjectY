// Variables used by Scriptable.
// icon-color: blue; icon-glyph: arrow-down-circle;
// YOS Timeline Installer v1.3 — one-time safe install with duplicate-name recovery.
const raw="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/ios-app/scriptable/YOS%20Timeline%20Auto.js";
const local=FileManager.local();
let cloud=null;
try{cloud=FileManager.iCloud()}catch{}
const fm=cloud||local,dir=fm.documentsDirectory();
const prompt=new Alert();
prompt.title="YOS Timeline 導入";
prompt.message="初回登録用です。登録後はインストーラーではなく登録されたスクリプトを起動してください。既存のファイルは上書きしません。";
prompt.addTextField("登録名","YOS Timeline Auto");
prompt.addAction("登録");
prompt.addCancelAction("中止");
if(await prompt.presentAlert()!==-1){
  const name=prompt.textFieldValue(0).trim();
  if(!name||name.length>50||/[\\/:*?"<>|]/.test(name)||name==="."||name==="..")throw Error("使用できない名前です");
  const filename=name+".js",target=fm.joinPath(dir,filename);
  const existing=[local,cloud].filter(Boolean).some(storage=>storage.fileExists(storage.joinPath(storage.documentsDirectory(),filename)));
  if(existing){
    const notice=new Alert();
    notice.title="同じ名前のスクリプトがあります";
    notice.message="「"+name+"」が既にあります。上書きはしていません。\nこの導入器は初回だけ使います。既存のスクリプトを開いて確認してください。別名で登録する場合は、導入器を再実行して別の名前を入力してください。";
    notice.addAction("既存を開く");
    notice.addCancelAction("閉じる");
    if(await notice.presentAlert()===0)Safari.open("scriptable:///open/"+encodeURIComponent(name));
  }else{
    const req=new Request(raw),src=await req.loadString();
    if(req.response?.statusCode!==200||!src.startsWith("// Variables used by Scriptable.\n")||!/^\/\/ YOS Timeline Auto v1\.\d+(?:\.\d+)?\b/m.test(src)||!src.includes("WebView"))throw Error("GitHubからの取得検証に失敗");
    fm.writeString(target,src);
    if(fm.readString(target)!==src)throw Error("保存後の確認に失敗");
    const done=new Alert();
    done.title="登録完了";
    done.message="「"+name+"」を登録しました。次回からは導入器ではなく、このスクリプトを起動してください。";
    done.addAction("OK");
    await done.presentAlert();
  }
}
Script.complete();
