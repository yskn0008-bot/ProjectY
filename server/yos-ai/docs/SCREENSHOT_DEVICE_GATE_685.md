# Integration dependency (updated 2026-11-13)

Notification/Inbox PR #692 and Night/diary PR #701 are now merged. This draft targets main and preserves all 11 published installer entries, including DAYSTREAM and both diary modules, adding Screenshot Bridge only (12 total in the candidate). The intake function preserves notification, inbox-sort, screenshot, model, mirror and factory routes. Combined TypeScript/Node/API tests: 381/381 PASS; iOS/installer: 187/187 PASS on main 5490d524 plus this candidate.

Screenshot release remains blocked by the exact-image and device gates below. The bridge is a draft catalog entry, not a published update. Automated checks do not prove real image binding, Notion file permissions, phone automation, or classification.

# Screenshot automation: device integration gate (2026-11-12)

Apple confirms iOS screenshot automations fire when a screenshot is **saved** to Photos, Files or Clipboard, not merely when a button is pressed. Source: https://support.apple.com/en-tj/guide/shortcuts/apd932ff833f/ios

## Verified development state
- Server screenshot route and mock tests exist. Current combined test counts are recorded above; hosted CI evidence is attached to PR #685.
- iOS Scriptable bridge exists as draft only; no signed Shortcut, no published installer registration, no physical-device E2E.
- Notion classification is not implemented; server returns classification: pending.
- Do not merge/deploy/enable until user-approved release and a disposable screenshot proves exact image matching.

## Capture binding (fail closed)
1. Reuse the existing Screenshot -> Photos automation. Keep the unrelated Notification automation unchanged.
2. Obtain the screenshot *from the automation input* if iOS provides the actual image. If it does not, prefer a scoped 'Get Latest Screenshots' query with count 1 **and verify its creation timestamp against the trigger**. Reject empty/multiple/old/ambiguous results. Never use 'Get Latest Photos' or the clipboard as a fallback.
3. Convert the selected screenshot to JPEG for transport if over 3 MB, without changing/deleting the original. Keep MIME and bytes consistent.
4. Generate a stable capture ID for retries, capturedAt ISO 8601, source=ios-screenshot, saveLocation=photos, mimeType and base64 image. Pass JSON to YOS Screenshot Bridge through Run Script. Use existing Clarity credential via Keychain, never embed a token in source.
5. A 200/201 response with inboxSaved=true is the only silent success. 409 ambiguous outcome must NOT be retried blindly. Other failures notify once, preserving originals.
6. Confirm the Notion image block exists with the expected image and ID before calling the save verified. Classification requires its own separate read-back.

## Device acceptance
- Screenshot by hardware buttons; no manual Save; automation starts silently.
- Notion Inbox receives exactly the screenshot taken, not an older or unrelated photo.
- Second invocation with the same captureId produces no duplicate.
- Network off -> error notification, original stays in Photos.
- Screenshot >3MB -> safe conversion or error notification, original unchanged.
- Classification to existing targets and status tracked independently.
