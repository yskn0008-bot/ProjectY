# YOS DAYSTREAM — iPhone Native Preview (development only)

This is an **isolated, read-only** Scriptable preview, not a replacement for existing Clarity.Voice, MY LIFE, Money, YOS Today, Calendar, or Shortcuts. Never deploy this to production without explicit review.

## Device import
1. From the ChatGPT conversation, open the generated `YOS_DAYSTREAM_iPhone_Test.scriptable` attachment on iPhone.
2. Tap **Share → Scriptable** (use **More** if Scriptable is not initially shown), then confirm its import under the distinct development name **YOS DAYSTREAM 開発確認**. If the share destination is unsupported on this OS version, don't manually edit or overwrite existing scripts; report the import screen.
3. In Scriptable, run **YOS DAYSTREAM 開発確認**, approve only the needed native Calendar permission if prompted.
4. Open **接続状況 · 詳細** and confirm individually **Appleカレンダー**, **Notion Tasks**, and **Notion家計**. A source can be `取得済み`, `一部取得`, `未接続`, or `取得失敗`. Do not infer `取得済み` merely from opening the display.
5. Close and rerun this **development script** to refresh Apple/Notion. The WebView in-screen refresh button does not refresh native sources.
6. Do not import any Shortcuts, replace Clarity, or disclose Notion credentials. The `.scriptable` package embeds the vetted HTML in the script; it fetches no executable UI at runtime.

## Technical boundaries
- Native Scriptable reads iOS `CalendarEvent.between` and existing Notion integration through Scriptable `Keychain` key `YOS_NOTION_INTEGRATION_TOKEN`, but never sends this credential to HTML. Notion sources are existing YOS Tasks data source `965c6086-32c1-463d-93b4-87a9cb69b3ad` and existing finance `95b30d16-7530-40c6-a320-dab99acad55d`.
- Date horizon: past 14 days through the next 46 days when launched. Only bounded titles, dates, states, and amounts are passed to an **offline in-app WebView**. Notion queries are read-only; no new server, database, scheduled task, shortcut, or integration is created.
- Snapshot source limits: 170 Apple entries, 165 Notion tasks, 165 Notion finance events. Results exceeding their per-source cap are explicitly marked `一部取得` (partial). Notion pagination limit is 4 pages/source and marks incomplete reads partial.
- Money: internal transfers excluded; no cross-source double count; Notion finance takes precedence over potentially mirrored old Money when Notion is available; a reported payment is counted in actuals only if **state=実績** and **certainty=確認済**. Unverified real expenses remain separately marked `要照合`, not shown as paid or confirmed.
- Source `error`, `partial`, missing token, stale native snapshot or dates outside horizon do **not** prove absence of activity. No bank live balances, no Siri direct action, no Clarity→YOS Diary full sync.
- GitHub page `life/calendar/daystream-native.html` previews the WebView but cannot itself read iOS Calendar or Scriptable Keychain.
- No iPhone hardware test has yet been performed. Isolated Node tests: 6/6 pass. Desktop Chromium verified 320, 390, 430px widths using `setContent`; importing the `.scriptable` package and iOS Calendar permissions must be tested on-device.

## Rollback
Delete only **YOS DAYSTREAM 開発確認** from Scriptable if no longer wanted. Existing scripts, Notion records, Apple events, MY LIFE, and Money have not been modified.

## 2026-11-02 System continuation (existing Draft PR #654)
- Reused the same Draft PR and existing Scriptable-to-WebView read-only bridge. The Apple cap is 170, Notion Tasks 165, and Notion Money 165 so one full source cannot displace another; an over-cap source is labeled partial.
- DAYSTREAM puts the existing YOS next-action insight above the timeline, enlarges text and major tap targets, and labels partial/stale native source snapshots instead of calling any single successful source a complete sync.
- HTML SHA-256 integrity pin updated in the **development bridge** to match the changed preview. Any previously built standalone Scriptable package remains pinned to its prior embedded HTML; this commit does not silently update/install/overwrite that package. This work remains a Draft; no current iPhone install, live permissions, merge or production release is verified.
- Regression checks cover HTML checksum, 500-row fair source allocation, partial status, and action-first UI structure; actual iPhone readability and connection status still require on-device confirmation.

- Native finance never falls back to stale browser Money when Notion errors or is unavailable. Partially loaded Notion finance rows remain viewable but the daily total is withheld and labeled incomplete.

## 2026-11-02 — Prepared offline one-file review package

The same Draft PR now includes [YOS_DAYSTREAM_iPhone_Review_20261102.scriptable](./YOS_DAYSTREAM_iPhone_Review_20261102.scriptable). This is a **development-only** standalone Scriptable import with the corrected 2026-11-02 DAYSTREAM UI and read-only bridge embedded together. Its JSON script name is `YOS DAYSTREAM 開発確認 20261102` so older preview scripts remain separate and unchanged.

- Import the `.scriptable` file using iOS Share → Scriptable (if the file has been obtained through the user's authenticated GitHub access).
- Run only the new `YOS DAYSTREAM 開発確認 20261102` script. Approve Calendar permission if needed. Open `接続状況 · 詳細` and record Apple / Notion Tasks / Notion家計 status independently.
- The UI is bundled **offline**; no executable HTML is fetched from GitHub when the script runs. The only network requests are read-only Notion API queries; Calendar reads occur on device. No bank live balance is claimed.
- Device import, iOS WebView, Keychain compatibility, permissions, Notion real queries, visual accessibility and final UX are **not yet verified**. Never mark the whole STREAM screen production ready from mocked tests alone.
- Mock Scriptable checks confirmed success / no Keychain / HTTP denied paths, HTML integrity pin, no credential in WebView and no writes to Notion. The package is not deployed to the current iPhone; older `.scriptable` imports are not overwritten.
- Rollback: remove only the distinctly named `YOS DAYSTREAM 開発確認 20261102` development script after review. Do not remove any existing YOS, Money, Clarity or widget scripts.

## 2026-11-02 — Calendar-to-Notion visual duplicates, verified on iPhone

- The user provided three **physical iPhone** screenshots: DAYSTREAM opened in Scriptable and showed three native sources as `ok`. On November 5, "管理費・修繕費・駐車場引き落とし" appeared both as an Apple event and a Notion task. On November 7, "MONGOL800 ga FESTIVAL What a Wonderful World!! 26（当日15時通知）" also appeared in both.
- Both relevant Notion YOS Tasks pages were fetched. Their `正本・根拠` values were **Apple Calendar**, with `同期キー` beginning `calendar:`. They are mirrored representations of Calendar events, not proof of separate human-created tasks.
- **Bridge-only safe fix:** read the existing Notion provenance / sync key. For a Notion row explicitly originating in Apple Calendar, suppress its view copy **only if** an Apple event with the same local day and normalized title was loaded AND the Notion row has no independent next action/completion condition/blocker. The Apple event stays; the underlying Notion and Apple records are untouched. Genuine tasks on the same day, explicit work items, different dates and Money entries must stay. If Apple Calendar is unavailable, keep the Notion record as a safe fallback.
- The pre-existing offline iPhone review package retains the **same Scriptable name**, and its embedded bridge was updated. The separate UI HTML checksum is unchanged. The previous locally installed package does **not** auto-update from GitHub; a guarded replacement is necessary.
- Regression suite: 14/14 isolated V8-compatible tests PASS for Apple mirror suppression, manual tasks, explicit action tasks, source absence, different date, protected Money records and original safety contracts. A separate one-tap update helper was mocked in 6 cases (existing old revision, already upgraded, pasted JSON, new install, code conflict, network failure), with 6/6 PASS. These are **not** evidence that the patched package has run on the user's physical device.
- Source of truth and rollback: Notion and Calendar remain unchanged. To revert the display behavior, restore the prior verified Scriptable source pinned at Git commit `ee70d20177f2948dc7899d71262c462d085f77d4`. Never touch the user's unrelated Scriptable files. Keep PR #654 in Draft until updated device test.

## 2026-11-02 — Wake-to-sleep daily execution timeline (local-only draft)

- Reused the existing DAYSTREAM native preview and its standalone Scriptable import `YOS DAYSTREAM 開発確認 20261102`; no new app, database, server, Notion collection or Shortcut.
- The top-level screen now has **起床 → 水 → 朝ストレッチ → 身支度 → 朝食（Clarity記録案内） → 予定／タスク → 日記 → 夜ストレッチ → 就寝** in a **single vertical list**. Fixed Apple Calendar times and timed Notion Tasks are pinned; other Tasks are proposed in priority order, respecting existing `優先度` and `実行順`. YOS does not invent wake/sleep times or claim a personalized meal or sleep plan without data.
- Each flexible habit/task has a check and up/down reorder controls, sized for touch. Both are **temporary device-only plan markings**, stored only under `yos-daystream-plan-v1` if the embedded WebView permits local storage. The screen explicitly states that Notion Task statuses, YOS Diary, Apple Calendar and Money **are not modified**. Store failure is labeled; persistence on a physical iPhone is not proven.
- The prior source record list and Money/Habit read-only summaries remain under expandable **元データを確認**. Existing Apple/Notion visual mirror suppression and finance source isolation remain active.
- Security scope: only the single exact storage write `localStorage.setItem(PLAN_KEY,encoded)` with fixed key `yos-daystream-plan-v1` is allowed in a SHA-256-pinned HTML bundle. No Notion PATCH, no Calendar edits, no token sent to WebView.
- Isolated Scriptable/V8 compatible regression suite **19/19 PASS**, including local check/order save + reload, pinned fixed events, priority ordering, source preservation, missing credentials, partial sources, confidentiality and the package's HTML digest. This is not an iPhone WebView device acceptance, nor full GitHub CI certification.
- **Device boundary**: the previous installed Scriptable script does not auto-update from a GitHub change. This `.scriptable` file is JSON *for Scriptable import* and **must not be pasted directly into the JavaScript editor** (doing so triggers `SyntaxError: Unexpected token ':'`). Existing working Scriptable code must not be overwritten without a verified backup. The development PR remains Draft.
- Next gates: actual iPhone check/reorder persistence, readable rendering on an iPhone, confirmed Apple/Notion data; then separately design verified Notion Tasks completion/Diary habit writeback, meal history recommendation and Apple Health-based bedtime estimates without fabricating results.

## 2026-11-02 — Guarded Notion Task completion (supersedes prior local-only note)

The existing Draft PR now includes explicit native Notion Tasks completion **after the user closes the DAYSTREAM WebView** and approves a Scriptable confirmation dialog. Checkmarks and ordering remain temporary during editing; the native script may persist their bounded snapshot to `FileManager.local()` file `YOS_DAYSTREAM_PLAN_STATE_v1.json`. Its source key `yos-daystream-plan-v1` stays separate from MY LIFE and Money. Failed or invalid file reads do not overwrite the older file, and a failed file save prevents Notion mutation.

**Safety boundary:** only newly checked, genuine Notion Tasks from this session are eligible, and only for the local current day. Calendar mirrors, unknown IDs, expired/moved/renamed/completed tasks and non-actionable statuses are rejected. Native Scriptable independently reads the original Notion page, verifies UUID, title, day, current status and data-source parent, then sends a single `PATCH /v1/pages/{id}` changing **only** the existing `状態` select value to `完了`. It reads the page back after the response. Any stale/failed/unconfirmed response is labeled incomplete. Max five confirmed tasks per batch; no automatic retry, no delete, no Money/Diary/Calendar edit. Neither the private Notion token nor update authority crosses into WebView; the WebView only exports a bounded plan and touched task keys. There is **no** silent Notion write: declining the Scriptable alert leaves Notion unchanged.

**Verification:** code refetched and isolated Scriptable fixture tests **24/24 PASS**, including local save, user accept/decline, unexpected title, already completed source, failed file save, forged ID, Apple Calendar mirror and absent Keychain. These are Mock/V8-compatible tests, **not** real iPhone Scriptable WebView or Notion API execution. In particular, Scriptable `WebView.evaluateJavaScript` after dismissal and FileManager persistence still require a physical iPhone acceptance test; if that bridge cannot read exported state, no Notion write occurs and the UI plan remains an unverified draft. PR stays Draft; existing imported Scriptable app does not auto-update.

**Acceptance:** run only an isolated disposable test task after an iPhone backup; confirm checked, cancel, re-open state, approve exactly that task, verify Notion `状態=完了`, and ensure an unchanged Apple-origin event remains unaffected. Do not use real payment/medical tasks until acceptance passes. Do not paste the standalone `.scriptable` JSON directly into a JavaScript editor.

## 2026-11-02 — Additional authorization hardening (device acceptance pending)

- Only a Notion page whose **current** parent is the *exact existing* YOS Tasks data source can transition. Missing, different or ambiguous parent information is rejected rather than silently allowed.
- Before the status-only PATCH, native Scriptable refetches the page and rechecks **Apple Calendar** provenance and any `calendar:` sync key; even a record whose provenance changed after the display snapshot is ineligible.
- A `completedKeys` entry from the displayed plan does not authorize a write by itself: the exported, validated plan must also contain a **true checked state for that exact key on the current day**. Existing token/date/title/status/UUID/user-approval guards still apply.
- Corrupt existing `YOS_DAYSTREAM_PLAN_STATE_v1.json` is protected without overwriting; WebView export failures surface an explicit alert, and neither condition permits Notion mutation.
- Re-read the original bridge, standalone offline Scriptable bundle, and SHA-256-pinned HTML. Isolated V8 Scriptable/mock regression suite **26/26 PASS**, including wrong parent, changed provenance, forged checked keys, detached WebView and unreadable saved file. This is not evidence of a physical iPhone success.
- [Scriptable WebView API reference](https://docs.scriptable.app/webview/) documents `present()` returning after dismissal and `evaluateJavaScript()` on the loaded context, but does **not** establish that evaluation of that context **after dismissal** works in the user's iPhone version. Fail-closed behavior is implemented; actual iPhone must confirm the feature before any real Tasks are used. No production release and no live Notion change during development.

## 2026-11-02 — Explicit Save callback before WebView dismissal (replaces after-close evaluation)

The iPhone preview now has a disabled-by-default **保存して反映へ** button, enabled only when native Scriptable attaches a `WebView.evaluateJavaScript(..., true)` callback. The button captures the bounded checked/reordered day plan **while the WebView is open**, using Scriptable's documented `completion(value)` callback: https://docs.scriptable.app/webview/. The user then closes the view, and native Scriptable saves the captured data; only a separate explicit **確認して反映** confirmation can update verified existing Notion Tasks. Simply closing without tapping Save does not save via FileManager and cannot modify Notion. An unavailable callback or closing before capture fails closed. This avoids assuming that the WebView JavaScript context survives dismissal.

All pre-existing data protection remains: only today's freshly confirmed non-calendar Notion Tasks, valid parent, title/day/status, checkbox=true and page reread; a single narrowly scoped state `PATCH` after human confirmation, followed by reread. Never modify Apple, Diary or Money; no automated retries.

GitHub-native code, offline `.scriptable` package, pinned HTML and existing test suite updated in place; isolated JavaScript/Scriptable-compatible regression **28/28 PASS**, including Save-and-close and close-without-Save. This is not a claim of physical iPhone behavior: callback interaction with the installed Scriptable version, actual local FileManager storage and Notion live writeback still require an iPhone dry run. Keep Draft; no production merge/activation.
