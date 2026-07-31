# YOSナビ v71 変更記録

## 目的
初回インストール時にService Workerが初めて制御を開始しただけで、YOSナビの更新通知が表示される可能性をなくす。

## 変更内容
- ページ表示時点でService Workerの制御有無を記録
- 初めて制御が付いた場合は更新通知を表示しない
- 既存Service Workerから新しいService Workerへ切り替わった場合だけ更新通知を表示
- オフライン時の更新防止、手動更新、44px以上の操作領域は維持
- Service Workerキャッシュをv71へ更新

## 影響範囲
- `nav/pwa-update-notice-v68.js`
- `nav/service-worker.js`
- 本記録

YOSの期待値計算、現在地取得、地図座標、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果
- 初期状態でcontrollerがない場合、最初の`controllerchange`では通知を出さない構造
- 初期状態でcontrollerがある場合、次の`controllerchange`で通知を表示
- controllerが取得できないイベントでは何もしない
- 自動再読み込み、自動遷移、営業データ書換えは追加していない

## 未確認事項
- iPhone SE3でPWA初回追加時に更新通知が表示されないこと
- 既存PWA更新時には通知が表示されること
- Service Worker v71の初回反映
- VoiceOverでの更新通知読み上げ
