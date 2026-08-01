# YOSナビ v91 変更記録

## 目的

YOSナビの画面HTMLへ必須スクリプトを補完した際、元の応答ヘッダーを一律に作り直すことで、Content-Security-Policy、Permissions-Policy、Referrer-Policyなどの安全用ヘッダーが失われる経路を閉じる。

## 変更内容

- 補完後の画面応答で、元のHTML応答ヘッダーを引き継ぐよう変更。
- 本文を書き換えた後に不整合となる`Content-Length`、`Content-Encoding`、`ETag`のみ削除。
- `Content-Type`を`text/html; charset=utf-8`へ統一。
- オンライン画面と検証済みオフライン画面の両方で同じヘッダー処理を使用。
- Service Workerのキャッシュ名と実行時診断をv91へ同期。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V91_CHANGELOG.md`

担当外のTaxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果

- YOSの正式名称、唯一の人格・司令塔としての役割に変更なし。
- 承認済みYOSナビ資産一覧、期待値計算、現在地取得、地図、営業判断、Google Maps遷移に変更なし。
- v90のHTML識別、必須スクリプト参照、補完完了検査を維持。
- 本文変換後に不正となるサイズ・圧縮・ETagヘッダーを返さない構造を確認。
- 元応答の安全用ヘッダーを保持する構造を確認。

## 未確認事項

- iPhone SE3でv91 Service Workerが制御開始すること。
- 正常時に`swBuildMatch=true`、`swOfflineReady=true`となること。
- 公開環境のContent-Security-Policy、Permissions-Policy、Referrer-Policy等が画面応答へ保持されることの実機・ネットワーク確認。
- 必須スクリプト補完後の全機能とオフライン再起動。
- 公開環境へのデプロイ反映。
