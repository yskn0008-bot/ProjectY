# YOS Mission Control v1.0

更新日：2026-07-17  
状態：設計確定候補

## 1. 目的

YOSが、複数のチャット・GitHub・Codex・Taxi Lab・Project75・Google Drive・Google Calendarの状況を一か所で把握し、次にやることを一つに絞れる状態を作る。

解決する問題：

- 進捗確認のために、あちこちのチャットを見に行く必要がある
- どこまで進んだか、次に何をするかが分散する
- 設計、実装、運用、承認の責任範囲が混ざる
- 完了した作業がYOS全体へ反映されない

## 2. 基本構造

```text
ようすけ
  ↓
YOS
  ├ 判断
  ├ 優先順位
  ├ 承認
  └ 全体統合
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
Lab
       ↓
Codex
       ↓
GitHub
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
- 進捗・問題・完了結果をMission Controlへ返す
- 全体仕様は変更しない

### Lab

- 調査、設計、実験、改善案の作成
- 実装前の仕様整理
- 実装結果の検証
- 最終決定は行わない

### Codex

- コード作成、修正、テスト、リファクタリング
- ブランチとPull Requestで変更を提出する
- 仕様は独自に変更しない

### GitHub

- コード、設計書、タスク、履歴の保存場所
- 変更の根拠をCommit・Issue・Pull Requestとして残す

## 4. 正本

YOS全体の開発基盤は `yskn0008-bot/ProjectY` を主リポジトリとする。

Mission Controlの正本は次の通り。

- プロジェクト一覧・現在状態：`data/mission-control.json`
- Mission Control仕様：`docs/YOS_Mission_Control_v1.0.md`
- 重要な設計判断：`docs/ADR-*.md`
- 個別タスク：GitHub Issues
- 実装変更：GitHub Pull Requests
- 実行履歴：GitHub Commits

チャット内の会話だけを正本にしない。

## 5. 状態

各プロジェクトとタスクは、次の6状態だけを使う。

| 状態 | 意味 |
|---|---|
| `backlog` | 未着手 |
| `active` | 作業中 |
| `review` | 確認・承認待ち |
| `blocked` | 問題があり進められない |
| `paused` | 意図的に保留 |
| `done` | 完了 |

健康状態は次の3段階とする。

- `ok`：正常
- `attention`：確認が必要
- `critical`：停止または重大問題

## 6. プロジェクト必須項目

- `id`：変更しない識別子
- `name`：表示名
- `domain`：YOS / Taxi / Life / Money / Idea / Infrastructure
- `type`：operation / research / development / governance / infrastructure
- `purpose`：存在目的
- `status`：現在状態
- `health`：健康状態
- `priority`：1〜5。1が最優先
- `progress_percent`：0〜100
- `owner`：担当
- `next_action`：次にする一つの行動
- `blocker`：進行を止めている要因
- `dependencies`：先に必要な対象
- `source_links`：根拠となる資料・リポジトリ・Issue
- `last_update`：最終更新日時
- `updated_by`：更新者

## 7. YOSコマンド

### `進捗`

全プロジェクトを、重要度順に表示する。

表示順：

1. `critical`
2. `blocked`
3. `review`
4. 優先度1の`active`
5. その他の`active`
6. `paused`
7. `backlog`
8. `done`

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

新しいプロジェクトまたはタスクを登録する。既存資産で代用できないかを先に確認する。

## 8. Inboxと承認

次の情報はYOS Inboxへ集める。

- 仕様変更案
- Codexの実装完了
- Pull Requestのレビュー待ち
- ブロッカー
- 期限超過
- 重要資料の更新
- 営業終了レビューから生まれた改善案

YOSの判断は次の3つ。

- 承認
- 保留
- 却下

重要な仕様変更は、理由・影響範囲・更新資料・Change Log記録を確認してから承認する。

## 9. 更新ルール

1. 作業開始時にIssueまたはプロジェクト状態を更新する
2. 作業中はCommit・コメント・資料で根拠を残す
3. 完了時に結果、残課題、次の作業を記録する
4. Codexの変更はPull Requestで提出する
5. Labが検証する
6. YOSが承認する
7. 承認後に正本を更新する

会話だけで完了扱いにしない。

## 10. 自動化方針

### GitHub

自動取得対象：

- Open Issues
- Review待ちPull Requests
- Merge済みPull Requests
- 最新Commits
- Actions失敗

### Codex

- 作業ブランチ名
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

### 専門チャット

専門チャットを常時自動巡回することは前提にしない。各チャットは、重要な進捗をGitHub Issue、Pull Request、正本ファイルのいずれかへ返す。YOSはそこを確認する。

## 11. 安全と運用

- 認証情報、個人情報、営業上の機密は公開リポジトリへ保存しない
- 重要データは必要に応じて非公開リポジトリへ移す
- mainへ直接大規模変更を入れない
- ブランチ → Pull Request → レビュー → Mergeを基本とする
- 既存資産を削除・置換する前に影響を確認する
- iPhoneから見やすく、操作回数を少なくする

## 12. 完成条件

YOSが `進捗` と言われた時に、次を一度で返せること。

- 全プロジェクトの状態
- 今やること一つ
- 承認待ち
- ブロッカー
- 直近の完了
- 情報が古い対象
- 根拠へのリンク

## 13. 最初の実装範囲

1. `data/mission-control.json` を作る
2. 既存プロジェクトを登録する
3. Mission Control用Issueを作る
4. GitHubのIssue・PR・CommitをYOSが確認できる運用を始める
5. iPhone向けDashboard画面を実装する
6. Google Drive、Calendar、Project75との連携を順次追加する
