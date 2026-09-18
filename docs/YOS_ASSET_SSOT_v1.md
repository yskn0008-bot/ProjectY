# YOS Asset SSOT v1

Issue: #371  
Base at start: `5d778d78f5b6af3130765c8ecc04ffeafd7f1345`

## 目的

YOS統合アプリ、Widget、通知が同じ「現在地」を読むための正式な資産レジストリを作る。

- 資産SSOT: `data/yos-assets.json`
- 検証: `scripts/validate_yos_assets.py`
- CI: `.github/workflows/yos-assets-ssot.yml`
- 既存 `data/mission-control.json` はGitHub運用状態の自動同期用としてそのまま残す。
- 2つを混ぜない。P2以降は資産状態に `yos-assets.json`、GitHub運用補助情報に既存Mission Controlを使う。

## 22資産の扱い

過去に画像で作成された「22資産一覧」そのものは、今回確認したGitHub上に機械可読な正本として存在しなかった。  
そのためv1は、現在のGitHub Issue / PR / main上の実装と、YOS統合アプリで明示された対象から22件を再構成している。

名称は確認できた既存名称を維持する。より強い証拠が見つかった場合は、スキーマを作り直さず対象行とevidenceだけを更新する。

## 必須フィールド

各assetは以下を必須とする。

`id`, `name`, `area`, `status`, `progress`, `current`, `next_action`, `priority`, `blocker`, `needs_user_action`, `device_verified`, `production_verified`, `updated_at`, `deep_link`, `completion_criteria`, `evidence`

加えて、進捗を機械検証するため `progress_basis` を保持する。

## 進捗計算

| stage | weight |
|---|---:|
| 仕様・完成条件 | 20% |
| 実装 | 30% |
| テスト | 15% |
| iPhone実機確認 | 20% |
| 本番接続／運用確認 | 15% |

`progress` は `progress_basis` で `true` のstageだけを合計し、その判断には `evidence` が必要。

- コードが存在しても実機確認の代用にはしない。
- テスト成功を本番確認の代用にはしない。
- device加点には `device:`、production加点には `production:` で始まる証拠を必須とする。
- `status=complete` は100%・device verified・production verifiedをすべて満たす時だけ許可する。
- 全体進捗は22資産を等重みで算術平均し、整数へ丸める。重要度による隠れた重み付けはしない。

v1スナップショット: **全体53% / 22資産 / 本人操作必要7件**

## evidence表記

- `PR#319`: 同一repositoryのPull Request
- `Issue#315`: 同一repositoryのIssue
- `path:data/mission-control.json`: main上のrepository path
- `device:<ref>`: 最新対象版をiPhone実機で確認した証拠
- `production:<ref>`: 本番接続・運用を確認した証拠

## deep link

P1では存在しないiOS URL schemeを作らない。既存の安定したWeb routeだけ記録し、正式なiPhone deep linkが未確定の資産は `null` とする。P2でアプリのURL scheme / Universal Linkを確定した後に更新する。

## Design SSOTとの関係

テーマは **「太陽・調和」**。

色名: 生成り白 / 深い紺 / 太陽ゴールド / 朝焼けオレンジ / 空ブルー / 若葉グリーン / 夕焼けコーラル

P1では未確認のHEX値を発明しない。P2開始時に既存Visual SSOTを確認し、画面・Widget・通知で共用する正式token値を確定する。

## 通知契約

通知対象:
- 完成
- 本人操作が必要
- 重大な停止／障害
- 進捗後退
- YOS統合アプリが実利用可能になった時

通知しない:
- 変化なし
- 内部処理
- 途中経過

P4ではGit履歴または保存済み前回値との差分で判定する。

## 現在の22資産

| id | name | progress | 本人操作 |
|---|---|---:|---|
| `yos` | YOS | 65% | 不要 |
| `my-way` | MY WAY | 65% | 要 |
| `clarity` | Clarity | 65% | 要 |
| `money` | Money | 65% | 不要 |
| `life` | Life | 65% | 不要 |
| `heros-journey` | Hero’s Journey | 20% | 不要 |
| `idea` | Idea | 20% | 不要 |
| `yos-mission-control` | YOS Mission Control | 65% | 不要 |
| `my-way-widget` | MY WAY Widget | 65% | 要 |
| `notifications` | Notifications | 20% | 不要 |
| `money-capture` | Money Capture | 65% | 要 |
| `morning-flow` | Morning Flow | 65% | 不要 |
| `night-reset` | Night Reset | 65% | 不要 |
| `my-remote` | MY REMOTE | 65% | 要 |
| `yos-home-voice` | YOS Home Voice | 65% | 要 |
| `yos-departure-guard` | YOS Departure Guard | 65% | 要 |
| `yos-screenshot-router` | YOS Screenshot Router | 65% | 不要 |
| `weekly-review` | Weekly Review | 20% | 不要 |
| `friction-discovery` | Friction Discovery | 20% | 不要 |
| `one-enter` | One Enter | 65% | 不要 |
| `shortcut-factory-stash` | Shortcut Factory + STASH | 50% | 不要 |
| `projecty-hq` | ProjectY HQ | 50% | 不要 |

## status

- `planned`: 仕様はあるが正式実装が未完了
- `building`: 実装中またはテスト未完了
- `awaiting_device_verification`: 実装・テスト証拠はあるが最新状態のiPhone実機確認が未完了
- `awaiting_production_verification`: 実機確認済み、本番運用確認待ち
- `blocked`: 進行不能な具体的blockerあり
- `complete`: 5 stageすべて証拠あり

## Rollback

このP1は既存コードを変更せず4ファイルを追加するだけ。問題があればP1のcommit/PRをrevertすればよく、既存Mission Control・製品コード・iPhone資産には影響しない。

## P2入口

P2は `data/yos-assets.json` をread-onlyで読むHOMEから開始する。

最初に表示する値:
1. `summary.overall_progress`
2. priority順の最重要資産
3. その `next_action`
4. `summary.needs_user_action_count`

P2で資産データを書き換えるロジックは持たせない。更新責務はP5で設計する。
