# YOSナビ v76 変更記録

## 目的

v75では重要キャッシュの欠落、HTTPエラー、空ファイルを検出できるようになった。しかし、端末側のキャッシュ応答が破損などで読み取れない場合、1件の読み取り失敗で診断全体が `status-unavailable` となり、問題のあるファイルを特定できなかった。v76ではファイル単位で読み取り失敗を隔離し、診断を継続する。

## 変更内容

- 重要キャッシュの検査をファイル単位の `try/catch` で保護
- 応答本文を読み取れないファイルを `unreadable` として検出
- 読み取り不能な1件があっても、残りの重要ファイル検査を継続
- 診断画面では既存の `swInvalidCriticalAssets` に `<path>:unreadable` として記録
- Service Workerキャッシュ名と診断ビルドをv76へ統一

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V76_CHANGELOG.md`

## 変更していない範囲

- YOSの正式名称、人格、司令塔仕様
- 期待値計算
- 現在地取得
- 地図座標、地図表示、営業判断
- Google Maps遷移
- Taxi、Life、DB、乗車履歴、同期API

## 確認結果

- キャッシュ検査は従来どおり読み取り専用で、削除・更新を行わない
- `missing`、`http-<status>`、`empty` の既存判定を維持
- 読み取り例外のみ `unreadable` として個別記録する
- 読み取り不能時は `swOfflineReady=false` を維持する
- 自動再読み込み、営業判断、地図描画処理には変更なし

## 未確認事項

- iPhone SE3でv76 Service Workerが制御中になること
- 実際の破損キャッシュ相当で `<path>:unreadable` が表示されること
- 正常キャッシュ時に `swOfflineReady=true` が維持されること
- オフライン再起動時の実読み込み
