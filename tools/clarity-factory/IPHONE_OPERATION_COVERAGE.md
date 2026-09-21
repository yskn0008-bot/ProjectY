# Clarity iPhone operation coverage

Status is based on the strongest evidence available for the **current fixed-child architecture**.

- ✅ = physical iPhone PASS
- 🟡 = implemented / automated checks PASS or pending, but current physical iPhone acceptance not yet complete
- ⬜ = not yet implemented in Clarity
- 🚫 = not executable through supported iOS mechanisms

Only ✅ counts toward device coverage.

| Category | Status | Current route / evidence | First remaining acceptance |
|---|---|---|---|
| Open App | 🟡 | Parent `open_app` → fixed `YOS_OpenApp`; 20 current app targets preserved | `Safari開いて` from Action Button |
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

`Safari開いて` remains 🟡 until the physical iPhone run proves all of:

1. Action Button starts Clarity.
2. Voice input captures the phrase.
3. Router chooses `open_app / safari`.
4. Parent calls the installed fixed child `YOS_OpenApp`.
5. Safari actually opens.
6. Parent resumes after `YOS_OpenApp` returns successfully.
7. Ledger contains the success record and request completion record.

Shortcut Factory is intentionally outside this table because it is a separate development lane, not a daily Clarity operation.
