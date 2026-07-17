# YOS

YOS のメインプロジェクトです。iPhoneでの運用を主な前提として、YOS全体の仕様、Mission Control、Taxi関連資産、UI、補助スクリプトを管理します。

## 基本方針

- **既存資産を保護する**：削除・置換より、改善と統合を優先する
- **iPhoneを優先する**：モバイルSafari、タッチ操作、縦向きで使いやすくする
- **正本を明確にする**：重要な仕様・進捗・判断を会話だけに残さない
- **役割を分ける**：YOSが判断、Labが設計・検証、Codexが実装、GitHubが保存する
- **変更を追跡する**：ブランチ、Pull Request、Commitで履歴を残す

## ディレクトリ構成

```text
.
├── assets/     # 画像、アイコンなどの静的素材
├── data/       # Mission Controlなどの機械可読な現在状態
├── docs/       # 仕様書、ADR、運用テンプレート
├── scripts/    # 開発・運用を補助するスクリプト
├── ui/         # UI設計・画面資産・将来の実装
├── index.html  # iPhone向けエントリーポイント
└── README.md
```

## 主要仕様

- [YOS Mission Control v1.0](docs/YOS_Mission_Control_v1.0.md)：全プロジェクトの状況、次の作業、承認待ち、問題を一か所で把握する正式仕様
- [ADR-001：Mission ControlをGitHub中心で運用する](docs/ADR-001_YOS-Mission-Control.md)：保存場所と役割分担の正式な設計判断
- [営業終了テンプレート v1.0](docs/営業終了テンプレート_v1.0.md)：日報提出、営業分析、学びの資産化を行う正式テンプレート

## Mission Control正本

- 現在状態：[`data/mission-control.json`](data/mission-control.json)
- 個別タスク：GitHub Issues
- 実装変更：GitHub Pull Requests
- 実行履歴：GitHub Commits

## 現在の状態

- ProjectYをYOSの主リポジトリとして正式採用
- Mission Control v1.0の仕様と初期状態を作成済み
- GitHub IssuesをTasks・Inboxとして運用開始
- CodexはブランチとPull Requestによる実装フローを使用
- iPhone向けDashboard画面は未実装

## 次の段階

1. `data/mission-control.json`を読み込むiPhone向けDashboardを実装する
2. GitHubのIssue・Pull Request・Commitを自動集約する
3. YOS Master v2.0へ新しい役割分担を反映する
4. Google Drive、Calendar、Project75の連携を追加する

## 運用コマンド

YOSで次の言葉を使う。

- `進捗`：全体状況を確認
- `次`：今やることを一つ表示
- `開始`：作業開始を記録
- `完了`：結果と次の作業を記録
- `保留`：理由と再開条件を記録
- `問題`：ブロッカーを記録
- `追加`：新しい対象を登録
