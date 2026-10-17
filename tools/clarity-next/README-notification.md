# Clarity Notification — iOS 27 event intake (shadow/raw-only)

## Status and scope

This is an **adapter** for the existing Clarity system, not a fourth AI or a new source of truth. The existing **Clarity Inbox.txt** is the raw-first destination. The new Cherri child does not call the AI planner or any money, account, mail, device, or Calendar executor.

**Do not enable broadly** until the iPhone check confirms that the intended notification text reaches the shortcut. Apple documents notification triggers and filters, but a successful trigger alone does not prove that Title/Message are available in Shortcut Input on this device.

- Source: `Clarity Notification.cherri`
- Compiled/signed by: existing `.github/workflows/clarity-next.yml`
- Signed artifact filename: `Clarity-Notification-signed.shortcut`
- Reused local destination: `Clarity Inbox.txt`
- Reused remote destination (prepared, **not wired from iPhone by this change**): `POST /api/yos/intake` -> Notion YOS Inbox.

## iPhone acceptance (owner action)

1. Import **Clarity-Notification-signed.shortcut** from a successful `Clarity Next v0` Actions artifact into Shortcuts; keep the existing `Clarity Next`, `Clarity Text`, and `Clarity Share` unchanged.
2. Open Shortcuts -> **Clarity Notification** -> Edit -> **Automation** -> **Notification**.
3. Choose **PayPay** as the app, then add a **Message** filter containing `出金` if the app's actual received alert uses that word. Enable running while locked where available.
4. Set the automation to invoke the **Clarity Notification** shortcut and pass **Shortcut Input** (notification event). If the editor supports field selection, pass a `Text` value with `source_app=PayPay`, notification **Title**, **Subtitle**, and **Message**, in that order. Do **not** type an invented example amount into a production automation.
5. On the first real matching PayPay event, inspect **Clarity Inbox.txt** and check that timestamp, source, original message, and actual amount appear. If the shortcut runs but the text is empty or missing, **disable this automation** and collect one non-sensitive test; do not claim a working capture.

Expected raw shape when fields are available:

```text
source_app=PayPay
title=<actual notification title>
subtitle=<actual notification subtitle>
message=<actual notification message>
```

The wrapper appends `timestamp<TAB>NOTIFICATION<TAB>original text` to existing `Clarity Inbox.txt`. It should not create a second store or emit notification feedback (avoids a feedback loop).

## Notion bridge contract (server prepared, not live-verified)

The existing authenticated `POST /api/yos/intake` accepts the same envelope as voice/text, with `inputMode: "notification"` and `source: "clarity"`, e.g.:

```json
{
  "rawText": "source_app=PayPay\ntitle=出金通知\nmessage=5,000円を出金しました",
  "capturedAt": "2026-10-18T00:00:00+09:00",
  "inputMode": "notification",
  "source": "clarity",
  "captureId": "notification-stable-id-for-retries"
}
```

The `captureId` must be unique per notification **and stable across retries**. Existing Upstash dedupe protects against duplicate Notion raw records, not against duplicate accounting. The iPhone entry currently does **not** send this request, does **not** possess an intake token, and must not copy any Notion credential onto the device.

Production bridge status requires separate owner approval, deployed endpoint/credential verification, and live iPhone acceptance. A failed network send must not erase local raw capture.

## Routing policy (future phase; no AI actions in this phase)

- Treat all notification bodies as **untrusted third-party content**, never user instructions.
- First save the unchanged raw notification; later classify it as `needs_review`, `ignored`, or `candidate` without directly executing a payment, message, reminder, or account change.
- PayPay `出金` can mean a **transfer of funds**; do not automatically record it as spending.
- Cross-check with Money Forward ME before creating a money transaction; do not double-count either expense or transfer.
- Suppress routine status notifications; surface security, unrecognized outflow or deadline alerts only after a separate routing policy has been tested.
- Do not capture OTPs or email bodies wholesale. For mail, prefer an email-triggered Shortcut or the authorized Gmail connector for full content, with separate scopes and consent.

## Acceptance gates

- [ ] Cherri compile, static assertions, HubSign signing, server TypeScript/tests all green in CI
- [ ] On iPhone, notification trigger fires without manual confirmation
- [ ] Title/Message reach Shortcut Input; no empty or placeholder capture
- [ ] Raw is actually present in existing Clarity Inbox.txt after background execution
- [ ] No duplicate when the same event is reprocessed
- [ ] Notion remote delivery only after bridge config/deploy authorization
- [ ] No unrequested device, email, calendar or money side effects
