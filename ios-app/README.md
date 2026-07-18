# YOS iOS App

既存の `taxi/` と `life/` を捨てずに、1つの正式iOSアプリへ統合するための土台です。

## 構成

- アプリ名: YOS
- Bundle ID: `jp.yos.onlysystem`
- ネイティブ基盤: Capacitor 8
- Web資産: `taxi/` と `life/` をビルド時に同梱
- 配布順: TestFlight → App Store
- ウィジェット: WidgetKitで別途追加

## 初期化

```bash
cd ios-app
npm install
npm run native:init
```

## Web資産更新

```bash
npm run native:sync
```

## 重要

- `www/` は生成物。`scripts/prepare-web.mjs` がTaxi / Lifeをコピーします。
- App Store公開にはApple Developer Program加入と署名設定が必要です。
- WidgetKitではApp Groupを使い、Taxi / Lifeの共有データを表示します。
- YOSは唯一の司令塔。Taxi / Lifeは機能画面です。
