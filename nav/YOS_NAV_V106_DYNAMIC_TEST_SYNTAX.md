# YOSナビ v106 安全テスト構文検査の自動追従

## 目的

YOSナビの安全テスト追加時に、GitHub Actionsの構文検査対象へ手動で追記し忘れる問題を防ぐ。

## 変更内容

- `.github/workflows/yos-nav-safety.yml`の構文検査を固定ファイル列挙から`nav/tests/*.test.mjs`の自動列挙へ変更した。
- 安全テストが0件の場合は検査を失敗させる。
- `set -euo pipefail`を有効化し、途中の構文検査失敗を見逃さない。
- Service Workerと実行時診断ファイルの構文検査は従来どおり維持する。

## 変更範囲

- GitHub ActionsのYOSナビ安全検査
- 本記録ファイル

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断は変更していない。Taxi、Life、DB、乗車履歴、同期APIも変更していない。

正式名称「YOS」と、唯一の人格・司令塔としての役割は変更していない。

## 確認方法

Pull Requestで「YOSナビ Safety」を実行し、次を確認する。

1. `nav/tests/*.test.mjs`が1件以上検出される。
2. 各テストファイルへ`node --check`が実行される。
3. 全安全テストが`node --test nav/tests/*.test.mjs`で合格する。

## 未確認事項

- Pull Request上のGitHub Actions実行結果
- main反映後の再実行結果

実行時コードを変更しないため、iPhone SE3実機確認と公開環境確認は今回の変更対象外とする。
