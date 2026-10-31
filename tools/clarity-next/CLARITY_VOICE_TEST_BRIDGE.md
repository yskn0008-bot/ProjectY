# Clarity.Voice test-copy bridge

This is an iPhone-only dry run for a duplicate of the existing Clarity.Voice shortcut. It does not alter the installed original and does not write to Notion.

## Prepare Scriptable

1. Open `clarity_notion_bridge.js` from this Draft branch on the iPhone and copy its full contents.
2. In Scriptable, create a new script named `YOS Clarity Notion Bridge TEST` and paste the contents.
3. Do not enter a Notion token for this test. `yosTestMode` exits before any Notion request.

## Add the test action to the duplicate only

1. Open the duplicate `Clarity.Voice` in Shortcuts and edit it.
2. After the GPT planner result has passed the shortcut's existing safety checks, add Scriptable's `Run Script` action. Select `YOS Clarity Notion Bridge TEST` and set its `Parameter` to the GPT planner's parsed result (the dictionary containing `actions`).
3. Keep the action after the safety checks. Do not change `notionPending` in the shortcut.

## Dry-run result

- The copied script defaults to dry-run. A single `NEXT_NOTION/save` or `NEXT_MONEY/capture` action with `status=planned`, `risk=low|medium`, and no review/confirmation flags returns `DRYRUN:<target>`.
- An ordinary device action, an unsafe/review action, or a plan with no Notion save returns `SKIP:no_notion_save`.
- More than one Notion save in one plan stops for review.
- Dry run makes zero Notion API requests and zero local receipt writes.

This verifies only the Shortcut Input → Scriptable path. A live Notion acceptance test requires separate approval and is intentionally not part of this dry run. The standalone script's dry-run guard is switched off only inside the compiled Clarity Next build; the copy pasted into Scriptable stays dry-run. The current Clarity.Voice prompt must also emit the documented `NEXT_NOTION/save` or `NEXT_MONEY/capture` action for a save to be routed.
