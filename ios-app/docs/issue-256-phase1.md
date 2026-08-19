# Issue #256 YOS Capture Phase 1

## Scope

YOS Capture is part of the existing YOS iOS app. It is not a separate app or personality. The implementation is stacked on PR #255 so the BRAVIA foundation remains the single base.

## Entry paths

- Voice: Action Button → Shortcut “Dictate Text” → `SaveYOSCaptureIntent`.
- Text: YOS home → “今のことを残す” → focused capture field → save.
- The capture screen asks for no category, stage, meaning, or other metadata.

Apple’s public App Intents and App Shortcuts APIs are the only voice shortcut boundary. Side Button conversational-app replacement and private recording APIs are not used.

## Raw-first boundary

1. `YOSRawCapture` is written to the native repository with `status=captured`.
2. Only after the write succeeds does deterministic classification run.
3. Classification fields never replace `rawText`.
4. Classification failure returns the already-durable raw record.
5. AI and network access are not part of the save transaction.

The repository prefers App Group `group.jp.yos.onlysystem`. Until the entitlement is enabled in the generated Xcode target, the app and its bundled App Intent use Application Support. A Widget/Control extension must not be shipped until the App Group entitlement is confirmed on every target.

## Classification and external writes

- `手洗い石鹸` becomes a Shopping candidate. It is not silently asserted as a purchased item.
- `来週火曜14時 歯医者` becomes a Calendar candidate with a parsed local date/time.
- Ambiguous phrases remain `needs_review` and are not applied.
- Calendar/Reminders application is a separate explicit plugin operation.
- EventKit permission, a selected calendar/list, and an idempotency marker are required.
- `captureID`, `applyAttemptID`, `appliedRecordID`, and `YOS-CAPTURE-ID:` prevent blind duplicate creation and support recovery.
- External-write failure leaves the raw record and returns it to `needs_review`.

Before EventKit application is enabled in a signed target, add these usage descriptions:

- `NSCalendarsFullAccessUsageDescription`
- `NSRemindersFullAccessUsageDescription`
- `NSCalendarsUsageDescription` and `NSRemindersUsageDescription` while iOS 16 remains supported

## BRAVIA conflict resolution

PR #255 was synchronized to latest main at `2f406202ee530eb195a2be2769a7829801ce6a18`. Its ten BRAVIA files were preserved and main became an ancestor. This Phase 1 branch starts at that commit and its Draft PR targets the PR #255 branch, so the review diff contains Capture only. Retarget to `main` after PR #255 merges.

## Verification boundary

Automated checks cover raw-first order, offline classifier failure, deterministic examples, ambiguous input, no web-storage fallback, data-field separation, EventKit safety markers, App Intent presence, generated web assets, and the iOS build candidate.

Physical iPhone 17 is still required to verify Action Button operation count, keyboard focus, App Intent discovery, offline persistence, restart recovery, Calendar/Reminders permission prompts, idempotency, and no regression in YOS/BRAVIA/Taxi/Life/HJ. Until then, iPhone completion and production completion remain unverified.
