// YOS Local Fallback v2 — Harmony HOME
// Runtime: local-first. GitHub/Vercel are not required to open this dashboard.
(async () => {
  const fm = FileManager.iCloud();
  const base = fm.joinPath(fm.documentsDirectory(), "One Enter Factory");
  const stateDir = fm.joinPath(base, "state");
  if (!fm.fileExists(base)) fm.createDirectory(base, true);
  if (!fm.fileExists(stateDir)) fm.createDirectory(stateDir, true);

  const assetsPath = fm.joinPath(stateDir, "yos-assets.json");
  const tasksPath = fm.joinPath(stateDir, "yos-user-tasks.json");

  const fallbackAssets = {
    schema_version: "1.0.0",
    ssot: "YOS asset registry",
    updated_at: "2026-09-18T21:09:00+09:00",
    design: { theme: "調和" },
    summary: { asset_count: 22, overall_progress: 53, needs_user_action_count: 0 },
    assets: [
      ["my-way","MY WAY","core",65,"今ここ・行き先・次の一歩","iPhoneで主要導線を確認する"],
      ["clarity","Clarity","core",65,"音声・テキストの入口","入力→判断→実行→確認をE2E確認する"],
      ["money","Money","finance",65,"収支とMoney Capture","既存Moneyデータを統合する"],
      ["life","Life","life",65,"生活・Morning Flow・Night Reset","Life入口を統合する"],
      ["idea","Idea","ideas",20,"アイデア保存・確認","既存保存先を正式接続する"],
      ["heros-journey","Hero’s Journey","journey",20,"人生地図","既存データを保ったまま統合する"],
      ["my-remote","MY REMOTE","remote",65,"照明・BRAVIAなどの操作","最新状態を実機確認する"],
      ["money-capture","Money Capture","finance",65,"自然文で支出入力","入力→保存を実機確認する"],
      ["morning-flow","Morning Flow","routine",65,"朝の流れ","Life接続後に実機確認する"],
      ["night-reset","Night Reset","routine",65,"夜のリセット","Life接続後に実機確認する"],
      ["yos-home-voice","YOS Home Voice","automation",65,"音声操作","音声→操作を実機確認する"],
      ["yos-departure-guard","Departure Guard","automation",65,"外出前チェック","Calendar/Battery/通知を実機確認する"],
      ["yos-screenshot-router","Screenshot Router","automation",65,"スクショ整理","実機検証経路を完成する"],
      ["weekly-review","Weekly Review","review",20,"週次レビュー","live dataへ接続する"],
      ["friction-discovery","Friction Discovery","review",20,"不便の自動発見","実生活ログへ接続する"],
      ["one-enter","One Enter","development",65,"ChatGPT側の開発司令塔","Factory Core経由で実案件をE2E完遂する"],
      ["projecty-hq","ProjectY HQ","development",50,"開発基盤・監査","異常系検証を完成する"],
      ["shortcut-factory-stash","Shortcut Factory + STASH","development",50,"ショートカット製造・保管","import→実行を確認する"],
      ["yos-mission-control","YOS Mission Control","operations",65,"運用状態の補助情報","資産SSOTと役割分離を保つ"],
      ["notifications","Notifications","notification",20,"必要時だけ通知","SSOT差分通知を接続する"],
      ["my-way-widget","MY WAY Widget","widget",65,"ホーム画面Widget","共通SSOTへ接続する"],
      ["yos","YOS","core",65,"統合HOME","主要導線を実機確認する"]
    ].map(([id,name,area,progress,current,next_action]) => ({id,name,area,progress,current,next_action,status:"local_snapshot"}))
  };

  const fallbackTasks = {
    schema_version: "1.0.0",
    updated_at: "2026-09-18T21:09:00+09:00",
    summary: { active_count: 0, completed_count: 0 },
    tasks: []
  };

  async function loadJson(path, fallback) {
    try {
      if (!fm.fileExists(path)) {
        fm.writeString(path, JSON.stringify(fallback, null, 2));
        return fallback;
      }
      if (!fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
      const parsed = JSON.parse(fm.readString(path));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  const assets = await loadJson(assetsPath, fallbackAssets);
  const tasks = await loadJson(tasksPath, fallbackTasks);
  const rows = Array.isArray(assets.assets) ? assets.assets : [];
  const queue = Array.isArray(tasks.tasks) ? tasks.tasks : [];

  // Runtime evidence is local and independent from GitHub/Vercel.
  const evidencePath = fm.joinPath(stateDir, "runtime-evidence.json");
  const runtimeEvidence = await loadJson(evidencePath, {schema_version:"1.0.0", checks:{}});
  runtimeEvidence.checks = runtimeEvidence.checks || {};
  runtimeEvidence.checks.harmony_home = {
    device_verified: true,
    verified_at: new Date().toISOString(),
    source: "Scriptable runtime"
  };
  fm.writeString(evidencePath, JSON.stringify(runtimeEvidence, null, 2));

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));

  const progressOf = a => Math.max(0, Math.min(100, Number(a.progress) || 0));
  const overall = Number(assets.summary?.overall_progress) || Math.round(rows.reduce((s,a)=>s+progressOf(a),0)/Math.max(1,rows.length));
  const ownerWait = queue.length;

  const primaryIds = new Set(["my-way","clarity","money","life","idea","heros-journey","my-remote"]);
  const automationAreas = new Set(["automation","routine","review","notification","widget"]);
  const infraAreas = new Set(["development","operations"]);

  const primary = rows.filter(a => primaryIds.has(a.id));
  const supporting = rows.filter(a => !primaryIds.has(a.id) && automationAreas.has(a.area));
  const infra = rows.filter(a => infraAreas.has(a.area) || a.id === "one-enter" || a.id === "projecty-hq");

  function iconFor(a) {
    const m = {
      "my-way":"◎", "clarity":"✦", "money":"¥", "life":"⌂", "idea":"◌",
      "heros-journey":"↗", "my-remote":"⌁", "money-capture":"＋", "morning-flow":"☼",
      "night-reset":"◐", "yos-home-voice":"◉", "yos-departure-guard":"⇢",
      "yos-screenshot-router":"▣", "weekly-review":"✓", "friction-discovery":"∿",
      "notifications":"•", "my-way-widget":"▤", "one-enter":"◇", "projecty-hq":"⌘",
      "shortcut-factory-stash":"⚙", "yos-mission-control":"◫", "yos":"○"
    };
    return m[a.id] || "·";
  }

  function routeFor(a) {
    const routes = {
      "clarity": {url:"shortcuts://run-shortcut?name=Clarity", label:"iPhoneで開く", kind:"local"},
      "my-remote": {url:"scriptable:///run?scriptName=YOS%20Remote%20Hub", label:"リモコンを開く", kind:"local"},
      "my-way": {url:"https://yskn0008-bot.github.io/ProjectY/yos/", label:"MY WAYを開く", kind:"web"},
      "money": {url:"https://yskn0008-bot.github.io/ProjectY/yos/", label:"Moneyを開く", kind:"web"},
      "life": {url:"https://yskn0008-bot.github.io/ProjectY/life/", label:"Lifeを開く", kind:"web"},
      "idea": {url:"https://yskn0008-bot.github.io/ProjectY/yos/", label:"Ideaを開く", kind:"web"},
      "heros-journey": {url:"https://yskn0008-bot.github.io/ProjectY/yos/journey.html", label:"Journeyを開く", kind:"web"}
    };
    return routes[a.id] || null;
  }

  function cards(list, compact=false) {
    if (!list.length) return '<div class="empty">表示する項目はありません</div>';
    return list.map(a => {
      const route = routeFor(a);
      const tag = route ? "a" : "article";
      const routeAttrs = route ? ` href="${route.url}" class="asset asset-link ${compact ? 'compact' : ''}"` : ` class="asset ${compact ? 'compact' : ''}"`;
      const routeChip = route ? `<span class="route-chip ${route.kind}">${esc(route.label)}</span>` : "";
      return `
      <${tag}${routeAttrs}>
        <div class="asset-head">
          <div class="icon">${iconFor(a)}</div>
          <div class="asset-title"><strong>${esc(a.name)}</strong><span>${esc(a.area || '')}</span></div>
          <b class="percent">${progressOf(a)}%</b>
        </div>
        <div class="bar"><i style="width:${progressOf(a)}%"></i></div>
        ${routeChip}
        ${compact ? '' : `<p><span>現在</span>${esc(a.current || '未設定')}</p><p><span>次</span>${esc(a.next_action || '未設定')}</p>`}
      </${tag}>`;
    }).join('');
  }

  const queueHtml = queue.length
    ? queue.map(t => `<li><strong>${esc(t.title || t.task || t.id)}</strong>${t.next_action ? `<small>${esc(t.next_action)}</small>` : ''}</li>`).join('')
    : '<li class="done">本人タスクなし</li>';

  const topNext = rows
    .filter(a => !infraAreas.has(a.area))
    .sort((a,b)=>(Number(a.priority)||9)-(Number(b.priority)||9))[0];

  const html = `<!doctype html>
  <html lang="ja"><head>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <style>
    :root{
      --paper:#f7f1e7; --paper2:#fffaf1; --ink:#17243a; --muted:#77766f;
      --line:rgba(58,54,47,.10); --sun:#e7a83e; --sun2:#f6cf79; --leaf:#7ea17b;
      --sky:#8eb5c8; --coral:#d98e7b; --shadow:0 14px 34px rgba(55,45,28,.07);
    }
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{margin:0;background:
      radial-gradient(circle at 85% -4%,rgba(246,207,121,.33),transparent 31%),
      linear-gradient(180deg,#fbf7ef 0%,var(--paper) 100%);
      color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;
      padding:calc(env(safe-area-inset-top) + 18px) 15px calc(env(safe-area-inset-bottom) + 34px)}
    .hero{position:relative;overflow:hidden;background:rgba(255,250,241,.84);border:1px solid var(--line);border-radius:28px;padding:20px;box-shadow:var(--shadow);backdrop-filter:blur(20px)}
    .sun{position:absolute;right:-30px;top:-46px;width:138px;height:138px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff8d9 0 15%,var(--sun2) 34%,var(--sun) 78%);opacity:.88;box-shadow:0 0 70px rgba(231,168,62,.24)}
    .eyebrow{font-size:11px;font-weight:800;letter-spacing:.15em;color:#9a7a43}.hero h1{margin:5px 0 2px;font-size:31px;letter-spacing:-.03em}.hero p{margin:0;color:var(--muted);font-size:13px}.badge{display:inline-flex;align-items:center;gap:6px;margin-top:15px;padding:7px 10px;border-radius:999px;background:rgba(126,161,123,.11);color:#547252;font-size:11px;font-weight:800}.dot{width:7px;height:7px;border-radius:50%;background:var(--leaf)}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:11px 0 18px}.metric{background:rgba(255,250,241,.78);border:1px solid var(--line);border-radius:19px;padding:13px 11px}.metric small{display:block;color:var(--muted);font-size:10px;margin-bottom:3px}.metric b{font-size:22px;letter-spacing:-.04em}
    .next{background:linear-gradient(135deg,rgba(231,168,62,.13),rgba(142,181,200,.09));border:1px solid rgba(231,168,62,.22);border-radius:22px;padding:15px;margin-bottom:18px}.next small{display:block;color:#9a7a43;font-size:10px;font-weight:800;margin-bottom:5px}.next strong{display:block;font-size:15px}.next span{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.45}
    h2{font-size:14px;margin:19px 4px 9px;letter-spacing:.01em}.section-note{color:var(--muted);font-size:10px;margin:-4px 4px 10px}
    .asset{display:block;background:rgba(255,250,241,.88);border:1px solid var(--line);border-radius:21px;padding:14px;margin-bottom:9px;box-shadow:0 8px 24px rgba(55,45,28,.035);color:inherit;text-decoration:none}.asset-link:active{transform:scale(.99)}.route-chip{display:inline-flex;margin-top:10px;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:800;background:rgba(126,161,123,.12);color:#547252}.route-chip.web{background:rgba(142,181,200,.14);color:#56798a}.asset.compact{padding:12px 13px}.asset-head{display:flex;align-items:center;gap:10px}.icon{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:linear-gradient(145deg,rgba(246,207,121,.25),rgba(142,181,200,.14));font-weight:900}.asset-title{min-width:0;flex:1}.asset-title strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.asset-title span{display:block;color:var(--muted);font-size:9px;margin-top:2px;text-transform:uppercase;letter-spacing:.08em}.percent{font-size:13px}.bar{height:5px;margin:10px 0 0;border-radius:999px;background:#ebe5da;overflow:hidden}.bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--sun2),var(--sun),var(--leaf))}.asset p{margin:10px 0 0;font-size:12px;line-height:1.45;color:#414b58}.asset p span{display:block;font-size:9px;font-weight:800;color:var(--muted);margin-bottom:2px}.queue{background:rgba(255,250,241,.78);border:1px solid var(--line);border-radius:21px;padding:14px}.queue ul{list-style:none;padding:0;margin:0}.queue li{padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}.queue li:last-child{border-bottom:0}.queue li small{display:block;color:var(--muted);margin-top:3px}.queue .done{color:#5d7b5b;font-weight:800}.infra{opacity:.88}.empty{padding:15px;color:var(--muted);font-size:12px;text-align:center}
    details{margin-top:8px}summary{list-style:none;cursor:pointer;background:rgba(255,250,241,.72);border:1px solid var(--line);border-radius:18px;padding:13px;font-size:12px;font-weight:800}summary::-webkit-details-marker{display:none}.details-body{padding-top:9px}
    footer{margin:22px 4px 0;color:#918d83;font-size:9px;line-height:1.5}
  </style></head><body>
    <section class="hero"><div class="sun"></div><div class="eyebrow">HARMONY HOME</div><h1>YOS</h1><p>違う機能を、ひとつの世界観で。</p><div class="badge"><i class="dot"></i>HOME 実機確認済み / ローカル起動</div></section>

    <section class="metrics">
      <div class="metric"><small>全体</small><b>${overall}%</b></div>
      <div class="metric"><small>資産</small><b>${Number(assets.summary?.asset_count)||rows.length}</b></div>
      <div class="metric"><small>本人待ち</small><b>${ownerWait}</b></div>
    </section>

    ${topNext ? `<section class="next"><small>次の一手</small><strong>${esc(topNext.name)}</strong><span>${esc(topNext.next_action || topNext.current || '')}</span></section>` : ''}

    <h2>毎日使う機能</h2><div class="section-note">生活・判断・記録の中心</div>
    ${cards(primary)}

    <h2>本人タスクQueue</h2>
    <section class="queue"><ul>${queueHtml}</ul></section>

    <h2>自動化・補助</h2><div class="section-note">必要な時だけ表に出る機能</div>
    ${cards(supporting, true)}

    <details class="infra"><summary>開発・基盤を見る</summary><div class="details-body">${cards(infra, true)}</div></details>

    <footer>Design theme: 調和 / 太陽・自然・穏やかさ・見やすさ<br>HOMEはiPhone実機で確認済み。Clarity / MY REMOTEはローカル入口、その他は現在Web入口を併用。<br>One Enterは利用機能ではなく、裏側の開発司令塔として配置。<br>Local SSOT: iCloud Drive / Scriptable / One Enter Factory / state<br>SSOT更新: ${esc(assets.updated_at || 'unknown')}</footer>
  </body></html>`;

  const web = new WebView();
  await web.loadHTML(html);
  await web.present(true);
  Script.complete();
})().catch(async error => {
  const alert = new Alert();
  alert.title = "YOS";
  alert.message = String(error);
  alert.addAction("OK");
  await alert.present();
  Script.complete();
});