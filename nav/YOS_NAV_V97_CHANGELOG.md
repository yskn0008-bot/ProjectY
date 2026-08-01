# YOSナビ v97 変更記録

## 目的

新しいService Workerの有効化中に旧YOSナビキャッシュを先に削除し、旧Service Workerが制御中の画面や処理中の取得が必要資産を失う可能性を閉じる。

## 変更内容

- Service Workerのビルド識別を`v97`へ更新。
- 新しいv97キャッシュの完全性確認後、先に`clients.claim()`でv97 Service Workerへ制御を移す。
- 制御移行後に古いキャッシュを整理する順序へ変更。
- 直前のYOSナビキャッシュ1世代を保持し、それより古いキャッシュだけを削除。
- キャッシュ名からビルド番号を抽出し、保持対象を決定。
- Service Worker状態応答と診断画面へ`retainedPreviousCache`を追加。

## 安全上の理由

v96まではactivate処理で旧キャッシュをすべて削除してから`clients.claim()`を実行していた。`skipWaiting()`で旧Service Workerが制御中の画面へ切り替える過程では、旧Service Workerの処理と旧キャッシュ削除が競合する余地がある。v97では新しいキャッシュの完全性を確認し、新Service Workerへ制御を移してから整理する。また直前1世代を残すことで、切替直後の競合時に必要な旧資産を即時消去しない。

## 変更範囲

- `nav/service-worker.js`
- `nav/runtime-diagnostics-v64.js`
- `nav/YOS_NAV_V97_CHANGELOG.md`

YOSの正式名称、唯一の人格・司令塔としての役割、Taxi、Life、DB、乗車履歴、同期API、期待値計算、現在地取得、地図、営業判断、Google Maps遷移は変更していない。

## 確認結果

- 変更対象は`/nav/`配下の3ファイルのみ。
- 新キャッシュの完全性検査と不完全時のインストール中止は維持。
- `clients.claim()`が旧キャッシュ整理より先に実行される構造。
- 現在キャッシュと直前1世代を除く古いYOSナビキャッシュだけが削除対象。
- 診断側のビルド値、期待キャッシュ名、Service Worker本文のビルド識別がv97で一致。
- YOSの名称を変更・言い換え・派生名へ置換していない。

## 未確認事項

- iPhone SE3でv97 Service Workerが制御開始すること。
- 正常時に`swBuild=v97`、`swBuildMatch=true`、`swOfflineReady=true`となること。
- `swRetainedPreviousCache`に直前1世代が表示されること。
- Service Worker切替中の画面再読込・資産取得が失敗しないこと。
- オフライン再起動時の全必須機能。
- 公開環境へのデプロイ反映。
