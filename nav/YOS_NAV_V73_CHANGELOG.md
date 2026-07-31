# YOSナビ v73 変更記録

## 目的
Service Workerはv72まで進んでいた一方、実行時診断がv67のキャッシュ名を期待したままで、正常な最新版でも`swBuildMatch=false`となり診断がREADYにならない不整合を解消する。

## 変更内容
- `runtime-diagnostics-v64.js`の診断ビルド表示をv73へ更新。
- 診断側の期待キャッシュ名を`yos-navi-strategy-v73-diagnostics-cache-alignment`へ更新。
- `service-worker.js`の実キャッシュ名を同じv73名へ更新。
- 既存の診断頻度制御、更新通知、オフライン動作、地図・期待値ロジックは変更しない。

## 変更範囲
- `nav/runtime-diagnostics-v64.js`
- `nav/service-worker.js`
- `nav/YOS_NAV_V73_CHANGELOG.md`

## 確認結果
- 診断側の`EXPECTED_CACHE`とService Worker側の`CACHE`が完全一致していることをコード上で確認。
- `YOS_NAV_STATUS_REQUEST`の応答形式は変更していない。
- Service Workerのキャッシュ対象、fetch戦略、更新通知スクリプトの参照は維持。
- YOSの名称、人格、司令塔仕様は変更していない。
- Taxi、Life、DB、乗車履歴、同期API、期待値計算、地図座標、営業判断、Google Maps遷移は変更していない。

## 未確認事項
- iPhone SE3のPWAでv73へ切り替わった後、`swCache=yos-navi-strategy-v73-diagnostics-cache-alignment`、`swBuildMatch=true`になること。
- 地図タイル・推奨候補・現在地が揃った状態で診断表示がREADYになること。
- オフライン復帰後もv73のService Worker状態が再取得されること。
