# Weekly Review Prototype v1

## Purpose

毎週の振り返り作業を本人へ要求せず、既存データから **続ける / やめる / 自動化する** の候補だけへ圧縮する。

この試作は新しい日記・新しいSSOT・新しい管理画面を作らない。MY WAY / Life / Money / Hero's Journey / Idea / YOSが既に持つ情報を、adapterで`WeeklyReviewSignal`へ投影して使う前提とする。

## Input boundary

`buildWeeklyReview()`は1週間分へ正規化済みのsignalだけを受け取る。元データを書き換えない。

最低限のsignal:
- domain
- label
- occurrences
- outcome
- value
- friction
- automatable / reversible
- measuredMinutesPerWeek または manualStepsPerWeek
- evidenceIds

候補には必ずevidenceを要求する。根拠のないAI推測だけでは候補化しない。

## Decision rules

### やめる
価値が低く、結果がnegative/neutralで、medium/high frictionが繰り返されているものを候補にする。

### 自動化する
次をすべて満たすものだけ候補にする。
- 週3回以上
- medium/high friction
- automatable
- reversible
- 週5分以上の計測済み負担、または週10 manual steps以上

低価値な作業が「やめる」と「自動化する」の両方へ該当する場合は、まず **やめる** を優先する。無駄を自動化して残さないため。

### 続ける
positiveな結果とmedium/high valueが確認できたものだけ候補にする。

各カテゴリは初期値で最大3件。候補ゼロは正常状態。

## Existing asset adapters

想定adapterは独立させる。
- MY WAY: 現在地 / 次の一歩 / 実行結果
- Life: task / routine / morning-night結果
- Money: 確認済みの収支・支払い行動
- Hero's Journey: 既存weekly story / confirmed fact
- Idea: 実際に進めた / 放置したidea
- YOS: 確認済みの判断・実行結果

元保存を共通DBへ移行しない。

## Output

返すのは候補だけ。

- `continue[]`
- `stop[]`
- `automate[]`

生ログ一覧を本人へ読ませる用途ではない。全候補は`requiresUserDecision: true`で、試作段階では自動削除・自動停止・自動外部書込みを行わない。

## Automation connection

将来のAutomationは週1回、直近1週間をadapterで集め、このpure engineへ渡し、結果が空なら通知しない。候補がある時だけMY WAYまたはYOS出口へ短く提示する。

スケジューラ自体はこの試作へ含めない。既存Automationを再利用する。

## Completion boundary

Prototype core:
- pure TypeScript
- no storage
- no external write
- no new SSOT
- no production route
- deterministic candidate filtering
- unit tests

Live weekly automationは未接続。実利用化では既存各領域adapterと既存Automationの接続だけを追加する。

## Rollback

このbranch / Draft PRを閉じれば本番への影響はゼロ。既存保存データのmigrationはない。
