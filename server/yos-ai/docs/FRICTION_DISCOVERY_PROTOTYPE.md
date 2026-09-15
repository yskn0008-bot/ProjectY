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

## Completion boundary

Prototype core:
- pure TypeScript
- rolling-window detection
- measurable-impact gate
- low-risk / reversible gate
- no storage
- no external write
- no new SSOT
- unit tests

Live discoveryは未接続。実利用化では既存Clarity/YOS/MY WAY等からsignalを作るadapterと、既存Automationによる定期実行だけを追加する。

## Rollback

このbranch / Draft PRを閉じれば本番への影響はゼロ。既存データmigrationはない。
