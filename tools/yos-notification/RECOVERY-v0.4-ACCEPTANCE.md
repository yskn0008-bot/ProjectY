# Notification Bridge v0.4 recovery candidate

This extends the existing #651 Bridge candidate; v0.3, Context, filters, updater,
common installer/catalog and the user's phone are unchanged. Do not merge the old
#651 branch wholesale: it contains unrelated historical differences from main.

## Changes

- Retain a private local receipt in `YOS_Notification_AI_State_V1.json` before sending
  the raw-save queue. The receipt is `unregistered` until an explicit AI result is
  received; missing results do not prove an AI error. Queue and receipt writes are
  read back. Corrupt/full records stop safely instead of being erased.
- Preserve the existing local queue, credential keys, Inbox and notification names.
  Sanitize before queue/receipt writes. Existing 850-character safe-body bound remains;
  this does not preserve the full text of arbitrarily long original notifications.
  Never dismiss or delete the source application's notification.
- Reconcile an uncertain Notion write by exact saved paragraph (ID, timestamp,
  category and safe body), not an eight-character hash alone. Ambiguous legacy
  ID-only records block retry. A lost ACK cannot trigger blind sequential replay.
- `pending` reads unresolved receipts without sending notifications or changing Notion.
  `ai-result` updates the same local receipt, rejects unknown keys, and cannot silently
  replace a different completed result. Neither command re-runs ChatGPT.

## Wiring contract (not installed on iPhone)

Use the existing named `Notification Bridge` script, not a new installer/script:

1. Pass `{yosAction:"capture", notification:<actual trigger input>}` to the Bridge.
   Persist its returned `key` for THIS invocation. `ok` means a local receipt exists;
   only `saveState:"confirmed"` means the remote raw-save is confirmed.
2. Preserve the existing Context input from the same trigger. After successful
   ChatGPT response, call the SAME Bridge with
   `{yosAction:"ai-result",key:<capture key>,decision:"YOS_ALERT"|"YOS_SILENT",summary:<text>}`.
   Do not use a global "latest event" variable or a new key on retry.
3. If ChatGPT throws, later actions will not run. The local receipt remains
   `unregistered`. If the caller explicitly observes failure it can record `failed`.
4. `{yosAction:"pending"}` returns safe saved inputs and keys. An explicit retry uses
   the saved event's body/context and writes its result with that SAME key. Raw
   capture need not run again. Do not label the replay input as a new notification.

Legacy raw-input invocations retain the old string output. They gain an unresolved
receipt, but cannot mark successful AI outcomes until the result callback is wired.
Thus simply installing the Bridge is NOT a finished recovery flow. Local receipts
are not the server's 24-character capture IDs/Notion AI state contract.

## Verification and remaining gates

`node --test tools/yos-notification/notification-*.test.mjs tools/yos-notification/phone-notification-decision.test.mjs`

70 tests pass against actual candidate source in mocked Scriptable/Notion, including
lost ACK + replay, failed-to-complete, repeated results, corrupt storage, legacy
queue migration, OTP masking and receipt-key reuse. All data is synthetic. No live
Notion mutation, ChatGPT request or notification was sent.

Before distribution, System must use the existing common installer and verify a
fixed source revision, backup/rollback and unknown-version refusal. No private
Shortcut is uploaded here. The current iPhone's Shortcut differs from the saved
8-action file and must not be overwritten based on that old file. Physical wiring,
AI failure/lock-screen behavior, completion callback, and concurrent Scriptable
invocations remain unverified. Shared local JSON writes do not provide an atomic
cross-process transaction; do not claim parallel safety. A local failure after a
network write must keep evidence for reconciliation, not force a second write.
