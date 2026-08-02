# YOSナビ v106 リクエスト処理範囲の安全固定

## 目的

YOSナビのService Workerが、YOSナビ配下以外のページや通信を意図せず傍受しない既存条件を自動回帰テストで固定する。

## 変更内容

- `nav/tests/request-scope-safety.test.mjs`を追加
- Service Workerのスコープを自身の配置先から算出することを検査
- 別originとYOSナビ配下外のパスを除外することを検査
- 対象外リクエストを`fetch`処理の早期段階で終了することを検査
- GET以外の通信を処理しないことを検査
- Taxi、Life、YOSのパスを直接処理対象へ追加しないことを検査

## 影響範囲

- `/nav/`内のテストと記録のみ
- YOSナビの実行時コードは変更しない
- `/taxi/`、`/life/`、`/yos/`、`/server/`、DB、乗車履歴、同期APIは変更しない

## 確認方法

既存のGitHub Actions「YOSナビ Safety」が`nav/tests/*.test.mjs`を自動検出し、構文検査と全安全回帰テストを実行する。

## 未確認事項

- Pull Request上の「YOSナビ Safety」最終結果
- Codex governance最終結果
- main反映後の再実行結果
- iPhone SE3でYOSナビを開いた状態でもTaxi、Life、YOSの各PWA通信へ干渉しないこと

## 名称ルール

唯一の人格・司令塔の正式名称は「YOS」。名称変更、言い換え、派生名への置換は行っていない。
