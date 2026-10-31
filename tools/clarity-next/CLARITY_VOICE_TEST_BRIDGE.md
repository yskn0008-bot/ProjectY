# Clarity.Voice test-copy bridge

This is a dry run for a duplicate of the existing Clarity.Voice shortcut. It does not alter the installed original and does not write to Notion. No separate Scriptable script or token setup is needed.

## Add one action to the duplicate only

1. Open `clarity_notion_bridge.js` from this Draft branch on the iPhone and copy all of its contents.
2. In Shortcuts, open the duplicate `Clarity.Voice` and edit it.
3. After the GPT planner result has passed the shortcut's existing safety checks, add Scriptable's `Run Inline Script` action. Paste the copied code into it, set `Parameter` to the GPT planner's parsed result (the dictionary containing `actions`), and leave `Run In App` off.
4. Do not change `notionPending` in the shortcut.

## Dry-run result

- The copied script defaults to dry-run. A single `NEXT_NOTION/save` or `NEXT_MONEY/capture` action with `status=planned`, `risk=low|medium`, and no review/confirmation flags returns `DRYRUN:<target>`.
- An ordinary device action, an unsafe/review action, or a plan with no Notion save returns `SKIP:no_notion_save`.
- More than one Notion save in one plan stops for review.
- Dry run makes zero Notion API requests and zero local receipt writes.

This verifies only the Shortcut Input → Scriptable path. A live Notion acceptance test requires separate approval and is intentionally not part of this dry run. The dry-run guard is switched off only inside the compiled Clarity Next build; code pasted into the test copy stays dry-run. The current Clarity.Voice prompt must also emit the documented `NEXT_NOTION/save` or `NEXT_MONEY/capture` action for a save to be routed.
