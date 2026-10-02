# YOS Loop Engine v1

## 目的

YOS / ProjectY 開発で、本人が毎回「確認 → 修正 → 再確認」を回さなくても済むように、
既存の **One Enter / Factory Core** の中で完成条件まで反復実行する。

これは新しい人格・新しい製品・新しいSSOTではない。
既存 One Enter の実行機能を、Loop Engineeringの考え方で強化したものとして扱う。

正式ループ:

```text
REQUEST
→ DISCOVER EXISTING ASSETS
→ RESTORE STATE
→ DEFINE GOAL + DONE CONDITIONS
→ PLAN
→ EXECUTE
→ VERIFY
→ PASS?
   ├─ YES → AUDIT
   │          ├─ PASS → COMPLETE / WAIT_USER
   │          └─ FAIL → DIAGNOSE → RECOVER → VERIFY
   └─ NO  → DIAGNOSE → RECOVER → VERIFY
```

安全な回復経路を使い切った場合だけ `FAILED_SAFE` で終了する。

## 既存資産との対応

重複機能は作らない。

- Durable State:
  - job内の機械可読state/result
  - Factory Core既存 `state/` 領域
  - GitHub横断運用は既存 Issue #232 ProjectY HQ recovery state
- Source / rollback:
  - `tools/factory-core/factory_store.py` のsnapshot / manifest / restore
  - job単位ではclean start headへrollback
- Recovery / watchdog:
  - 既存 ProjectY HQ Autopilot のfailure classification / bounded recovery
- Completion supervision:
  - 既存 `.github/scripts/projecty-development-supervisor.cjs`
- Audit:
  - jobの独立 `audit_commands`
  - PR diff / current-head CI / runtime evidence
- Product truth:
  - 対象コード、tests、logs、GitHub状態、physical iPhone / production evidence

## Durable State

`yos_loop_engine.py` は実行途中でも復元できるstateを原子的に書き出す。

最低限保持するもの:

- 目的
- 完成条件
- 現在phase / current state
- 実行済み作業
- Verify結果
- Audit結果
- failure history / fingerprint / failure reason
- next action
- attempt count / same-failure count
- unknowns / human gates
- runtime evidence
- scope / budget
- rollback結果
- terminal state

`--state` を指定した場合、そのJSONを再開stateとして使う。
既存呼び出しとの互換のため `--state` 未指定時は `--result` をstateとして兼用できる。

Factory Coreのlocal storeを使う運用では、別DBを作らず既存storeの `state/` 配下へ置く。

再開時は次を照合する。

- job id / job contract hash
- recorded head
- workspace fingerprint

外部から状態が変わっていた場合は、推測で続けず `FAILED_SAFE` とする。

## Machine-checkable Done Conditions

「AIが完成したと思った」は完成条件にしない。

jobは最低限:

- `verification_commands`
- `audit_commands`

を持つ。

必要に応じて対象job側で以下をVerify/Auditへ組み込む。

- unit / integration test
- build
- type check
- lint
- schema validation
- expected-output comparison
- GitHub current-head state
- artifact signature
- runtime evidence

physical iPhone / productionなどAIだけで確認できない条件はhuman gateとして保持し、
未確認のまま `COMPLETE` にしない。

## Maker / Checker / Audit

役割は分離する。

- Maker: `implementation_command`
- Checker: `verification_commands`
- Audit: `audit_commands`

Auditは必須で、Checkerと同じcommand集合は契約エラーにする。

Auditは説明ではなく、実物、diff、test、log、runtime evidenceを優先して判定する。

## Automatic Recovery

VerifyまたはAuditが失敗したら、ユーザーへ返す前に失敗を記録して回復を試す。

strategy kind:

- `retry`
- `fix`
- `alternative`
- `rollback`

各strategyは:

- name
- kind
- command
- 対応failure class
- strategyごとの上限

を持つ。

同一failure fingerprintが続いた場合、同じstrategyの繰り返しではなく、
利用可能なら別strategyを優先する。

回復時は以下を環境変数で渡す。

- `YOS_LOOP_ATTEMPT`
- `YOS_LOOP_JOB_ID`
- `YOS_LOOP_FAILURE_JSON`
- `YOS_LOOP_RECOVERY_KIND`
- `YOS_LOOP_RECOVERY_NAME`

これにより、直前の失敗を見ずに同じ修正を繰り返すことを避ける。

## Hard Stop / Budget

無限ループ防止のため、job全体にhard budgetを持つ。

既定値:

- total recovery: 4回
- same failure: 2回
- active execution: 600秒
- changed paths: 40

実装上のhard maximum:

- total recovery: 6回
- active execution: 3600秒
- changed paths: 500

scope違反 / forbidden path / change budget超過はfail closed。

safe routeを使い切った場合、clean startで始めたjobはstart headへ戻し、
workspaceがcleanへ戻ったことを確認してから `FAILED_SAFE` にする。

## Terminal States

最終状態は必ず次のどれか。

### COMPLETE

- Verify PASS
- independent Audit PASS
- human gateなし
- scope / budget OK

### WAIT_USER

AI側で可能な実装・Verify・Auditは完了したが、
本人にしかできない操作・判断・承認・real-world確認が残る。

例:

- physical iPhone
- production verification
- irreversible change
- production publish
- external send
- purchase / charge
- delete
- credential change
- major data change
- value judgment

本人へ返すのは、この最後の最小操作だけ。

### FAILED_SAFE

- safe recoveryを使い切った
- hard budget到達
- contract / resume stateが不正
- scope安全性を維持できない

既存の正常状態を壊したまま止めない。
rollback検証結果をstateに残す。

## Human Gate

Loop Engine自身は以下を勝手に承認しない。

- 不可逆変更
- 本番公開
- 外部送信
- 購入・課金
- 削除
- 資格情報変更
- 重大な既存データ変更
- 本人の価値判断
- physical iPhone確認
- production確認

ここへ到達する前の準備・実装・機械検証は可能な限り先に完了させる。

## Learning From Failure

failureごとに次をstateへ残す。

- failure class
- phase
- fingerprint
- same-failure count
- 選んだrecovery strategy
- recovery result
- 再Verify / Audit結果

新しいfailure DBは作らない。
job stateと既存Issue #232 / PR / Audit evidenceを再利用する。

## Observability

ユーザー向けには内部ログを大量表示しない。

内部には後から追跡できるruntime evidenceを残す。

各実行commandについて:

- role
- phase
- argv
- exit code
- duration
- timeout
- stdout/stderr tail

を記録する。

## Self-test

`tools/factory-core/tests/test_yos_loop_engine.py` で最低限次を検証する。

A. 一発で成功 → Audit後だけ `COMPLETE`
B. 一度失敗 → fix → 再Verify → Audit → `COMPLETE`
C. 同一失敗継続 → alternativeへ切替 → `COMPLETE`
D. physical iPhone gate → `WAIT_USER`
E. Verify PASSでもAudit FAIL → `COMPLETE`にしない
F. recovery budget到達 → rollback確認 → `FAILED_SAFE`

追加で:

- session cut後のdurable state復元
- scope violation fail-safe
- Checker/Audit同一command拒否

を検証する。

GitHub Actions `One Enter Factory Core` ではunit/self-testに加え、
意図的なVerify failure → automatic repair → Verify → independent Audit のsynthetic E2Eを実行する。

## One Enter実行原則

One Enterは単発回答を返すagentではない。

目的は「回答したこと」ではなく、
**目的が達成されたruntime evidenceがあること**。

実行中は常に次を維持する。

- 目的は何か
- 完成とは何か
- 現在どこまで終わったか
- 何が未確認か
- 直前の実行結果は何か
- failure原因は何か
- 同じ失敗を繰り返していないか
- 次に成功確率が高い行動は何か
- 既存資産で代替できないか
- ユーザーへ戻さず進められないか
- COMPLETEと呼べる証拠が本当にあるか

禁止:

- 未実行を実行済みにする
- 未確認を確認済みにする
- Verify/Audit失敗状態でCOMPLETEにする
- 同じ失敗を理由なく繰り返す
- 既存資産を見ずに新設する
- 本人に不要な作業を返す
- 説明を書いただけで実装完了とする
- physical verificationを推測で代筆する
- 無限ループする
- human gateを勝手に通過する

## 実行例

```bash
python3 tools/factory-core/yos_loop_engine.py \
  --job /path/to/job.json \
  --repo /path/to/ProjectY \
  --state /path/to/OneEnterFactory/state/job.json \
  --result /tmp/yos-loop-result.json
```

終了コード:

- `0`: `COMPLETE` / `WAIT_USER`
- `1`: `FAILED_SAFE`

## 完成判定

このLoop Engine自体も同じ原則で判定する。

- code existsだけでは不十分
- current-head testsが必要
- A-F self-testが必要
- independent Auditが必要
- AGENTS / ProjectY開発指示とruntime実装が一致している必要がある
- 実機確認が必要な対象jobは実機確認前にCOMPLETEにしない

目標は:

```text
「これ作って」
↓ Enter
One Enter
→ restore
→ discover
→ execute
→ verify
→ recover if needed
→ audit
→ COMPLETE / WAIT_USER / FAILED_SAFE
```

である。
