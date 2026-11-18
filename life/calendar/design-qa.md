# YOS Calendar reference comparison

Visual source: user-approved two-screen YOS CALENDAR / DAYSTREAM image attached on 2026-11-16. Existing root Money design report is unrelated and preserved.

Actual captures: YOS_Calendar_actual_screens.png (month/day, 402 × 874 each) and YOS_Calendar_updated.jpg (latest daily screen, 402 × 874). Rendered UI and the reference were opened together for comparison. Fixture data are clearly marked fictional; no personal data screenshot is published.

Preserved: dark navy background; YOS mark and title hierarchy; three filter rows; category-colored outlines; Monday-first six-week grid; luminous selected day; summary below grid; separate daily screen with time axis and category cards; income green and spending red; untimed panel; bottom two-tab navigation. Existing original DAYSTREAM implementation is untouched.

Resolved P1/P2: narrow-header overlap, clipped amounts, overlapping filter labels, dense daily titles, unwanted horizontal/vertical overflow at the tested fixture sizes. Latest Calendar Chromium/WebKit acceptance passes month/day at 320 × 667, 390 × 844 and 402 × 874.

Necessary differences: device frame/status/home indicator are OS chrome; no duplicate chrome is drawn. Unverified balance remains —. Date-only payments stay in the untimed area instead of inventing the reference 13:00 time. Real source counts and labels vary. Compact phone type can wrap; month titles disclose full text in day/detail view. Metadata explains verification rather than presenting unverified sums as known totals.

Primary behavior: filtering, month/day/today navigation, chronological ordering, separate untimed items, Notion links, task success/failure, one-day habit completion and readback, next-day incompletion and future-write rejection passed automated browser checks. No product page exception observed in these checks.

P3 follow-up: minor icon stroke, glow and font differences remain; they do not block use. No claim of pixel identity.

Limits: these are browser captures with fictional records. Owner Google login, real Notion reads/writes, physical iPhone safe areas, touch and offline reopen are still unverified. Production is not changed.

final result: passed
Scope of passed: reference comparison and tested browser UI only; production and physical-iPhone acceptance remain open.
