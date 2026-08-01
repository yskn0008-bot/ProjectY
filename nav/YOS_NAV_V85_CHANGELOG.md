# YOSナビ v85 変更記録

## 目的

YOSナビの`index.html`が直接読み込むスクリプトを、オフライン準備完了判定の必須資産へ確実に含める。

## 変更内容

- `REQUIRED_SCRIPTS`を承認済みJavaScript資産から一元生成するよう変更
- `shift-phase-v1.js`、`location-status-v1.js`、`area-map-v1.js`を必須キャッシュ検査へ追加
- 上記資産が欠落・破損している場合は`swOfflineReady=false`とする
- HTMLへの不足スクリプト補完対象も承認済みJavaScript資産と一致させた
- Service Workerキャッシュ名と診断表示をv85へ統一

## 安全性

- 変更範囲は`/nav/`のみ
- 承認済み資産の一覧、レスポンス検証、URL検証、Content-Type検証、HTML混入検査は維持
- YOSの正式名称、唯一の人格・司令塔としての役割は変更していない
- Taxi、Life、DB、乗車履歴、同期APIは変更していない

## 確認結果

- `index.html`が直接参照する5本の外部スクリプトすべてが必須資産に含まれる構造を確認
- `REQUIRED_SCRIPTS`と`STATIC`のJavaScript一覧が乖離しない構造に整理
- v85のキャッシュ名と診断側の期待値が一致

## 未確認事項

- iPhone SE3でv85 Service Workerが制御中になること
- 正常時に`swBuildMatch=true`、`swOfflineReady=true`となること
- `shift-phase-v1.js`、`location-status-v1.js`、`area-map-v1.js`欠落時に対象ファイルが診断表示されること
- オフライン再起動時に上記3資産を含む画面機能が動作すること
- 公開環境へのデプロイ反映
