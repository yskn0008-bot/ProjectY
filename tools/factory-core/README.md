# One Enter Factory Core v1

目的は **GitHub / Vercel が止まっても開発そのものを止めないこと**。

## 正本と停止しない作業領域

正式なコード・Issue・PR・試験・配布版の正本はGitHub。Factory Coreの `local_store` は、GitHub/Vercelが一時停止しても実装・検証・rollback準備を続けるための既存の作業snapshot / resume領域であり、第二の正式SSOTにはしない。Vercelは必要なserver機能のhostであって開発の進行条件にはしない。

`state/current.json` の **current snapshot** は作業中の復元点を表す。各 snapshot は全ファイルの SHA-256 manifest を持つため、外部待ちの間も履歴、差分、検証、rollback準備を継続できる。外部が復旧したら、検証済み成果だけをGitHub正本へ着地する。

## 自前化した機能

- ソース保管: snapshot ZIP
- 変更履歴: immutable history + manifest
- 正式版: current snapshot pointer
- 差分: manifest diff
- 破損検査: per-file SHA-256 verification
- Rollback: verified snapshot restore
- Artifact保管: local store / export
- Provider切替: provider health + deterministic fallback
- GitHub: optional mirror
- Vercel: optional host

公開URLだけはネット上のhostが必要なので、外部サービスを完全には消さない。重要なのは **host障害を開発停止理由にしない** こと。iPhone向けには `iphone_bundle` を独立した配布fallbackとして扱う。

## Store

```bash
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory init
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory snapshot /path/to/ProjectY --label current
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory verify
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory list
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory diff OLD_ID NEW_ID
python3 tools/factory-core/factory_store.py --store /path/to/OneEnterFactory restore /path/to/restore-target SNAPSHOT_ID
```

Secrets (`.env`, signing keys, certificates, provisioning profiles) and build caches are excluded from snapshots by default.

## Provider fallback

```bash
python3 tools/factory-core/provider_router.py select source_store
python3 tools/factory-core/provider_router.py select qa_runner
python3 tools/factory-core/provider_router.py fail public_host github_pages "rate limit"
python3 tools/factory-core/provider_router.py wait api_host vercel "rate limit"

`wait` is the One Enter PARTIAL/external-wait path. It does **not** create `WAIT_USER`.
If another enabled provider can satisfy the same role, the router returns
`status=alternative_routed` and `action=execute_alternative` immediately.
Only when no eligible alternative remains does it return `status=external_wait`
so the current route can be parked and rechecked later. Human-only gates remain
separate from provider waiting.

```

A provider failure returns the next eligible route instead of `stop` when another route exists.

## YOS Loop Engine

`yos_loop_engine.py` is the bounded execution loop inside the existing One Enter / Factory Core path.

```text
Restore state
→ Execute
→ Checker Verify
→ PASS? yes → independent Audit
→ Audit PASS? yes → COMPLETE or WAIT_USER
→ otherwise Diagnose
→ Fix / Retry / Alternative / Rollback
→ Verify again
→ FAILED_SAFE when the safe budget is exhausted
```

### Existing state is reused

The engine does not introduce a second project or product SSOT.

- The machine-readable loop result doubles as the resumable job state via `--state` (or `--result` for backward-compatible callers).
- When Factory Core is used with its local store, keep this file under the existing store `state/` area rather than inventing another database.
- Cross-runner GitHub orchestration continues to use the existing Issue #232 ProjectY HQ recovery state.
- Product/runtime truth remains in the applicable code, tests, logs and real-device evidence.

The durable state records the goal, done conditions, current phase, executed work, verification and audit results, failure history, next action, attempt counts, unknowns, runtime evidence and terminal state. Resume is fail-closed if the job contract or workspace changed outside the recorded state.

### Done, Checker and Audit

- `verification_commands` are machine-checkable Checker conditions.
- `audit_commands` are mandatory and must be distinct from verification commands.
- `COMPLETE` is possible only when both Verify and independent Audit pass and no human gate remains.
- Physical iPhone or本人承認が必要なproduction evidenceはnever inventedし、真のhuman gateだけ `WAIT_USER` にする。
- GitHub Actions / Vercel / provider rate limitなど本人操作で解決しない待ちは `EXTERNAL_WAIT` としてIssue #232側へparkし、別の独立作業を続ける。`EXTERNAL_WAIT` はLoop Engineの第4terminal stateではない。
- Runtime evidence contains the exact argv, exit code, duration and bounded stdout/stderr tail for executed checks.

### Automatic recovery and hard stops

Recovery strategies are explicit and ordered: `retry`, `fix`, `alternative`, or `rollback`.

- Same failure fingerprint is counted across retries.
- Repeating the same failed recovery reaches a threshold and switches to another eligible strategy when one exists.
- Total recovery attempts, same-failure repeats, active execution time and changed-path count all have hard caps.
- Scope or forbidden-path violations fail closed immediately.
- If safe routes are exhausted, the engine rolls a clean-start workspace back to the recorded start head and returns `FAILED_SAFE`.

### Terminal states

- `COMPLETE`: machine done conditions and independent Audit passed; no human gate remains.
- `WAIT_USER`: code/Audit are ready, but a physical-device, production, approval, credential, purchase, publish, delete, major-data or value-judgment gate remains.
- `FAILED_SAFE`: safe recovery/budget is exhausted or the execution contract/state is unsafe; the original clean state is restored when rollback verification succeeds.

The engine itself never authorizes merge, production publication, purchase, external send, credential changes, destructive deletion, major data mutation or physical-device confirmation.

Details: `docs/YOS_LOOP_ENGINE_v1.md`

Example:

```bash
python3 tools/factory-core/yos_loop_engine.py \
  --job /path/to/job.json \
  --repo /path/to/ProjectY \
  --state /path/to/OneEnterFactory/state/job.json \
  --result /tmp/yos-loop-result.json
```

## Test

```bash
python3 -m unittest discover -s tools/factory-core/tests -v
```

## Boundary

Apple signing / App Store distribution, public DNS/hosting, credentials/2FA and physical iPhone verification still require their real external boundary. They are adapters around Factory Core, not the Factory Core itself.

## iPhone local fallback

`YOS_Local_Fallback.js` is a self-contained Scriptable entry that does not fetch GitHub Pages or Vercel. On first run it creates local state files under `iCloud Drive/Scriptable/One Enter Factory/state/` and renders the YOS asset dashboard from those files. This is a fallback route, not a claim that the signed native YOS app has been installed.
