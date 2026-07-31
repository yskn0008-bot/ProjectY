# YOSナビ v78 変更記録

## 目的

YOSナビのオフライン用JavaScriptに、Content-TypeはJavaScriptでも本文がHTMLエラーページである応答が保存される可能性を安全に検出・拒否する。

## 変更内容

- Service Workerのキャッシュ名を `yos-navi-strategy-v78-content-signature-validation` へ更新。
- 必須JavaScript本文の先頭が `<!doctype html>`、`<html>`、`<head>`、`<body>` の場合は `html-content` と判定。
- 空本文、HTTPエラー、Content-Type不一致の既存検査を維持。
- インストール時と通常取得時の両方で、不正な必須資産を新規キャッシュへ保存しない。
- 既存キャッシュ検査で該当資産を `swInvalidCriticalAssets` に `<path>:html-content` として記録。
- 診断ビルド番号と期待キャッシュ名をv78へ統一。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V78_CHANGELOG.md`

`/nav/`以外は変更していない。

## 変更していないもの

- YOSの正式名称、人格、司令塔仕様
- 期待値計算
- 現在地取得
- 地図座標、表示、営業判断
- Google Maps遷移
- Taxi、Life、DB、乗車履歴、同期API

## 確認結果

- Service Workerと診断側のv78キャッシュ名が一致する構成にした。
- HTML本文判定は必須JavaScriptに限定し、通常のJavaScript本文へ影響しない。
- 不正応答はキャッシュ書換え前に拒否し、診断は読み取り専用のまま維持。
- 変更範囲を `/nav/` の3ファイルに限定。

## 未確認事項

- iPhone SE3で正常時に `swOfflineReady=true` となること。
- HTMLエラーページ相当のキャッシュで `<path>:html-content` が表示されること。
- PWA更新後にv78 Service Workerが制御中になること。
- オフライン再起動時に必須スクリプトが正常読込されること。
- 公開環境へのデプロイ反映。
