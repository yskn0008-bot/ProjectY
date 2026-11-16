# YOS Calendar — approved design implementation

## Scope and fixed starting point

- User reference: attached two-screen navy YOS CALENDAR / DAYSTREAM mockup, 2026-11-16.
- Base: `71d7cb339579078e06c237e30fa77d519ee8807c` (main).
- Branch: `feat/yos-calendar-approved-20261116`.
- Acceptance: faithful navy monthly screen plus a separate daily screen, existing source contracts, no fabricated production records, no modification of the nearly finished timeline.
- Existing PR #654 is an older timeline candidate with different assets and ownership; it is not rebased or overwritten by this work.
- Implementation: current Work session, local source implementation and existing GitHub connector. No additional Codex job or agent. The cross-file visual reproduction and browser/failure testing are performed in this session.

## Implemented

- Solid `#051522` navy, inline SVG brand/icons, glass border surfaces, glowing date and bottom tab selection, reference-style three rows of filters, six-week Monday-first calendar, selected-day summary.
- Type toggles: schedules/tasks/habits. Area toggles: Money/Work/Health/Self/Life; an optional unclassified category avoids guessing unspecified areas.
- Month/day navigation, today, date click to daily screen, back/forward navigation, query-encoded selected day/view, search of obtained records.
- Daily chronological cards and a separate untimed section. Original Notion links and source/verification details. No default midnight for date-only rows.
- Existing authenticated Notion task completion: expected version/state, successful server readback, local backup/readback, explicit error without false done state. Existing identity and origin checks remain intact.
- Existing Notion Tasks plus the following schema-verified read-only projections: household events, people/anniversaries, Shopping sale dates, household income/payment events, and cases with deadlines.
- The extra read is restricted to the existing authenticated calendar opt-in (`calendarMoney=1`); arbitrary data source IDs cannot be supplied by a caller. Each fixed source is paginated, capped, and independently reports unavailability.
- Related cases with an existing task relation are suppressed as duplicate work. Financial IDs are deduplicated; shared original IDs prefer actual records. Matching amounts/titles across different sources without identity evidence remain reconciliation-pending and are excluded from confident totals. Transfers and cancelled payments are excluded.
- Financial verification is retained. Unverified amounts are visible as source records, with confirmed totals withheld for that direction rather than being presented as a known zero. Existing Money privacy hides both old and new financial records.
- Source data and name changes: none. New databases, services, credentials, shortcuts and installers: none.

## Reference comparison and necessary differences

Visual review used actual browser-rendered 402×874 captures against the attached reference, and a synthetic fixture distinctly labeled fictional. These are screenshots of implemented controls, not generated replacement mockups.

Preserved: header hierarchy and mark position, pill filters, category colors, Monday calendar, six rows, luminous selection, income green/expense red, summary position, independent daily screen with colored axis nodes, untimed ToDo container, two-tab bottom navigation.

Corrections made after screenshot review: financial text clipped by cell flex shrinking; filter text overlapping at narrow widths; small-phone header collision; finance panel consuming excess vertical room; unnecessary scroll at six daily entries; long daily labels cut before their meaning; and combined daily financial source display.

Intentional differences:

- iPhone status bar, outer device frame and home indicator are supplied by iOS and are not duplicated in the web content.
- The reference's bank balance and examples are not personal data. A balance forecast remains `—` until a verified source exists; untimed payments stay untimed.
- Unknown classifications are not inferred. This can add an “unclassified” source label.
- Reference text is scaled to a 402px phone viewport. Long daily titles can use two lines; dense month labels use ellipsis with full information in the daily/detail view. Amount font scales down to preserve normal six-digit values.
- The visible source note identifies planned plus actual totals; detailed rows preserve the original distinction.

## Verification evidence

- TypeScript build: `node server/yos-ai/node_modules/typescript/bin/tsc -p server/yos-ai/tsconfig.json` PASS.
- Node source/auth/financial/native/privacy/contracts: 68 tests PASS, zero failures. Command:

```sh
node --test life/calendar/*.test.mjs life/tests/life-calendar-contract.test.mjs server/yos-ai/tests/daystream-notion-tasks.test.mjs server/yos-ai/tests/calendar-money-source.test.mjs server/yos-ai/tests/calendar-sources.test.mjs yos/tests/task-dashboard-contract.test.mjs
```

- Local Chromium iframe harness: 20 behavioral assertions PASS at final 402×874 month and daily screens. Exercises filters, month/day navigation, chronology, original links, untimed division, failed/successful task completion, freshness preservation and final page overflow. 320×667 also passed the 20 assertions; 390×844 passed the earlier 18-assertion revision before final overflow/typography refinements.
- Fixture completion is mocked; it does not prove an authenticated real Notion mutation.
- Browser fixture: `tests/approved-calendar.browser.html` is restricted to localhost and only uses fictional records. It must not be run against a personal-data origin.
- Original `yos/daystream/**`, installed/native timeline files, installers and original Notion records have zero changes. The completion follow-up below adds only Calendar runtime files to the root service-worker cache.
- `git diff --check`: PASS.

## Remaining gates — not a completed production release

- New frontend/backend revision is not merged or publicly deployed. No public switch is claimed.
- Actual owner-authenticated GETs for the additional Notion sources and a real task PATCH are unverified. Existing connector schema reads do not prove the backend token has access.
- Repeating habits are identified from their existing property. Calendar-only habit completion now writes one date-specific receipt to the existing YOS 生活イベント source. Original habit templates are never completed. A durable existing Redis reservation blocks duplicate/uncertain creates, while receipt readback resolves already-applied requests. Daily/weekly/monthly display respects known anchors; missing timing is not invented. Real owner-authenticated write is still unverified.
- Date-less items remain outside the dated calendar; this does not mean they are done or absent from Notion.
- Existing financial source is bounded at 400 dated records per source. Exceeding that bound reports unavailable; no incomplete result is called complete.
- iPhone Safari/PWA rendering, safe-area behavior, authentication, touch/save/reopen and native return are unverified. Chromium iframe QA is not physical iPhone/WebKit QA.
- Root PWA cache has an additive v46 generation with all Calendar assets and direct-open registration. Existing DAYSTREAM assets and routing are preserved. Physical iPhone offline acceptance remains unverified.
- Future integration must check latest main and shared backend dependencies before merge. Rollback of the visual change is the prior calendar revision; source data requires no migration or undo.


## Completion follow-up

- Added `complete-habit` to the existing authenticated Tasks endpoint, backed by the already configured Upstash client and the existing Life Events source. No database, Redis service or schema was created. Date-specific keys survive unknown network outcomes; an unresolved pending request is held instead of re-created. A retry can read an existing valid receipt.
- Calendar uses a Calendar-only derivative of existing task auth; no `yos/daystream/**` file is changed. Authentication origin/identity/token handling follows the existing contract.
- Validated that production has the Notion token and existing Redis configuration by metadata only; values were not read. Tasks data source env ID was absent, so the production adapter now defaults to the schema-verified existing Tasks source ID. Explicit configured IDs still take precedence.
- Real Notion habit-edit view contains two unnamed rows with only a recurrence default. The strict Tasks parser now reports those as ignored placeholders, while meaningful unnamed tasks still fail closed. No actual row was modified or deleted.
- Public config responds successfully with the expected official Origin. This proves public config/Origin handling, not owner-authenticated Notion access. Notion credentials are production-only; they are not copied into preview.
- Local targeted tests: 90 PASS, including single-date completion, replay recovery, two simultaneous clicks, lost response after create, missing receipt after unknown outcome, wrong parent/version, future-date rejection, recurrence anchors and calendar projection.
- Local Chromium: approved screen 20 assertions PASS, habit receipt UI 5 assertions PASS. On source head f3b8920ab165541f2fd3e23b8f3d8e8c4534396c, Calendar browser acceptance passed in Chromium and WebKit (three viewport sizes, month/day controls and the one-day habit receipt flow). AI Core, Unified PWA, Life Node and iOS bundle contracts passed. The native simulator job remained queued at the last observation; native application sources were not changed. Existing aggregate Life Money-label smoke remains a separate failure (money is missing 最近の入出金), not a Calendar acceptance failure.

- Full local server suite: 396 tests PASS; API syntax checks PASS. Calendar auth parity checks ensure the existing identity/origin/token behavior is unchanged outside the explicit habit action.

## Final source audit

- Latest behavioral CI source: `f3b8920ab165541f2fd3e23b8f3d8e8c4534396c`; complete tested tree `9ddded18274a3353dc8b6d8374a0a93fbd92eefc`.
- Browser acceptance passed before the separate existing Money smoke failed. No assertion was removed to suppress that failure.
- Final evidence-only update adds this status and the scoped `design-qa.md`; it restores the unrelated Morning Brief signed binary to its starting blob. Runtime files retain the tested bytes. No claim that skipped final-head CI executed.
- This revision is ready for production approval, not published or physical-iPhone verified. No owner-authenticated task or habit write was performed.
