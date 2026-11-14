# Screenshot intake #683 — draft integration

## Current state
Draft PR only. No production deployment or iPhone acceptance. Do not merge until the acceptance gates below pass.

The existing `POST /api/yos/intake?mode=screenshot` draft route accepts an authenticated JSON payload with:
```json
{
  "source": "ios-screenshot",
  "saveLocation": "photos",
  "captureId": "screenshot-20261112-090000-0001",
  "capturedAt": "2026-11-12T09:00:00+09:00",
  "mimeType": "image/png",
  "imageBase64": "<base64 encoded screenshot>"
}
```

`saveLocation` can be `photos`, `files`, or `clipboard`. This is **metadata provided by the iPhone** and does not prove that the screenshot came from that destination. The iPhone automation must determine the actual triggered item safely. Never use a stale "latest screenshot" or read an unrelated clipboard item without matching the trigger.

Server reuses existing `YOS_CLARITY_INTAKE_TOKEN_SHA256`, `YOS_NOTION_API_TOKEN`, `YOS_NOTION_INBOX_PAGE_ID` and Upstash credentials. It creates a Notion single-part file upload, sends the image and appends metadata + image block + divider to the existing Inbox page. No new database is created.

**Not yet built:** reliable iPhone Shortcuts automation, automatic replay of the local pending spool, OCR/classification into Shopping/Money/Tasks/Life Log, proof of production credentials and file upload permissions. Current 3 MB image cap may reject some screenshots; local source must remain intact and retryable. The candidate reserves a durable non-expiring owner-bound uncertain receipt before appending an image to Notion. If append or receipt completion has an unknown outcome, it holds the capture for read-back reconciliation instead of automatically appending again. Concurrent/expired-worker and lost-reservation-response paths are covered by mock tests; actual Redis/Notion behavior still requires the live release gate.

## Release gates
1. Execute `npm test` in `server/yos-ai`, including screenshot tests, and verify deployment checks without exceeding Vercel build limits.
2. Verify the existing Notion integration can create/send file uploads and append image blocks to the intended private Inbox. No sensitive sample screenshots.
3. Verify auth, 413, 409, 503, retry, identical capture IDs and mismatched content. Protect against capture-ID reuse with different images.
4. Design and test source-specific iPhone retrieval for all three selected save locations, without clipboard corruption or incorrect item retrieval. Confirm whether Shortcuts exposes the triggering screenshot as input.
5. Preserve local screenshot on every error; implement durable retry.
6. Add value-based classification to **existing** Notion destinations, with no unintended writes.
7. Get approval before production activation and verify on physical iPhone. Do not claim completed before end-to-end evidence.

Reference: https://github.com/yskn0008-bot/ProjectY/issues/683

## Existing notification shortcut reference (2026-11-12 screenshots)
The user's existing **通知受信** Shortcut is an automation triggered by notifications from selected apps. It runs Scriptable `Notification Bridge` with the trigger's `通知` value, then `Notification Context` with the same value. Next it sends a text prompt to the ChatGPT action and displays a notification only when the answer begins `YOS_ALERT`. This is a **text notification flow**, not a screenshot-image flow. Do not edit, rename, or replace it.

The new screenshot automation should follow the same **trigger → Scriptable bridge → existing YOS intake** pattern, but must not assume that the screenshot trigger passes a screenshot as Shortcut Input. Confirm the exact iOS event data first. Never silently substitute the latest photo or clipboard content. For each of Photos, Files, Clipboard, test with an intentionally distinguishable image and verify the exact capture ID and bytes reach the Inbox. If the trigger does not supply reliable image data, fail closed and preserve the source instead of sending a different image.

The server draft uses JSON base64 with a **3 MB image limit** to fit serverless request-body limits. Large images require client-side downscaling/compression with user-approved fidelity, or a future direct-upload mechanism. The user's screenshot original must remain unchanged.

## Privacy and release
Screenshots may contain banking and medical data. Do not include image bytes, OCR text or bearer tokens in logs, query parameters, or notifications. Use existing private Notion integration credentials only. Do not auto-route to another destination until a classification confidence and sensitive-data policy is implemented and tested.

## Work B safety revision — 2026-11-13 (not released)

The draft now binds capture IDs to original bytes and event metadata, persists non-expiring deduplication receipts, and verifies Notion parent, metadata block ID, image block ID and downloaded bytes (SHA-256) before acknowledging Inbox save. Unknown append outcomes use bounded read-only reconciliation; no automatic re-append or new capture ID is allowed. Legacy receipts without verifiable image identity are held.

The bridge requires the trigger's original encoded bytes and complete stable event metadata, preserves a local pending payload before HTTP, and rejects bare Image input/default metadata. Removed the unproven claim that physical trigger input had already been verified. No recompression, latest-photo/clipboard fallback, automatic pending drain, source deletion or token modification.

Classification remains an explicit unfinished gate, not part of Inbox success. The existing text sorter only accepts Clarity text captures and cannot classify an image. An approved image-analysis route must be connected to the existing destinations with ambiguous/sensitive cases held for review. No live image, Notion write, API secret, production enablement or device operation is performed by the automated tests.
