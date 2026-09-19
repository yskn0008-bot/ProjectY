# YOS

iPhone中心で使う統合システムです。日常の表側は **MY WAY**、Life / Money / Hero’s Journey / Idea を同じYOS内で扱います。

## 現在の入口

- YOS PWA: `/` → `/yos/`（MY WAY）
- Life: `/life/`
- Hero’s Journey詳細: `/yos/hj/`
- System / Mission Control: `/system/`
- Native iOS source: `/ios-app/`

ルートPWAのscopeはProjectY全体です。MY WAY / Life / Money / Journey / Idea / Systemを1つのホーム画面アプリとして扱い、主要静的資産はService Workerへ保存します。

## 方針

- **日常のHOMEはMY WAY**。開発進捗やOne Enterを通常画面の主役にしない。
- **既存資産を再利用**し、同じ機能を別名で作り直さない。
- **iPhone優先**。390px / WebKitを安全検査対象にする。
- **ローカル優先**。GitHub/Vercelは停止しても日常画面が開けるよう、PWAキャッシュとFactory Coreを併用する。
- **GitHubは履歴・CI・配信ミラー**として使い、唯一の実行依存にはしない。
- 外部送信・支払い・公開・不可逆操作は本人承認境界を守る。

## 主要ディレクトリ

```text
.
├── yos/                 # MY WAY / Money / Journey / Idea
├── life/                # MY LIFE
├── system/              # Mission Control / 開発状態
├── ios-app/             # YOSネイティブiOS版
├── tools/factory-core/  # One Enter Factory Core / ローカル退避
├── data/                # 資産SSOT・Mission Controlデータ
├── widgets/             # MY WAY Widget
├── taxi/                # Taxi互換資産
├── manifest.webmanifest # 統合YOS PWA manifest
├── service-worker.js    # 統合YOS PWA root worker
└── index.html           # MY WAYへ入るYOS入口
```

## 検証

- `YOS Unified PWA Safety`: 5領域・System・オンライン/オフライン導線を検査
- `YOS iOS App Safety`: Capacitor生成、署名前iOS build、MY WAY同梱を検査
- Life / Cockpit / HJ等は各専用Safetyで回帰検査

## Native iOS

Bundle ID: `jp.yos.onlysystem`

Native版はMY WAYを起動HOMEとして生成・署名前buildまで自動化済みです。Apple Developer Programへの加入とTestFlight署名は、PWA版を実用完成させた後に行います。

## Mission Control

Mission Controlは利用者HOMEではなく裏側の状態確認画面です。

- UI: `/system/`
- 状態: `data/mission-control.json`
- 資産SSOT: `data/yos-assets.json`
