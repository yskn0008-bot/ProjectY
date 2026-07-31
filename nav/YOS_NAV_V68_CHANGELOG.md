# YOSナビ v68 Change Log

## 変更理由
Service Worker更新後も表示中の画面が旧状態のまま残る可能性があるため、更新完了を安全に知らせる。

## 変更内容
- `pwa-update-notice-v68.js`を追加
- `controllerchange`時に更新通知を表示
- 自動再読み込みは行わない
- Service Workerキャッシュをv68へ更新

## 影響範囲
- `/nav/`のみ
- YOSの期待値計算、現在地取得、営業判断、地図、Taxi、Life、DBは未変更
- 正式名称「YOS」「YOSナビ」を維持

## 確認結果
- 通知はService Worker制御切替時だけ表示
- 営業データを書き換えない
- 閉じる操作のみ提供

## 未確認事項
- iPhone SE3での表示
- PWAとSafariでの下部重なり
- VoiceOver読み上げ
- 初回v68反映時の手動再表示
