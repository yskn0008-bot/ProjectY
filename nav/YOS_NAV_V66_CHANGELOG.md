# YOSナビ v66 変更記録

## 変更理由
診断パネル自身のDOM更新をMutationObserverが再検知し、Service Worker状態照会と診断再描画が連続する可能性があったため。

## 変更内容
- 診断処理を同時に1本だけ実行するガードを追加
- 実行中に再要求された場合は1回へまとめて再実行
- 診断パネル内部だけのDOM更新は監視対象から除外
- 診断内容が変わらない場合はDOMを書き換えない
- Service Workerキャッシュをv66へ更新

## 影響範囲
- `nav/runtime-diagnostics-v64.js`
- `nav/service-worker.js`
- 本変更記録

YOSの期待値計算、現在地取得、地図座標、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果
- 診断パネル更新が再診断を無限に発生させない構造へ変更
- Service Worker状態照会の並列多重実行を防止
- 通常URLでは引き続き診断パネルを表示しない

## 未確認
- iPhone SE3で診断画面を長時間表示した際のCPU負荷
- PWAへのService Worker v66初回反映
- オフライン復帰時の診断更新
