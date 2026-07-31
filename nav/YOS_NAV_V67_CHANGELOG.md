# YOSナビ v67 変更記録

## 変更理由
診断処理はv66で多重実行を防止したが、Leafletのタイルやクラス更新のたびにService Workerへ状態照会する余地が残っていた。iPhone SE3での長時間利用時に不要な処理を増やさないため、状態照会を必要時だけ行う。

## 変更内容
- Service Worker状態を30秒間再利用
- 通常のDOM更新では診断スナップショットだけ更新
- `controllerchange`、オンライン復帰、画面復帰時だけService Worker状態を強制再確認
- 実行中の強制再確認要求を次の1回へ集約
- Service Workerキャッシュをv67へ更新

## 影響範囲
- `nav/runtime-diagnostics-v64.js`
- `nav/service-worker.js`
- 本文書

YOSの期待値計算、現在地取得、地図座標、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更しない。

## 確認結果
- 診断DOM更新とService Worker照会を分離
- Leafletの連続DOM更新で毎回MessageChannelを生成しない
- 強制更新イベントでは古い状態を使わず再照会する
- 正式名称「YOS」「YOSナビ」を維持

## 未確認
- iPhone SE3で診断画面を長時間表示した際のCPU負荷
- PWAへのService Worker v67初回反映
- オフラインからオンライン復帰した際のService Worker状態更新
