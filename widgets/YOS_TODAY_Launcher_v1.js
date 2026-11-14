// YOS TODAY / TOMORROW launcher v1 — automatic safe updater + last-known-good fallback.
// Visible Scriptable entry point. Runtime stays in local cache.
// Updates are read from ProjectY/main only; no Notion secret is stored on iPhone.
(async function () {
  const UPDATE_URL = "https://raw.githubusercontent.com/yskn0008-bot/ProjectY/main/widgets/YOS_TODAY_TOMORROW_Widget_v1.js";
  const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
  const fm = FileManager.local();
  const root = fm.joinPath(fm.documentsDirectory(), "YOS");
  if (!fm.fileExists(root)) fm.createDirectory(root, true);
  const corePath = fm.joinPath(root, "yos-today-tomorrow-core.js");
  const metaPath = fm.joinPath(root, "yos-today-tomorrow-update.json");

  function valid(source) {
    if (typeof source !== "string") return false;
    if (!source.startsWith("// YOS TODAY / TOMORROW v1")) return false;
    if (!source.includes("Script.setWidget(widget)")) return false;
    try {
      new Function(source);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readCore() {
    try {
      if (!fm.fileExists(corePath)) return null;
      const source = fm.readString(corePath);
      return valid(source) ? source : null;
    } catch (_) {
      return null;
    }
  }

  function lastCheckedAt() {
    try {
      if (!fm.fileExists(metaPath)) return 0;
      const data = JSON.parse(fm.readString(metaPath));
      return Number(data && data.lastCheckedAt) || 0;
    } catch (_) {
      return 0;
    }
  }

  function markChecked(status) {
    try {
      fm.writeString(metaPath, JSON.stringify({
        lastCheckedAt: Date.now(),
        status: String(status || "unknown")
      }));
    } catch (_) {}
  }

  let core = readCore();
  const due = !core || !config.runsInWidget || (Date.now() - lastCheckedAt() >= CHECK_EVERY_MS);

  if (due) {
    try {
      const req = new Request(UPDATE_URL);
      req.timeoutInterval = 12;
      const remote = await req.loadString();
      const status = Number(req.response && req.response.statusCode);
      if (status === 200 && valid(remote)) {
        if (remote !== core) fm.writeString(corePath, remote);
        core = remote;
        markChecked("ok");
      } else {
        markChecked("invalid_or_unavailable");
      }
    } catch (_) {
      markChecked("network_error");
    }
  }

  if (!core) core = readCore();
  if (!core) {
    throw new Error("YOS TODAYの実行コードを取得できません。通信後にもう一度実行してください。");
  }

  await eval(core);
})();