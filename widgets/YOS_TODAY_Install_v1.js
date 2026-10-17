// Run this once in Scriptable. Installs a pinned, reviewed YOS large widget.
// Does not modify your existing NOW / TODAY scripts.
const name="YOS TODAY・TOMORROW.js";
const url="https://raw.githubusercontent.com/yskn0008-bot/ProjectY/ac7b48374a81c77f1dcdaca2982a6339ee165317/widgets/YOS_TODAY_TOMORROW_Widget_v1.js";
const req=new Request(url);
req.timeoutInterval=20;
const source=await req.loadString();
if(Number(req.response && req.response.statusCode)!==200 ||
   !source.startsWith("// YOS TODAY / TOMORROW v1") ||
   !source.includes("Script.setWidget(widget)")) {
  throw new Error("YOSコードの確認に失敗。既存のスクリプトは変更していません。");
}
const fm=FileManager.iCloud();
const path=fm.joinPath(fm.documentsDirectory(),name);
if(fm.fileExists(path)) {
  throw new Error("同名スクリプトがあります。上書きせず停止しました。");
}
fm.writeString(path,source);
const a=new Alert();
a.title="YOS TODAY を追加しました";
a.message="ホーム画面を長押し → ＋ → Scriptable → 大サイズ → ウィジェットを編集 → Script で「YOS TODAY・TOMORROW」を選択";
a.addAction("OK");
await a.presentAlert();
Script.complete();