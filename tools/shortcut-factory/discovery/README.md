# YOS DISCOVERY – isolated implementation / preflight candidate

Status: **development only; not installed, not signed, not production-ready**.

## What exists
- `discovery-core.mjs`: JST daily execution ID, three-domain coverage contract, verified-source metadata gate, hypothesis labeling, bounded 3 total attempts, durable readback-before-write, no blind append retry after uncertain response, dedupe and at-most-once notification adapter.
- `discovery-adapters.mjs`: fixed public Europe PMC queries and actual full-text retrieval path; private Notion single-block record adapter with complete pagination and exact readback. The full-text body is represented as a bounded excerpt, not independent semantic fact-checking.
- `YOS DISCOVERY 実行検証 TEST.cherri`: separate, temporary preflight candidate using existing JOURNAL Scriptable inline + isolated ChatGPT Text action; real public source ID roundtrip and local-only receipt. It does not run daily research, write Notion, notify, or install any new trigger.
- `patch_preflight.py` and `build_preflight.sh`: existing Factory Cherri v2.3.0 / secret scan / existing signer reuse. No new signer, installer, workflow, database, API contract, or provider.
- Source-level V8 mock tests: core 15, adapters 8, preflight 5. Exact fetched core and adapter source re-tested after hardening. Actual node module execution, Cherri compilation and patched plist verification are **not yet verified**.

## Before any active distribution
1. Run existing Factory lane in a Cherri v2.3.0 environment:
   `bash tools/shortcut-factory/discovery/build_preflight.sh /tmp/discovery-output`.
   This produces an unsigned diagnostic only if compile and structure gates pass. The optional explicit `--sign` uses the existing signer and requires the same existing safe signing authorization. Do not offer unsigned files for iPhone installation.
2. Physical iPhone: unique TEST name, model action with FollowUp off, background/locked invocation, permission prompts, local receipts, exact parameter handoff, network failures. Keychain presence is **not** token validity or Notion authorization.
3. Bind private destination and existing credentials at runtime only, verify permission and precise target with existing Notion page. The adapter is not connected; prior history comparison requires real history provider. No private raw data or page identifiers in published source, no source-type impersonation via Clarity.
4. Implement and prove a device exclusive lock + durable local receipt storage (the mock lock is not proof of iOS concurrency). Require real current-day detection and safe trigger wiring. The production model adapter must verify all three domains with appropriate approved context and public official sources, separate personal fact from hypothesis, cross-check claims and limitations, and avoid unsupported claims; the current public-paper collector is not full three-domain research.
5. Reuse existing receiving notification only after validated valuable finding and Notion readback; prove end-to-end delivery and no duplicates against the old automation. Keep existing scheduled research enabled until replacement accepted.
6. Prepare the real, separately reviewed formal Shortcut via existing Factory. Do not register the TEST candidate as the production Shortcut. Do not merge to main or modify the current installer catalog or automation while gates remain.

## Recovery / scope
Only files in this directory are added. No existing runtime, JOURNAL, Clarity, notification, installer catalog, or stored data changed. Revert by leaving this branch unmerged; no iPhone changes occurred. A lost Notion write reply is readback-only, never blindly resent. Incomplete coverage is not a successful no-finding. External source and model semantic review are separate from transport evidence checks. One valid result is a hypothesis, not a personal measured effect.

Base: e4bfb3d7fd2f2391db627a73f8d3fda1740053ec.
