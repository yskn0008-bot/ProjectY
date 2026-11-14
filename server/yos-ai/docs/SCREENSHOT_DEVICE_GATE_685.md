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
2. Only accept a dictionary containing the actual trigger-bound original image bytes, stable captureId, actual capturedAt, source and actual saveLocation. An Image object alone, latest-photo query or clipboard fallback is rejected; it cannot prove the event identity/location and may alter bytes. No physical-device proof that all three triggers supply this dictionary exists yet.
3. Preserve original encoding. The bridge no longer silently JPEG-recompresses images. Over 3 MB fails closed with the original untouched. No fidelity change is approved by this candidate.
4. Pass that dictionary/JSON to YOS Screenshot Bridge. Reuse the existing Clarity Keychain credential. Never embed a token. The bridge persists and reads back a private local pending payload before HTTP; an ID collision with different data stops before sending. It does not drain unrelated pending images automatically or delete local source/pending data.
5. A 200/201 response with inboxSaved=true, matching captureId, imageBlockId, metadataBlockId and imageSha256 means server-side byte-for-byte Inbox readback succeeded. It is not classification completion. 503 retries once with identical payload. Network uncertainty/409 retains the payload and does not blindly retry.
6. Server binds captureId permanently to a SHA-256 of the image and event metadata, and keeps owner-bound append receipts without expiry. Repeated successful calls re-read the stored image and metadata. Uncertain append calls scan at most 1,000 Inbox blocks, require exactly one matching metadata/image pair, then verify parent and image bytes before reconciling. No match/ambiguity/outage remains held without another append.
7. Classification is still pending: the existing Clarity text sorter does not parse screenshots, and no image OCR/classifier is currently connected. Do not publish, mark complete, or manufacture routing decisions from image filenames/metadata. Existing destinations in Issue #683 are Shopping/Money/Tasks/Life Log; no new destination is authorized here.

## Device acceptance
- Screenshot by hardware buttons; no manual Save; automation starts silently.
- Notion Inbox receives exactly the screenshot taken, not an older or unrelated photo.
- Second invocation with the same captureId produces no duplicate.
- Network off -> error notification, original stays in Photos.
- Screenshot >3MB -> safe conversion or error notification, original unchanged.
- Classification to existing targets and status tracked independently.
