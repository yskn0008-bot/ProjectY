# YOSナビ v75 変更記録

## 目的

v74では重要ファイルがキャッシュ内に存在するかを確認できたが、空ファイルやHTTPエラー応答が保存されている状態までは検出できなかった。v75では既存の読み取り専用診断を拡張し、オフライン利用に必要なキャッシュ内容の最低限の健全性を確認する。

## 変更内容

- キャッシュ済み重要ファイルごとに存在、HTTP成功状態、内容サイズを確認
- 空ファイルを `empty` として検出
- HTTPエラー応答を `http-<status>` として検出
- 診断状態へ `invalidCriticalAssets` を追加
- 診断画面へ `swInvalidCriticalAssets` を追加
- 欠落または不正な重要ファイルがある場合は `swOfflineReady=false` を維持
- Service Workerキャッシュ名と診断ビルドをv75へ統一

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V75_CHANGELOG.md`

## 変更していない範囲

- YOSの正式名称、人格、司令塔仕様
- 期待値計算
- 現在地取得
- 地図座標、地図表示、営業判断
- Google Maps遷移
- Taxi、Life、DB、乗車履歴、同期API

## 確認結果

- 診断処理はキャッシュ応答を複製して読むだけで、削除・更新を行わない
- 正常ファイルは従来どおりオフライン準備完了として扱う
- 欠落ファイルと不正ファイルを別項目で記録する
- 既存の手動更新、自動再読み込み禁止、オフライン時更新禁止を変更していない

## 未確認事項

- iPhone SE3で `swOfflineReady=true` になること
- 空またはHTTPエラーのキャッシュ応答を意図的に作った場合に `swInvalidCriticalAssets` へ表示されること
- PWA更新後にv75 Service Workerが制御中になること
- オフライン再起動時の実読み込み
