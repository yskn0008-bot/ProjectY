# Friction Discovery Prototype v1

## Purpose

本人が「自動化しよう」と考えなくても、既存の生活ログから繰り返し発生する面倒を検出し、**効果が測れる低リスクなものだけ**試作候補へ送る。

自動化件数を増やすことは目的にしない。候補ゼロは正常状態。

## Existing assets first

新しいRaw DBや新しいInboxは作らない。

入力候補:
- 新Clarity / YOS Captureの既存Raw・classification
- YOSの確認済み判断・実行結果
- MY WAY / Lifeの既存状態
- Idea Inboxの既存記録
- Automationの実行結果

各ownerの保存を維持し、adapterで`FrictionSignal`へ投影する。

## Signal contract

最低限:
- stable id / occurredAt
- source
- patternKey
- label
- kind: repeated_action / repeated_check / hesitation / manual_step / recovery
- minutesSpent または manualSteps
- automatable / reversible
- risk
- evidenceId

`patternKey`は同じ不便を同じキーへ寄せるadapter責務。prototype coreは個人Rawを複製保存しない。

## Promotion rules

初期値では直近14日を監査し、次をすべて満たしたものだけ候補化する。

- 3回以上
- 2日以上にまたがる
- 全signalがlow risk
- automatable
- reversible
- 週換算3分以上の計測済み負担、または週8 manual steps以上

medium / high / unknown riskは自動試作候補へ送らない。

一度きり、効果不明、計測不能な面倒は候補化しない。頻度だけ高くても、削減効果が測れなければ残す。

## Output

最大5件の`candidates[]`だけを返す。

各候補:
- patternKey / label / kind
- occurrences / distinctDays
- estimatedMinutesPerWeek / manualStepsPerWeek
- score / confidence
- evidenceIds / sources
- `handoff: prototype`
- `requiresUserDecision: true`

生ログ一覧を本人へ見せることを目的にしない。

## プロト君 connection

将来は`handoff: prototype`の候補だけをプロト君の試作キューへ渡す。

v1 coreは自動でアプリ・Shortcut・Automationを作成したり、本番へ書き込んだりしない。まず「本当に繰り返していて、削減効果がある」ことを検出する役割だけを持つ。

試作品を作った後は、削減できた操作・時間をFeedbackとして同じloopへ戻し、効果がなければKeepせず終了できる構造を前提にする。

## Weekly reviewとの関係

この試作は⑧週次レビューへ統合しない。

- ⑨ = 不便を発見して試作候補を作る独立loop
- ⑧ = 1週間を振り返り、続ける / やめる / 自動化する候補へ圧縮する独立review

将来、⑨の候補を⑧の`automate`判断材料として参照しても、実装・保存・Lifecycleは別に保つ。

## Live MY LIFE adapter

`friction-live-adapter.ts` は既存 `yos-life-v1` の task 記録を read-only で投影し、既存 `discoverFrictionCandidates` へ渡す最初の live signal adapter。

安全側に倒すため、現段階で自動候補へ投影するのは次のみ。

- `done === true` の実行済みtask
- 「確認 / チェック / 照合 / 開く / 起動 / 検索」のような read-only 操作
- 支払、振込、送信、削除、購入、契約、決済、投稿、公開、登録、予約、注文、入出金、変更、更新、保存、入力、転記、同期を含まないtask

adapterは新しい保存先を作らず、`localStorage`、network write、外部送信を行わない。入力storeも変更しない。

各実行済みtaskは、既存Lifeの `date + task index` からstable evidence idを作り、manual step 1件として扱う。候補化の閾値は既存coreの初期値を変更しないため、十分に繰り返されていない場合は候補ゼロになる。

## Completion boundary

確認済み:
- pure Friction Discovery core
- rolling-window detection
- measurable-impact gate
- low-risk / reversible gate
- MY LIFE read-only live adapter
- no storage
- no external write
- no new SSOT
- adapter + core regression tests

未接続:
- 定期実行
- Clarity / YOS / MY WAY / Idea / Automationの追加adapter
- 候補を自動でPrototypeへ送る実行系

候補生成だけでは自動化を開始しない。候補は引き続き `requiresUserDecision: true`。

## Rollback

このadapter差分をrevertすれば元のpure coreへ戻る。既存データmigration、保存形式変更、外部作用はない。


## Runtime completion (2026-10-03)

- Existing MY LIFE `yos-life-v1` remains the only Life store; Friction Discovery creates no new SSOT or storage key.
- The browser runtime loads a generated artifact of the existing Friction Discovery engine plus a read-only MY LIFE adapter.
- Repeated completed read-only tasks are discovered over the existing 14-day window. Payment, transfer, send, delete, purchase, contract, settlement, publish, registration, reservation, order, deposit/withdrawal and state-changing labels fail closed.
- No separate scheduler is added. The existing Sunday Night Reset -> Weekly Review path invokes Friction Discovery and hands only qualified low-risk candidates to the existing `自動化する` slot.
- The result still requires user decision; discovery never performs the proposed automation or Prototype automatically.
- Rollback is removal of the two browser artifacts and their loader/handoff wiring. There is no migration or data rewrite.
