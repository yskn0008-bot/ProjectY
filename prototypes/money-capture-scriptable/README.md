# YOS Money Capture P0 — Scriptable / iCloud

Status: **implementation + local acceptance complete; iPhone real-device acceptance pending.**
This is not P0-complete until the device flow is tested.

## Decisions

1. **Reuse**
   - Reuse the existing Money Capture v1 parsing policy/category vocabulary.
   - Reuse the existing Scriptable + iCloud local-first pattern.
   - Keep the existing MY WAY Money `yos-money-v2.transactions[]` contract as a future bridge target.
   - Do not modify Clarity or MY WAY Money during P0 device validation.

2. **P0 minimum**
   - One Scriptable runtime: `YOS Money Capture.js`.
   - One iOS Shortcut is the preferred daily input wrapper after installation.
   - No server, database service, Vercel, Apps Script, or new standalone app.

3. **Storage / portability**
   - iCloud Drive → Scriptable → `YOS Money/transactions.json` is the P0 SSOT.
   - `transactions.csv` is regenerated after each write for human-readable export.
   - Before each mutation, the previous JSON is copied into `_backups/`; newest 14 snapshots are retained.
   - Existing data is never silently replaced if JSON parsing fails.

4. **Natural-language structuring**
   - Deterministic, conservative parser.
   - Required: amount + type (expense/income) + valid date.
   - Category/merchant/party/memo may remain blank.
   - `raw_input` is always retained for future re-parsing.
   - Unknown information is not invented.

5. **Input path**
   - Future: Clarity → this capture boundary.
   - P0 daily path: Shortcut / Siri / Action Button → Scriptable shortcut parameter → auto-save.
   - Fallback: open Scriptable script directly and enter text.
   - Scriptable URL query parameter `text` is supported for future adapters.

6. **Owner-only actions**
   - Install/open the Scriptable script on the iPhone.
   - Create/select the one iOS Shortcut that passes text into the script.
   - Perform the two required real-device acceptance inputs.

## P0 fields

`id`, `type`, `amount`, `category`, `date`, `merchant`, `memo`, `source`, `created_at`, `updated_at`, `raw_input`, `currency`, `schema_version`.

## Duplicate guard

The same normalized raw input + type + amount + date is rejected if it was saved within the previous 120 seconds. This prevents immediate accidental double-runs while allowing a legitimate repeated purchase later.

## Local acceptance

10/10 passed on 2026-09-17, including:

- `コンビニ850円` → expense 850 / category blank / merchant blank / current date
- `ENEOSで3000円` → expense 3000 / `交通・車` / ENEOS
- `母から1万円もらった` → income 10000 / party `母`
- `今日5000円入った` → income 5000
- `昨日 家賃5万円` → expense 50000 / `住居・光熱`
- `9/15 コーヒー180円` → expense 180 / `食費`
- `5000円` → no save (type missing)
- amount missing → no save
- immediate duplicate rejected; same entry after 121 seconds accepted
- summary calculation: today expense / month expense / month income / balance

## P0 real-device acceptance

Required before calling P0 complete:

1. Enter `コンビニ850円` from the iPhone input path.
2. Confirm it is saved and shown in Recent; today/month expense updates.
3. Enter `今日5000円入った`.
4. Confirm it is saved and month income/balance update.
5. Edit one record and confirm the summary changes.
6. Delete one test record and confirm the summary changes.

## Rollback / stop

- The P0 branch does not change MY WAY Money or Clarity.
- To stop daily use, disable/remove only the Shortcut or stop running the Scriptable script.
- Transaction history stays in the iCloud `YOS Money` folder and can be recovered from `_backups/`.
