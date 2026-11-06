# YOS / LIFE FLOW — DAYSTREAM task app

Approved pastel glass design, implemented as real offline HTML controls and CSS gradients. Reference screenshot content is never imported as personal routines. Existing DAYSTREAM records and native bridge are reused; no new server, account, database, or runtime request is added.

## Current behavior

- Day: exact 2px/min axis, 00:00–24:00, ongoing across-midnight clipping, date arrows and preserved month calendar.
- Week: seven date summaries from selected day, each opens that day; unavailable source window explicitly says 未確認. Month opens the existing month picker; year opens twelve month buttons, each opens its month picker. These are date-navigation views, not invented analytics.
- Add/edit a local placement, one-off/daily/weekly/monthly/yearly recurrence, individual time exceptions and move undo. Saved and unsaved placements can be removed from this local plan after confirmation; recurring removal affects the local series. Undo restores the removed plan and its local checks. Source tasks are never deleted.
- Check an individual occurrence in its editor or the review tab. The check is a bounded, optional `timeline.completed[id@date]` boolean extension. It describes this device only. Recurring instances remain independent. Apple and Notion completion are never written; `completedKeys` remains empty.
- Habits tab reads the existing habit file for the selected day and offers placement or edit. Source failures and empty loaded lists are distinguished. Unplaced source tasks are only the dated rows actually retrieved by the existing native feed, not every Notion task.
- Review reports only selected-day local plan counts and local checks. It does not invent success percentages, health effects or source task completion.
- Settings shows existing source/connection information, day selection, offline background options and light/dark/device appearance. Appearance settings last until close.
- Explicit Save uses the existing native callback and FileManager write/readback with conflict detection and previous-state recovery. The candidate uses `YOS_DAYSTREAM_TIMELINE_REVIEW_v1.json`; original stores are unchanged.

## Files and verification

`build-timeline-review.py` composes the existing baseline with additive core/UI/CSS and produces `daystream-timeline.html`, `YOS_DAYSTREAM_TimelineBridge_Dev.js`, and `YOS_DAYSTREAM_Timeline_Review_20261105.scriptable`. Run `python build-timeline-review.py` then `node --test timeline.test.mjs timeline.dom.test.mjs`.

Native logic tests mock FileManager and WebView; DOM tests execute the actual generated page in a minimal VM DOM. They verify callback/readback, source immutability, 24-hour geometry, recurrence, drag feedback, add/edit/undo, occurrence checks, explicit save/reopen, removal cancellation and restore, source habits, tabs, week/year navigation and configured text contrast. They are not a real browser rendering or iPhone result.

## Unverified physical gate

Real Scriptable WebView rendering, iPhone touch/long-press scrolling, Apple permission responses, actual local file read/write/reopen, and visual match on-device remain unverified. Browser execution is blocked by the current environment; no screenshot is claimed as live UI. Installation/updater and remote transport are managed separately. Keep this candidate and original app separate until that gate passes.
