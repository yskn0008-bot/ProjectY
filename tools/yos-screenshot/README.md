# スクショ受信 — existing Voice inline save reuse

User approved OCR information only; no original image upload and no paid image-analysis API.

This standalone Shortcut receives exactly one supplied image, uses the native Extract Text from Image action, then embeds the Inbox-only portion of Clarity.Voice Health Test(2).shortcut action 648. It uses the existing Scriptable Keychain key YOS_NOTION_INTEGRATION_TOKEN, existing private Inbox and direct Notion Request. It does not invoke Voice/dictation, a model, Clarity Next, Vercel or a new installed script. Existing source Shortcuts and shared installer/catalog are untouched.

The source ID is clarity:screenshot-SHA256(full OCR record). The header retains the existing Clarity Share label and body explicitly marks screenshot OCR as source material, not a user command. Identical text is intentionally treated as one capture even across different screenshots. No text is silently truncated; records over 100,000 UTF-16 units are held. All text is split into Notion paragraphs under the existing limits.

Before network, the text is preserved privately on-device. Read-only paginated Inbox scan must complete before any append. FileManager.copy's documented no-overwrite behavior reserves a durable local claim immediately before append. The claim has no expiry and is never automatically deleted. A crashed/ambiguous append is reconciled by exact text/key readback, never automatically re-appended. Empty OCR, missing credential, incomplete scan or ambiguous results fail closed. Readback checks the complete text and saved block IDs before reporting YOS_INBOX_SAVED. The local source text and original Photos/Files/Clipboard are never deleted. Actual Scriptable extension filesystem sharing and simultaneous FileManager.copy behavior remain physical-device gates; mock tests are not proof of native atomicity.

Existing Inbox routing is reused, not rebuilt or claimed complete. The result returns classification=existing-route-unverified until a real screenshot record is verified against the actual routing destination. The periodic rescue automation's current OFF state is not changed here. No financial, Tasks, calendar or other destination writes occur in this inline code.

## Delivery and rollback

Generate with python tools/yos-screenshot/build_shortcut.py. Sign only this secret-free generated plist through tools/clarity-factory/sign_with_hubsign.py, the existing signing method. Never send the user-provided Voice file or runtime OCR/credentials to the signing service. Decode the signed artifact and compare the workflow to the generated plist before delivery.

On iPhone, add the signed スクショ受信 Shortcut. Start with one manually shared harmless screenshot to verify OCR -> existing Keychain -> Inbox text readback. Then connect the existing screenshot-save automation's actual image input to Run Shortcut / スクショ受信. Never substitute Latest Photos or Clipboard. Verify each selected save location's event input before enabling unattended use. Creating/editing the personal automation itself requires the physical iPhone. If it supplies no image, hold; do not guess the trigger's image.

Disable the screenshot automation to roll back. Keep original Clarity Voice/Share/notification automation intact; do not delete pending claims to bypass uncertain saves. iPhone/real Notion/routing readback is not complete merely because signing/tests pass.
