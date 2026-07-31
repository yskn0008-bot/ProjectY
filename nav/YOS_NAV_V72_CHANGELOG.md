# YOSナビ v72 変更記録

## 目的
Service Worker の `controllerchange` が同一コントローラーに対して重複通知された場合でも、YOSナビの更新通知を重ねて表示しない。

## 変更内容
- `navigator.serviceWorker.controller` の参照を保持する方式へ変更。
- 初回制御開始は通知しない既存仕様を維持。
- 同一コントローラーの重複イベントは無視。
- 実際に別コントローラーへ切り替わった場合だけ更新通知を表示。
- Service Worker キャッシュ識別子を `yos-navi-strategy-v72-controller-identity-guard` へ更新。

## 変更範囲
- `nav/pwa-update-notice-v68.js`
- `nav/service-worker.js`
- 本変更記録

## 変更していない領域
- YOSの名称・人格・司令塔仕様
- 期待値計算
- 現在地取得
- 地図座標
- 営業判断
- Google Maps 遷移
- Taxi、Life、DB、乗車履歴、同期API

## 確認結果
- 初回コントローラー取得時は通知されない分岐を維持。
- 同一 `ServiceWorker` オブジェクトでは通知しない分岐を追加。
- 別 `ServiceWorker` オブジェクトへ変化した場合だけ通知処理へ進む。
- 更新は手動操作のみで、自動再読み込みは追加していない。
- オフライン時の更新ボタン無効化を維持。

## 未確認事項
- iPhone SE3 のSafari/PWAで重複 `controllerchange` が発生した場合に通知が1回だけ表示されること。
- PWAへのv72初回反映。
- VoiceOverで更新通知が1回だけ読み上げられること。
