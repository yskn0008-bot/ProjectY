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
