# YOS Mission Control v1.0

更新日：2026-07-17  
状態：正式採用

## 1. 目的

YOSが、複数のチャット・GitHub・Codex・Taxi Lab・Project75・Google Drive・Google Calendarの状況を一か所で把握し、次にやることを一つに絞れる状態を作る。

解決する問題：

- 進捗確認のために、あちこちを見に行く必要がある
- 現在地、次の作業、問題、承認待ちが分散する
- 設計・実装・運用・承認の責任範囲が混ざる
- 完了した作業がYOS全体へ反映されない

## 2. 基本構造

```text
ようすけ
  ↓
YOS（判断・優先順位・承認・統合）
  ↓
YOS Mission Control
  ├ Projects
  ├ Tasks
  ├ Inbox
  ├ Approvals
  ├ Metrics
  └ History
  ↓
Taxi / Life / Money / Idea
  ↓
Lab（研究・設計・検証）
  ↓
Codex（実装）
  ↓
GitHub（保存・履歴管理）
```

## 3. 役割

### YOS

- 全体状況を読む
- 優先順位を決める
- 次の行動を一つに絞る
- 仕様変更を承認・保留・却下する
- 分野間の矛盾を解消する

### Mission Control

- 全プロジェクトの現在地を保存する
- 次の作業、問題、承認待ちを集約する
- 更新履歴を残す
- YOSが判断できる形へ整える

### Taxi / Life / Money / Idea

- 日常運用を行う
- 重要な進捗・問題・完了結果をMission Controlへ返す
- 全体仕様は独自に変更しない

### Lab

- 調査、設計、実験、改善案を作る
- 実装前の仕様を整理する
- 実装結果を検証する
- 最終決定は行わない

### Codex

- コード作成、修正、テスト、リファクタリングを行う
- ブランチとPull Requestで変更を提出する
- 仕様を独自に変更しない

### GitHub

- コード、設計書、タスク、変更履歴を保存する
- Issue・Pull Request・Commitで根拠を残す

## 4. 正本

YOS全体の開発基盤は `yskn0008-bot/ProjectY` を主リポジトリとする。

- 現在状態：`data/mission-control.json`
- Mission Control仕様：`docs/YOS_Mission_Control_v1.0.md`
- 重要な設計判断：`docs/ADR-*.md`
- 個別タスク：GitHub Issues
- 実装変更：GitHub Pull Requests
- 実行履歴：GitHub Commits

会話だけを正本にしない。

## 5. 状態

プロジェクトとタスクは次の6状態だけを使う。

| 状態 | 意味 |
|---|---|
| `backlog` | 未着手 |
| `active` | 作業中 |
| `review` | 確認・承認待ち |
| `blocked` | 問題があり進められない |
| `paused` | 意図的に保留 |
| `done` | 完了 |

健康状態：

- `ok`：正常
- `attention`：確認が必要
- `critical`：停止または重大問題

## 6. プロジェクト必須項目

- `id`
- `name`
- `domain`
- `type`
- `purpose`
- `status`
- `health`
- `priority`
- `progress_percent`
- `owner`
- `next_action`
- `blocker`
- `dependencies`
- `source_links`
- `last_update`
- `updated_by`

## 7. YOSコマンド

### `進捗`

全プロジェクトを重要度順に表示する。

表示順：`critical` → `blocked` → `review` → 優先度1の`active` → その他の`active` → `paused` → `backlog` → `done`。

### `次`

安全、期限、依存関係、優先度を確認し、今やるべき作業を一つだけ表示する。

### `完了`

対象を`done`に変更し、結果・根拠・次の作業を記録する。

### `開始`

対象を`active`に変更し、担当・次の作業・開始時刻を記録する。

### `保留`

対象を`paused`に変更し、理由と再開条件を記録する。

### `問題`

対象を`blocked`に変更し、問題・影響・解除条件を記録する。

### `追加`

新しいプロジェクトまたはタスクを登録する。先に既存資産で対応できないか確認する。

## 8. Inboxと承認

次をInboxへ集約する。

- 仕様変更案
- Codexの実装完了
- Pull Requestのレビュー待ち
- ブロッカー
- 期限超過
- 重要資料の更新
- 営業終了レビューから生まれた改善案

YOSの判断は「承認・保留・却下」の3つ。

重要な仕様変更では、変更理由・影響範囲・更新資料・Change Logへの記録を確認する。

## 9. 更新ルール

1. 開始時にIssueまたは状態を更新する
2. 作業中はCommit・コメント・資料で根拠を残す
3. 完了時に結果、残課題、次の作業を記録する
4. CodexはPull Requestで提出する
5. Labが検証する
6. YOSが承認する
7. 承認後に正本を更新する

会話だけで完了扱いにしない。

## 10. 自動取得対象

### GitHub

- Open Issues
- Review待ちPull Requests
- Merge済みPull Requests
- 最新Commits
- Actions失敗

### Codex

- 作業ブランチ
- Pull Request状態
- 実装内容
- テスト結果
- 残課題

### Google Drive

- YOS Master
- Change Log
- Taxi Master
- Project75関連資料
- 更新日時と更新内容

### Google Calendar

- 今日の予定
- 期限
- 営業日
- 重要イベント

### Project75

- 最新営業日
- 売上・KPI更新状況
- 未入力・確認待ち
- 次回営業への改善点

専門チャットの常時巡回は前提にしない。重要な進捗はIssue、Pull Request、正本ファイルのいずれかへ返す。

## 11. 安全と運用

- 認証情報、個人情報、営業上の機密を公開リポジトリへ保存しない
- 必要な情報は非公開リポジトリへ移す
- mainへ大規模変更を直接入れない
- ブランチ → Pull Request → レビュー → Mergeを基本とする
- 既存資産を削除・置換する前に影響を確認する
- iPhoneで見やすく、操作回数を減らす

## 12. 完成条件

YOSが`進捗`と言われた時に、一度で次を返せること。

- 全プロジェクトの状態
- 今やること一つ
- 承認待ち
- ブロッカー
- 直近の完了
- 情報が古い対象
- 根拠へのリンク

## 13. 実装順

1. Mission Controlの正本と初期プロジェクトを登録する
2. GitHub IssuesをTasks・Inboxとして運用する
3. `進捗`と`次`をYOSから使える状態にする
4. iPhone向けDashboardを実装する
5. GitHubのIssue・PR・Commitを自動集約する
6. Google Drive、Calendar、Project75を連携する

## 14. 承認

2026-07-17、ようすけからYOSへ最終判断を委任。YOSが設計を確認し、v1.0として正式採用した。