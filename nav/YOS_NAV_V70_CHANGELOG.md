# YOSナビ v70 変更記録

## 目的

Service Worker更新通知の「停車中に更新」がオフライン中でも押せる状態を解消し、通信できない状態での不要な再読み込みを防ぐ。

## 変更内容

- オフライン中は「停車中に更新」を無効化
- 通信復旧後に自動で更新ボタンを再有効化
- オフライン中は、通信復旧後に更新する案内へ切り替え
- 更新操作の多重実行を防止
- Service Workerキャッシュ名を `yos-navi-strategy-v70-offline-refresh-guard` へ更新

## 影響範囲

- `nav/pwa-update-notice-v68.js`
- `nav/service-worker.js`
- 本変更記録

YOSの期待値計算、現在地取得、地図座標、営業判断、Google Maps遷移、Taxi、Life、DB、乗車履歴、同期APIは変更していない。

## 確認結果

- 更新処理は `navigator.onLine` が真の場合だけ実行
- オフライン時はボタンを `disabled` と `aria-disabled=true` に同期
- `online` / `offline` イベントで表示と操作可否を更新
- 更新開始後は再実行を受け付けない

## 未確認事項

- iPhone SE3実機でオフライン時にボタンが無効表示になること
- 通信復旧後にボタンが再有効化されること
- PWAへService Worker v70が初回反映されること
- VoiceOverで無効状態と案内文が正しく読み上げられること
