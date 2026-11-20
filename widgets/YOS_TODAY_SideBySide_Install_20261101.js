// YOS Today side-by-side trial installer. Never changes existing scripts.
(async function () {
  const name = "YOS Today 改善版テスト.js";
  const url = "https://raw.githubusercontent.com/yskn0008-bot/ProjectY/32408ee4023fe39c9e6cfa91649028ae07d8b2b0/widgets/YOS_TODAY_TOMORROW_Widget_v1.js";
  const expectedHash = "f3602365";
  const fm = FileManager.iCloud();
  const path = fm.joinPath(fm.documentsDirectory(), name);
  const hash = str => {
    let n=2166136261>>>0;
    for (let i=0;i<str.length;i++) {
      n^=str.charCodeAt(i);
      n=Math.imul(n,16777619)>>>0;
    }
    return n.toString(16).padStart(8,"0");
  };
  const notice = async (title,message) => {
    const alert = new Alert();
    alert.title=title; alert.message=message; alert.addAction("OK");
    await alert.presentAlert();
  };
  if (fm.fileExists(path)) {
    if (fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path);
    const existing = fm.readString(path);
    await notice(hash(existing)===expectedHash ? "改善版は導入済み" : "同名のファイルを保護しました",
      hash(existing)===expectedHash
        ? "Scriptable一覧で「YOS Today 改善版テスト」を実行してください。"
        : "同名のスクリプトが既にあるため上書きしませんでした。");
    return;
  }
  const req = new Request(url); req.timeoutInterval=20;
  let text;
  try { text=await req.loadString(); }
  catch(e) {
    await notice("取得できませんでした","通信ができません。既存スクリプトは一切変更していません。");
    return;
  }
  if (Number(req.response && req.response.statusCode)!==200 ||
      hash(text)!==expectedHash ||
      !text.startsWith("// YOS TODAY / TOMORROW v1") ||
      !text.includes("async function presentLifeBoard()") ||
      !text.includes("Script.setWidget(widget)")) {
    await notice("安全検査で停止","取得した改善版が検証済みコードと一致しません。既存スクリプトは無変更です。");
    return;
  }
  try {
    fm.writeString(path,text);
    if(hash(fm.readString(path))!==expectedHash) {
      fm.remove(path);
      throw new Error("Readback mismatch");
    }
  } catch(e) {
    await notice("保存できませんでした","新しいテスト版の保存を検証できませんでした。既存スクリプトは無変更です。");
    return;
  }
  await notice("改善版を追加しました","Scriptableの一覧から「YOS Today 改善版テスト」を開いて実行してください。前回のYOS TODAYは変更していません。");
})();