# YOSナビ v74 変更記録

## 目的

Service Workerのキャッシュ名が一致していても、YOSナビのオフライン動作に必要なファイルが実際に揃っているかは確認できなかった。v74では既存の読み取り専用診断を拡張し、重要ファイルのキャッシュ欠落を検出できるようにする。

## 変更内容

- Service Workerの状態応答へ `offlineReady` を追加
- オフライン動作に必要な `index.html` と必須スクリプトを検査
- 欠落しているファイルを `missingCriticalAssets` で返す
- 診断画面へ `swOfflineReady` と `swMissingCriticalAssets` を追加
- 総合 `READY` 判定へオフラインキャッシュ準備完了を追加
- Service Workerキャッシュ名と診断ビルドをv74へ統一

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V74_CHANGELOG.md`

## 変更していない範囲

- YOSの正式名称、人格、司令塔仕様
- 期待値計算
- 現在地取得
- 地図座標、地図表示ロジック、営業判断
- Google Maps遷移
- Taxi、Life、DB、乗車履歴、同期API

## 確認結果

- 両JavaScriptファイルはNode.jsの構文検査を通過
- Service Worker側と診断側のv74キャッシュ名が一致
- 既存の状態照会メッセージ `YOS_NAV_STATUS_REQUEST` を維持
- 診断処理はキャッシュ内容を読むだけで、削除・更新は行わない
- 既存の更新通知、自動再読み込み禁止、オフライン時更新禁止を変更していない

## 未確認事項

- iPhone SE3で `swOfflineReady=true` になること
- 必須ファイルを意図的に欠落させた場合、該当パスが `swMissingCriticalAssets` に表示されること
- PWA更新直後にv74のService Workerが制御中になること
- オフライン再起動時にキャッシュ済み必須スクリプトが正常に読み込まれること
