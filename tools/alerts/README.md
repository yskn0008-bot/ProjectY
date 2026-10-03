# YOS Alerts

This directory contains the fallback alert lane for iPhone.

- **Money Alert** reads the live same-origin Money snapshot through the existing browser bridge. It intentionally does not replace the Money owner store.
- **Task Alert** reads today's incomplete Reminders that have no native Reminder alarm. Items explicitly marked as routines are excluded.
- **Routine Alert** uses the same no-native-alarm source and only surfaces items explicitly marked Routine / ルーティン / 習慣.
- **Emergency Alert** is fail-closed and requires all three explicit gates: immediate awareness, immediate action, and material harm from delay.
- **Important Mail** only classifies the incoming iOS Email automation payload. It never sends, replies, archives, or deletes mail.

Displayed alerts are copied to `YOS Display History` as a derived reread cache. Original owner stores remain unchanged.

For the non-Payment alert suite, the compiled Shortcut replaces the generic Shortcuts notification action with Scriptable's existing inline `Run Script` app action (`runInApp=false`). This keeps notification delivery background-safe while attaching a tap target: Money → YOS Money, Task/Routine → Reminders (Morning/Night names route to their existing Shortcuts), Emergency → YOS System, Important Mail → Mail. Payment Alert is intentionally left untouched because its current iPhone implementation already passed acceptance.

Real-device acceptance is required before the integrated alert lane is considered complete.


## Important Mail migration

The already-running ChatGPT Automation named `重要メールRouter` remains the production fallback until the iPhone Email → `Important Mail` E2E acceptance passes. Do not run both permanently. The local Shortcut reuses the same actionability policy, writes accepted alerts to `YOS Display History`, and opens Mail from the notification. After device acceptance, the existing cloud Router can be paused rather than maintaining two notification paths.

Because an Email Automation contains user-local account/filter picker state, this repository does not invent or commit that trigger state. The final device gate is to connect the signed `Important Mail` Shortcut to the existing iPhone Email automation for the intended mail account and verify one real test message.
