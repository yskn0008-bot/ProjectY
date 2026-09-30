# YOS Alerts

This directory contains the fallback alert lane for iPhone.

- **Money Alert** reads the live same-origin Money snapshot through the existing browser bridge. It intentionally does not replace the Money owner store.
- **Task Alert** reads today's incomplete Reminders that have no native Reminder alarm. Items explicitly marked as routines are excluded.
- **Routine Alert** uses the same no-native-alarm source and only surfaces items explicitly marked Routine / ルーティン / 習慣.
- **Emergency Alert** is fail-closed and requires all three explicit gates: immediate awareness, immediate action, and material harm from delay.
- **Important Mail** only classifies the incoming iOS Email automation payload. It never sends, replies, archives, or deletes mail.

Displayed alerts are copied to `YOS Display History` as a derived reread cache. Original owner stores remain unchanged.

Real-device acceptance is required before the integrated alert lane is considered complete.
