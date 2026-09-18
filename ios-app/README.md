# YOS iOS App

既存資産を捨てず、YOSを1つの正式iPhoneアプリへ統合する土台です。

## 現在の正式構成

- アプリ名: **YOS**
- Bundle ID: `jp.yos.onlysystem`
- ネイティブ基盤: Capacitor 8
- アプリ起動直後のHOME: **MY WAY**
- 主要領域: MY WAY / Life / Money / Hero’s Journey / Idea
- 入力: Clarity / YOS Capture
- 機器操作: BRAVIA / Google TV native bridge
- System: 資産進捗・本人Queue・開発状態（通常HOMEから分離）
- Taxi: 互換画面としてのみ同梱

## バンドル

`npm run prepare:web` は以下を `www/` へ同梱します。

- `yos/`
- `life/`
- `taxi/`（互換）
- `ios-app/shell/`
- YOS asset/user-task SSOT

そのため、MY WAY / Life 等の基本画面はGitHub PagesやVercelが停止してもアプリ内資産から起動できます。

## ネイティブ生成

```bash
cd ios-app
npm install
npm run native:init
```

既存iOSプロジェクトを更新する場合:

```bash
npm run native:sync
```

## 検証

`YOS iOS App Safety` で次を自動確認します。

1. Node契約テスト
2. Web資産の同梱
3. Capacitor iOSプロジェクト生成
4. iOS Simulator向けネイティブビルド（署名なし）

## 物理iPhoneへの配布

実機インストール/TestFlight/App StoreにはAppleのコード署名が必要です。
コード・画面・ネイティブ生成と署名前ビルドまでは自動化し、署名に本人操作が必要になった地点だけ停止します。
