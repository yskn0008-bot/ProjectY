# Clarity → YOS Inbox Intake Bridge

## Purpose

Move Clarity captures from iPhone to a YOS-readable shared inbox without creating ChatGPT conversations or weakening iPhone privacy settings.

The bridge is an adapter, not a new SSOT.

```text
Clarity.text / Clarity.voice
  → iCloud Shortcuts/Clarity Inbox.txt (Raw First, local fail-safe)
  → POST /api/yos/intake
  → Notion YOS Inbox
  → YOS reads and routes later
```

The local `Clarity Inbox.txt` remains the first durable write. Network, Vercel, Redis, or Notion failure must not erase that local raw capture.

## Non-goals

This phase does not:

- classify the capture with AI;
- create Calendar, Reminder, Money, Life, HJ, or other records;
- write into an existing ChatGPT conversation;
- create a second YOS personality;
- replace YOS Capture native raw storage;
- require Private Relay to be disabled.

## Endpoint

`POST /api/yos/intake`

Headers:

```text
Authorization: Bearer <one-time configured Clarity intake token>
Content-Type: application/json
```

Body:

```json
{
  "rawText": "7日19時までに10000円返済",
  "capturedAt": "2026-09-07T17:00:00+09:00",
  "inputMode": "text",
  "source": "clarity",
  "captureId": "clarity-20260907-170000-0001"
}
```

`captureId` must be stable for retries of the same capture. The endpoint uses the existing Upstash transport as a short processing lock and completed-capture marker. It does not create another database.

## Authentication

The iPhone Shortcut holds only the Clarity intake bearer token.

Vercel stores only its SHA-256 hash as:

`YOS_CLARITY_INTAKE_TOKEN_SHA256`

The Notion integration secret never goes to the iPhone Shortcut. It is server-side only:

`YOS_NOTION_API_TOKEN`

The destination page is configured server-side:

`YOS_NOTION_INBOX_PAGE_ID`

Existing Upstash variables are reused for idempotency:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

No secret value belongs in GitHub, screenshots, Issue comments, or logs.

## Notion write model

The bridge appends three blocks to the configured YOS Inbox page:

1. capture metadata (`capturedAt`, source/input mode, capture ID)
2. untouched raw text
3. divider

It does not summarize or reinterpret the raw text.

## Failure behavior

- Invalid/missing bearer token → `401`
- Invalid body/content type → `400` / `415`
- Oversized body → `413`
- Same capture already being processed → `409`
- Same completed capture retried → `200` with `duplicate: true`
- Redis/Notion unavailable → `503`

When Notion append fails, the temporary processing claim is removed when possible so the same `captureId` can be retried. The local iCloud raw capture remains the recovery source regardless.

## iPhone Shortcut acceptance

Production/iPhone acceptance is separate from code readiness.

With Private Relay ON on the physical iPhone17:

1. `Clarity.text` asks for text.
2. Existing `Clarity` appends timestamp + raw text to `Clarity Inbox.txt`.
3. Shortcut creates a stable `captureId`.
4. Shortcut sends JSON to `/api/yos/intake` using `URLの内容を取得` / HTTP POST.
5. The same raw text appears in Notion `YOS Inbox`.
6. No ChatGPT conversation is created.
7. No copy/paste is required.
8. Repeat for `Clarity.voice`.

Do not call the bridge iPhone-complete until these physical checks pass.

## External setup still required

Code readiness does not authorize external configuration. Owner approval is required before production configuration/deploy.

At activation time only:

1. Create/reuse the minimum Notion integration and share only `YOS Inbox` with it.
2. Register `YOS_NOTION_API_TOKEN` and `YOS_NOTION_INBOX_PAGE_ID` in Vercel.
3. Generate a strong random Clarity intake token; store only its SHA-256 in `YOS_CLARITY_INTAKE_TOKEN_SHA256` on Vercel.
4. Put the original Clarity token and endpoint URL into the iPhone Shortcut once.

The server-side Notion token must never be copied to the Shortcut.
