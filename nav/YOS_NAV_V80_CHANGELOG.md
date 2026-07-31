# YOSナビ v80 変更記録

## 目的

オンライン遷移時にサーバーがHTTP 200で汎用エラーページや別画面のHTMLを返した場合、そのままYOSナビとして表示される可能性を減らす。

## 変更内容

- `nav/service-worker.js`
  - キャッシュ名を`yos-navi-strategy-v80-navigation-response-validation`へ更新。
  - `/nav/`および`/nav/index.html`への画面遷移で、ネットワーク応答を表示前に検査。
  - HTTP成功、`text/html`、空本文でないこと、`<title>YOSナビ</title>`、`<main class="app">`を確認。
  - 検査に失敗したネットワークHTMLは表示せず、検査済みのオフラインキャッシュへフォールバック。
  - 検査済みキャッシュも存在しない場合はエラー応答とし、誤った画面をYOSナビとして表示しない。
  - 既存の必須スクリプト注入、キャッシュ検査、オフライン診断は維持。
- `nav/runtime-diagnostics-v64.js`
  - 診断ビルドと期待キャッシュ名をv80へ統一。

## 変更範囲

`/nav/`のみ。YOSの正式名称・人格・司令塔仕様、期待値計算、現在地取得、地図座標、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果

- ネットワーク遷移応答が`isCacheableResponse(..., './index.html')`を通過した場合だけ表示される構造を確認。
- 検査失敗時は`./index.html`の検査済みキャッシュへフォールバックする構造を確認。
- Service Workerと診断側のv80キャッシュ名が一致。
- 変更対象は`nav/service-worker.js`、`nav/runtime-diagnostics-v64.js`、本記録の3ファイルのみ。

## 未確認事項

- iPhone SE3でv80 Service Workerが制御中になること。
- 正常なオンライン遷移で従来どおりYOSナビが表示されること。
- 汎用HTMLエラーページ相当を返した際に、検査済みキャッシュへフォールバックすること。
- キャッシュがない状態で不正HTMLが返った際に、誤った画面を表示しないこと。
- 正常時に`swOfflineReady=true`となること。
- 公開環境へのデプロイ反映。
