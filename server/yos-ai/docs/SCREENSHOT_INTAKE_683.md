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

**Not yet built:** reliable iPhone Shortcuts automation, guaranteed local fail-safe queue, OCR/classification into Shopping/Money/Tasks/Life Log, proof of production credentials and file upload permissions. Current 5 MB image cap may reject some screenshots; local source must remain intact and retryable. An upload can be duplicated if the Notion append succeeds but the final Redis write fails; this must be reconciled before enabling unattended production traffic.

## Release gates
1. Execute `npm test` in `server/yos-ai`, including screenshot tests, and verify deployment checks without exceeding Vercel build limits.
2. Verify the existing Notion integration can create/send file uploads and append image blocks to the intended private Inbox. No sensitive sample screenshots.
3. Verify auth, 413, 409, 503, retry, identical capture IDs and mismatched content. Protect against capture-ID reuse with different images.
4. Design and test source-specific iPhone retrieval for all three selected save locations, without clipboard corruption or incorrect item retrieval. Confirm whether Shortcuts exposes the triggering screenshot as input.
5. Preserve local screenshot on every error; implement durable retry.
6. Add value-based classification to **existing** Notion destinations, with no unintended writes.
7. Get approval before production activation and verify on physical iPhone. Do not claim completed before end-to-end evidence.

Reference: https://github.com/yskn0008-bot/ProjectY/issues/683
