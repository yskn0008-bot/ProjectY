# Clarity iPhone operation coverage

Status is based on the strongest evidence available for the **current fixed-child architecture**.

- ✅ = physical iPhone PASS
- 🟡 = implemented / automated checks PASS or pending, but current physical iPhone acceptance not yet complete
- ⬜ = not yet implemented in Clarity
- 🚫 = not executable through supported iOS mechanisms

Only ✅ counts toward device coverage.

| Category | Status | Current route / evidence | First remaining acceptance |
|---|---|---|---|
| Open App | ✅ | Physical iPhone PASS: Action Button → Clarity voice → local `open_app / safari` fast route → fixed `YOS_OpenApp` → Safari. Ledger request `955913` contains `FAST_ROUTE open_app safari`, `APPLIED open_app safari YOS_OpenApp child_returned fast_path`, and `REQUEST_DONE`. | Expand physical checks to additional allowlisted apps as needed |
| Device settings | 🟡 | Existing allowlisted local setting executor retained | Physical per-setting acceptance after Open App PASS |
| Timer / Alarm | ⬜ | No fixed child integrated | Add after Open App PASS |
| Navigate / Maps | ⬜ | Maps app can be opened through Open App; navigation command not integrated | Add navigation child/category |
| Calendar / Reminder | 🟡 | Existing local executors and validation retained | Physical create/readback acceptance on fixed-child parent |
| Call / Message / Mail | ⬜ | Mail app opening is covered by Open App; communication actions are not integrated | Add communication child/category |
| Media | ⬜ | Music/YouTube/Spotify app opening is covered by Open App; media control is not integrated | Add media child/category |
| Files / Clipboard / Share | ⬜ | Files app opening is covered by Open App; file/clipboard/share commands are not integrated | Add category |
| Camera / Photos | ⬜ | Photos app opening is covered by Open App; camera/photo actions are not integrated | Add category |
| Home / appliances | ⬜ | Existing YOS/MY REMOTE assets are separate; not integrated into this Clarity fixed-child route | Add Home child/category |
| Money / YOS functions | ⬜ | Existing Money/MY WAY assets remain separate; MY WAY display handoff remains in parent | Add fixed child/category after Open App |
| Other iOS operations | ⬜ | Not yet classified/integrated | Add only after supported iOS action is confirmed |

## First completion gate

`Safari開いて` is ✅ on the signed fixed-child build. Physical iPhone verification proved all of:

1. Action Button starts Clarity.
2. Voice input captures the phrase.
3. Router chooses `open_app / safari`.
4. Parent calls the installed fixed child `YOS_OpenApp`.
5. Safari actually opens.
6. Parent resumes after `YOS_OpenApp` returns successfully.
7. Ledger contains the success record and request completion record.

Verified device evidence: the user repeated the signed current-head test successfully; the captured `Clarity Ledger.txt` tail shows request `955913` at 2026-09-22 02:48 with the Safari fast route, successful fixed-child return, and request completion.

Shortcut Factory is intentionally outside this table because it is a separate development lane, not a daily Clarity operation.
