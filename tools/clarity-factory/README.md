# Clarity — parent + fixed child Shortcut architecture

Clarity is the single iPhone natural-language entry point for YOS. Daily operation does **not** depend on creating, signing, importing, or generating a new Shortcut at runtime.

## Official runtime

```text
Action Button
→ Clarity
→ voice / natural language
→ Raw First (Clarity Inbox.txt)
→ intent understanding
→ fail-closed Safety / Router
→ fixed YOS child Shortcut when required
→ iPhone action
→ Verify
→ Clarity Ledger.txt
```

Clarity is the command layer. Fixed `YOS_*` Shortcuts are execution hands.

## First fixed child: YOS_OpenApp

`open_app` is delegated to the fixed child `YOS_OpenApp`.

Current supported canonical app targets are:

`safari, shortcuts, files, notes, phone, reminders, mail, music, calendar, maps, contacts, health, photos, appstore, facetime, chatgpt, scriptable, youtube, spotify, google_sheets`

The parent does not embed app-opening actions. It calls `YOS_OpenApp` with the canonical target and writes `APPLIED open_app ... child_returned` plus `REQUEST_DONE` only after Run Shortcut returns control. If the child or its Open App action errors, Shortcuts stops before the success record. Unknown app targets remain fail-closed.

For the first physical acceptance, use exactly:

`Safari開いて`

Required device result:

```text
Action Button
→ Clarity voice input
→ open_app / safari
→ YOS_OpenApp
→ Safari opens
→ YOS_OpenApp returns after issuing Open App
→ APPLIED open_app safari YOS_OpenApp child_returned
→ REQUEST_DONE
```

Code/CI success is not device PASS.

## Existing Clarity behavior retained

The parent keeps the existing Raw First, ChatGPT intent understanding, fail-closed policy, Ledger, Calendar, Reminder, Task, Shopping, Idea, MY WAY handoff, local device-setting executor, and voice input behavior. For one-enter use, voice capture now auto-finishes after a pause instead of waiting for a second tap. Existing local destination readback/persistence patches remain in the build.

## Shortcut Factory boundary

Shortcut Factory remains in the repository as a separate development lane, including its code, signing path, PoC, API, tests, and history.

It is **not** a normal Clarity executor and is **not** injected into the user-facing Clarity artifact. Normal daily Clarity does not call HubSign, generate a child Shortcut, open Shortcuts for import, or require a Factory token.

Factory assets are retained for future requests whose purpose is explicitly to create new automation.

## Safety

- Raw First is persisted before AI interpretation.
- The model can only plan actions; it cannot claim execution.
- Unknown executors and unknown app targets fail closed.
- High / irreversible / external-write operations keep confirmation boundaries.
- Calendar / Reminder ambiguous dates remain review-required.
- No Factory network/sign/import path exists in the normal parent artifact.
- `YOS_OpenApp` is local-only and fixed-name.
- Voice capture auto-finishes after a pause; no second tap is required for the first Safari acceptance command.\n- Physical iPhone behavior is the final authority for device PASS.

## Build / verification

The fixed-child workflows compile and sign both artifacts:

- `Clarity-signed.shortcut`
- `YOS_OpenApp-signed.shortcut`

Automated checks cover source contracts, model contract, Cherri compile, Raw First ordering, fixed-child dispatch, Factory isolation, local executor preservation, secret scanning, HubSign signing, and AEA1 envelope validation.

See `IPHONE_OPERATION_COVERAGE.md` for device-PASS-based coverage.
