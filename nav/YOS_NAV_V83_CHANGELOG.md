# YOSナビ v83 変更記録

## 目的

承認済みYOSナビ資産の取得時にリダイレクトが発生した場合、別オリジンまたは別パスの応答をYOSナビ資産として実行・保存しない。

## 変更内容

- Service Workerのキャッシュ名と診断表示をv83へ統一。
- ネットワーク応答の最終URLを、要求した承認済み資産のオリジンとパスに照合。
- 最終URLが異なる応答は、HTTP 200かつ正しいContent-Typeでも実行・キャッシュしない。
- 既存キャッシュの最終URLも再検査し、不一致時は`response-url`として診断する。
- 不正なネットワーク応答時は、再検査済みの正常キャッシュだけをフォールバックに使用する。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V83_CHANGELOG.md`

`/nav/`以外は変更していない。

## 確認結果

- v83のキャッシュ名がService Workerと診断側で一致。
- 最終応答URLのオリジンとパスを検証する処理を、オンライン応答・インストール時キャッシュ・既存キャッシュ診断へ適用。
- v82までのHTTP状態、Content-Type、空本文、HTML混入、YOSナビ画面識別の検査を維持。
- YOSの正式名称、人格、司令塔仕様、期待値計算、現在地取得、地図、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 未確認事項

- iPhone SE3でv83 Service Workerが制御中になること。
- 正常時に`swBuildMatch=true`および`swOfflineReady=true`になること。
- 承認済み資産が別パスまたは別オリジンへリダイレクトされた場合に、実行されず正常キャッシュへ切り替わること。
- 既存キャッシュのURL不一致時に`<path>:response-url`が表示されること。
- オフライン再起動時の実読み込み。
- 公開環境へのデプロイ反映。
