# YOSナビ v106 キャッシュ削除範囲の安全固定

## 目的

YOSナビのService Workerが古いキャッシュを整理する際、Taxi、Life、YOS、その他の同一origin上のキャッシュを削除しない既存条件を回帰テストで固定する。

## 変更内容

実行時コードは変更せず、`nav/tests/cache-scope-safety.test.mjs`を追加した。

固定する条件：

- キャッシュ名前空間は`yos-navi-strategy-`に限定する
- 削除対象はYOSナビ専用prefixの古いキャッシュだけに限定する
- 現行キャッシュを削除しない
- 直前の有効な退避キャッシュを削除しない
- 全キャッシュを一括削除する処理を許可しない
- Taxi、Life、YOS、無関係キャッシュを直接削除する処理を許可しない

## 変更範囲

- `nav/tests/cache-scope-safety.test.mjs`
- `nav/YOS_NAV_V106_CACHE_SCOPE_SAFETY.md`

YOSナビの画面、地図、現在地取得、期待値計算、営業判断、外部ナビ遷移は変更していない。

`/taxi/`、`/life/`、`/yos/`、`/server/`、DB、乗車履歴、同期APIは変更していない。

## 確認方法

GitHub Actions「YOSナビ Safety」で以下を自動確認する。

- 追加テストのJavaScript構文
- `nav/tests/*.test.mjs`の全安全回帰テスト
- Service Workerの既存構文
- 実行時診断ファイルの既存構文

## 未確認事項

- Pull Request上のGitHub Actions実行結果
- main反映後のGitHub Actions再実行結果
- iPhone SE3で、YOSナビ更新後もTaxi、Life、YOSの各PWAキャッシュが維持されること
- オフライン状態で現行または直前の有効なYOSナビキャッシュから起動できること

## 名称ルール

唯一の人格・司令塔の正式名称は「YOS」とする。名称変更、言い換え、派生名への置換は行っていない。
