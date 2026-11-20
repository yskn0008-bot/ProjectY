// YOS Today preview safety upgrade. Updates ONLY the exact previous preview after backup.
// Existing Money, Clarity, Morning/Night, widgets and Notion are never changed here.
(async function () {
  const name = "YOS TODAY・TOMORROW.js";
  const url = "https://raw.githubusercontent.com/yskn0008-bot/ProjectY/32408ee4023fe39c9e6cfa91649028ae07d8b2b0/widgets/YOS_TODAY_TOMORROW_Widget_v1.js";
  const previousHash = "5b5811b7";
  const updatedHash = "f3602365";
  const fm = FileManager.iCloud();
  const dir = fm.documentsDirectory();
  const scriptPath = fm.joinPath(dir, name);
  const backDir = fm.joinPath(dir, "YOS/Today/backups");
  const backPath = fm.joinPath(backDir, "YOS TODAY・TOMORROW-before-20261101.js.txt");
  const hash = data => {
    let h = 2166136261 >>> 0;
    for (let i=0; i<data.length; i++) {
      h ^= data.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const alert = async (title,message) => {
    const box = new Alert(); box.title=title; box.message=message; box.addAction("OK");
    await box.presentAlert();
  };
  if(!fm.fileExists(scriptPath)) {
    await alert("安全のため停止","前回の『YOS TODAY・TOMORROW』が見つかりません。既存のスクリプトは変更していません。");
    return;
  }
  if(fm.isFileStoredIniCloud(scriptPath)) await fm.downloadFileFromiCloud(scriptPath);
  const original = fm.readString(scriptPath);
  if(hash(original) === updatedHash) {
    await alert("更新済み","YOS Todayは改善版です。Scriptableの一覧から開いて確認してください。");
    return;
  }
  if(hash(original) !== previousHash || !original.startsWith("// YOS TODAY / TOMORROW v1")) {
    await alert("安全のため停止","前回のテスト版と内容が異なります。上書きせず停止しました。");
    return;
  }
  const req = new Request(url); req.timeoutInterval=20;
  const updated = await req.loadString();
  if(Number(req.response && req.response.statusCode)!==200 ||
      hash(updated)!==updatedHash || !updated.includes("Script.setWidget(widget)")) {
    await alert("更新できませんでした","配布コードの検査に失敗。前回の版はそのままです。");
    return;
  }
  if(!fm.fileExists(backDir)) fm.createDirectory(backDir, true);
  if(fm.fileExists(backPath)) {
    await alert("安全のため停止","バックアップがすでにあります。上書きしません。");
    return;
  }
  fm.writeString(backPath,original);
  if(hash(fm.readString(backPath))!==previousHash) {
    await alert("安全のため停止","バックアップを検証できませんでした。前回の版はそのままです。");
    return;
  }
  try {
    fm.writeString(scriptPath,updated);
    if(hash(fm.readString(scriptPath))!==updatedHash) throw new Error("Verification failed");
  } catch(e) {
    fm.writeString(scriptPath,original);
    await alert("更新を元に戻しました","保存の検証に失敗したため、前回の版を復元しました。");
    return;
  }
  await alert("YOS Today改善版を反映","前回のテスト版だけを安全に更新しました。Scriptableの一覧から『YOS TODAY・TOMORROW』を実行してね。");
})();