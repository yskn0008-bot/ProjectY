# Flow Shortcuts canonicalization audit — 2026-10-03

## Purpose

Canonicalize the existing iPhone Shortcut Flow lane without inventing a new Flow system.

Target names:

- Morning Flow
- Home Flow
- Work Flow
- Out Flow

The device implementation is authoritative when GitHub does not contain an exact matching Shortcut source/artifact. Existing Flow behavior must not be reconstructed from names.

## One Enter contract

- Start base: `d2bdf3d895b4f44b0117c5002b714b647164c919` (`main` at branch creation)
- Working branch: `one-enter/flow-shortcuts-canonicalize-20261003`
- Main direct changes: prohibited
- Existing systems to reuse: Shortcut Factory / Cherri / HubSign, Morning / Night, Focus, MY REMOTE, Clarity, Life
- Forbidden: inventing Flow behavior, creating a second Flow router/system, copying shared behavior into multiple Flows, replacing the existing Morning Flow from a guessed reconstruction
- Current main advanced by two unrelated `data/mission-control.json` commits after branch creation; no Flow/Factory overlap, so no rebase-only churn is required.
- Terminal state for this pass: `WAIT_USER` if physical iPhone Shortcut export is the only remaining source of truth

## Evidence restored from current main

### Morning Flow

Confirmed current evidence:

- `data/yos-assets.json` marks Morning Flow complete and device/production verified.
- Current operational chain is recorded as parent `Morning → Morning Brief + Morning Flow → YOS Today Note`.
- Morning Brief has a native-only implementation and existing Cherri/HubSign signing path.
- The Life Morning/Night handoff from PR #377 is merged as commit `33b4dbadae50e495972af96ccb940a9ba32df98a`.
- `life/daily-flow-orchestrator-v1.js` owns the existing Night→next-day preparation handoff and must be reused rather than copied.
- No exact `Morning Flow.cherri`, `Morning Flow.plist`, or `Morning Flow.shortcut` canonical file was found on current main.

Decision:

- Do not rebuild Morning Flow.
- Preserve the existing iPhone implementation as the current runtime truth.
- Recover its exact device Shortcut in the same device-export pass used for the other Flow Shortcuts, so GitHub can become an exact source of truth without changing behavior.

### Home Flow

Current main contains references to the name (notably the generic Shortcut Builder Focus recipe), but no exact canonical Shortcut source/artifact matching the current iPhone implementation was found.

Role, trigger, actions, YOS calls, Focus relation, duplicate suppression, and fail-safe behavior are therefore **unconfirmed** and must not be inferred.

### Work Flow

Current main contains references to the words, but no exact canonical Shortcut source/artifact matching the current iPhone implementation was found.

Role, trigger, actions, YOS calls, Focus relation, duplicate suppression, and fail-safe behavior are therefore **unconfirmed** and must not be inferred.

### Out Flow

Current main contains references to the name (including the generic Shortcut Builder Focus recipe), but no exact canonical Shortcut source/artifact matching the current iPhone implementation was found.

Role, trigger, actions, YOS calls, Focus relation, duplicate suppression, and fail-safe behavior are therefore **unconfirmed** and must not be inferred.

## Existing shared assets that must be reused

- Morning Brief / parent Morning: keep current operational route.
- Life: reuse `life/daily-flow-orchestrator-v1.js` for the existing Morning/Night handoff.
- Night: do not duplicate nightly work already owned by Night Brief / Night Reset.
- MY REMOTE: call existing remote assets; do not copy device-control logic into a Flow.
- Clarity: call existing Clarity route only if the recovered device Shortcut already does so; do not invent a new router.
- Focus: preserve the recovered device relationship exactly; Focus behavior must be read from the real Shortcut/Automation rather than inferred from Flow names.
- Shortcut Factory: reuse pinned Cherri + existing `tools/clarity-factory/sign_with_hubsign.py` + AEA1 validation pattern. Do not add a competing signer.

## Canonicalization rules after device recovery

For each recovered Flow:

1. Keep an untouched recovery copy for provenance.
2. Inspect the actual action graph before creating/editing any source representation.
3. Record:
   - trigger
   - executed actions
   - existing YOS child Shortcuts / Scriptable assets called
   - Focus relationship
   - duplicate-run prevention
   - fail-safe / stop behavior
4. Extract common behavior only to an **already existing** shared child Shortcut/adapter where one exists. Do not create a new shared router merely to reduce duplication.
5. If a source representation can be generated without behavior change, place it in the existing Shortcut Factory build lane.
6. Compile with the pinned Cherri path where applicable.
7. Validate action identity and no-secret constraints.
8. Sign using the existing HubSign boundary only for secret-free artifacts.
9. Verify AEA1 artifact output.
10. Compare generated behavior against the recovered device original before any replacement is proposed.
11. Keep replacement/import as a physical-iPhone gate; never claim device equivalence from CI alone.

## Completion matrix at this checkpoint

| Flow | Runtime truth recovered | Exact GitHub canonical source/artifact | Factory compile/validation/sign | Device equivalence |
|---|---|---|---|---|
| Morning Flow | Yes — current iPhone operation evidenced | No exact file found | Not run; rebuilding is prohibited without recovery | Existing runtime verified; source equivalence pending export |
| Home Flow | No | No exact file found | Blocked by missing device source | Pending |
| Work Flow | No | No exact file found | Blocked by missing device source | Pending |
| Out Flow | No | No exact file found | Blocked by missing device source | Pending |

## Human gate

Only the iPhone can provide the missing authoritative Shortcut implementations.

Required recovery batch: export/share the current device Shortcuts **Morning Flow, Home Flow, Work Flow, Out Flow** as files into the same ChatGPT conversation.

After that single batch, One Enter can continue on this same branch through exact recovery → deduplication → Factory build/validation/signing/artifacts → Verify → independent Audit, without asking for the same information again.

