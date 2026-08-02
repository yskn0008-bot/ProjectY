# YOSナビ v106 安全回帰テスト自動実行記録

## 目的

YOSナビの実装変更が入るたびに、v97〜v106で固定したService Workerの安全条件とJavaScript構文を自動検査する。

今回の工程ではYOSナビの実行時コードを変更しない。既存の安全回帰テストをGitHub Actionsから実行できるようにし、将来の変更で世代混在防止、旧キャッシュ退避、オフライン完全性検査、古いネットワークマーカー復旧が失われた場合にマージ前に検出できる状態にする。

## 変更内容

- `.github/workflows/yos-nav-safety.yml`を追加
- `nav/**`またはワークフロー自身が変更されたPull Requestとmainへのpushで実行
- 手動実行にも対応
- Node.js 20を使用
- 次の構文検査を実行
  - `nav/service-worker.js`
  - `nav/runtime-diagnostics-v64.js`
  - `nav/tests/service-worker-v106-safety.test.mjs`
- `node --test nav/tests/service-worker-v106-safety.test.mjs`を実行
- 権限は`contents: read`だけに限定
- 実行時間上限を5分に限定
- 同じブランチの古い実行を自動停止し、最新の検査だけを継続

## 変更範囲

- `.github/workflows/yos-nav-safety.yml`
- `nav/YOS_NAV_V106_SAFETY_CI.md`

YOSナビの実行時コード、画面、地図、現在地取得、期待値計算、営業判断は変更していない。

## 維持した固定仕様

- 唯一の人格・司令塔の正式名称は「YOS」
- YOSの名称、役割名、画面名、チャット名、タスク名を変更・言い換え・派生名へ置換しない
- Taxi、Life、DB、乗車履歴、同期APIへ変更を加えない
- 追加パッケージや外部依存を導入しない

## 確認結果

- ワークフローはYOSナビ関連変更だけを対象とする
- 書き込み権限を持たない
- 既存のNode.js標準テストをそのまま再利用する
- 実行時ファイルの内容は変更していない

## 未確認事項

- Pull Request上でGitHub Actionsが起動すること
- JavaScript構文検査の実行結果
- 安全回帰テスト7件の実行結果
- mainへ反映後のpush実行結果
- iPhone SE3でのv106実機挙動
- 公開環境へのデプロイ反映
