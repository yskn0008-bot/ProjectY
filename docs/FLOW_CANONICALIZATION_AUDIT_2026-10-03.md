# Flow canonicalization audit — 2026-10-03

## Goal

Canonicalize the existing iPhone Flow shortcuts without creating a replacement Flow system.

Scope:

- Morning Flow
- Home Flow
- Work Flow
- Out Flow

Rules kept:

- Do not rebuild Morning Flow.
- Do not infer Home / Work / Out behavior from their names.
- Reuse existing child Shortcuts/adapters instead of copying shared processing into each Flow.
- No direct changes to main.
- Physical iPhone acceptance remains a human gate.

## Sources audited

Current ProjectY main and related history were checked together with the current Shortcut Factory / Factory Core, Morning / Night, Focus-related assets, MY REMOTE, Clarity, Life, current Project/Library Shortcut files, and Drive search.

Relevant established assets include:

- existing parent Morning path
- Morning Brief
- YOS Today Note
- Morning Flow / Night Reset Life handoff already merged to main
- Shortcut Factory / Cherri / HubSign assets
- MY REMOTE / Clarity / Life assets

No new router, Flow engine, DB, or SSOT is introduced by this branch.

## Morning Flow — recovered, not rebuilt

A current exported `Morning Flow.shortcut` was recovered from the existing Project file surface.

Exact artifact identity:

- SHA-256: `c5eea8d5dd144733e14c3d3ca12f5f16f259316c64b7f1039f8eb3559004a9c0`
- bytes: `26444`
- AEA magic: `AEA1`
- signed-only profile: `0`
- embedded Shortcut plist size: `9971`
- archive size: `26444`

The existing visual implementation was also recovered. It does the following:

1. Find the next Calendar event beginning within the next 1 day.
2. Sort by start date ascending and keep one event.
3. If an event exists, calculate minutes from now until its start.
4. More than 90 minutes: existing “余裕あり” notification.
5. Otherwise, more than 45 minutes: existing “少し急ぐ” notification.
6. Otherwise: existing “急ぐ” notification.
7. If no event exists: existing “今のところ急ぐ予定はありません” notification.

Current relationship:

- trigger/orchestration: existing parent `Morning`
- parent siblings: `Morning Brief` and `YOS Today Note`
- Focus: handled by the existing parent Morning gate; no new Focus router is added
- direct YOS child calls from Morning Flow: none recovered; Calendar is read directly
- duplicate handling: no second automation is added; the confirmed parent Morning path remains the only adopted call path
- failure safety: read-only Calendar lookup + local notification only; no data write or irreversible operation added

The signed artifact is stored in Factory Core as a compressed base64 recipe and reconstructed byte-for-byte only for validation/artifact packaging. It is not recompiled or re-signed, because doing so would replace the current iPhone implementation rather than adopt it.

## Home Flow / Work Flow / Out Flow — source recovery required

Current ProjectY main does not contain a canonical source/artifact matching the current iPhone copies of these three shortcuts.

No exact current exports were found in the accessible Project/Library Shortcut files or Drive search.

Historical/generic references are not sufficient evidence of the current iPhone implementation, so this branch deliberately does not create replacements.

State:

- Home Flow: `WAIT_USER_RECOVERY`
- Work Flow: `WAIT_USER_RECOVERY`
- Out Flow: `WAIT_USER_RECOVERY`

Required recovery input: the exact current `.shortcut` export of each shortcut from the iPhone.

## Factory path

Existing Factory Core is reused.

`tools/factory-core/flow_sources.json`
: records recovered vs missing source state and the runtime contract that is actually evidenced.

`tools/factory-core/recover_flow_artifact.py`
: reconstructs the recovered signed artifact, validates SHA/AEA metadata, and fails closed for missing Flow sources.

`tools/factory-core/tests/test_flow_sources.py`
: prevents a missing Home / Work / Out source from silently turning into an invented implementation.

The existing `.github/workflows/factory-core.yml` already runs all Factory Core unit tests on this branch, so no second Flow CI system is added.

## Completion boundary

This branch cannot truthfully define trigger/actions/Focus/duplicate/failure behavior for Home / Work / Out until their current iPhone artifacts are recovered.

After those three exports are supplied, the same branch can continue:

recovery → exact-source inspection → duplicate/common-processing audit → minimal repair only where evidenced → Factory validation → signed artifact handling → Verify → independent Audit → PR readiness → one final physical iPhone acceptance batch.
