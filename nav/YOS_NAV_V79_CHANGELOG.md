# YOSナビ v79 変更記録

## 目的

`index.html`がHTTP 200かつ`text/html`でも、汎用エラーページや別画面のHTMLだった場合にオフライン用キャッシュへ保存される可能性を減らす。

## 変更内容

- `nav/service-worker.js`
  - キャッシュ名を`yos-navi-strategy-v79-html-identity-validation`へ更新。
  - `index.html`について、`<title>YOSナビ</title>`と`<main class="app">`の両方を確認。
  - 識別要素が不足するHTMLを`html-identity`として拒否・診断。
  - 既存の空本文、HTTPエラー、Content-Type不一致、JavaScript内HTML本文の検査は維持。
- `nav/runtime-diagnostics-v64.js`
  - 診断ビルドと期待キャッシュ名をv79へ統一。

## 変更範囲

`/nav/`のみ。YOSの正式名称・人格・司令塔仕様、期待値計算、現在地取得、地図座標、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果

- `index.html`に検査対象の`<title>YOSナビ</title>`と`<main class="app">`が存在することを確認。
- Service Workerと診断側のv79キャッシュ名が一致するよう更新。
- 正常なYOSナビHTMLは従来どおりキャッシュ可能。
- 識別要素のないHTMLは`./index.html:html-identity`として診断対象になる設計。

## 未確認事項

- iPhone SE3でv79 Service Workerが制御中になること。
- 正常時に`swOfflineReady=true`となること。
- 汎用HTMLエラーページ相当で`./index.html:html-identity`が表示されること。
- オフライン再起動時の実読み込み。
- 公開環境へのデプロイ反映。
