# Money Capture prototype v1

## Goal

Turn a natural one-line input such as `コンビニ850円` into a safe MY WAY Money record candidate without making the user choose a category or destination.

## Boundary

This prototype **does not write to MY WAY Money**. It emits a candidate object and has no external side effects.

At prototype creation time there was no established individual-transaction SSOT. As of 2026-09-15, current `main` contains `yos-money-v2` with a `transactions[]` collection in `yos/money-master-v1.js`, so that original storage-gap premise has changed. Persistence is still kept outside this parser PR because the current Clarity iPhone distribution is blocked at signed Shortcut generation; this prototype must not introduce an unreviewed second write path just to bypass that distribution boundary.

Raw input is preserved unchanged. Missing amount and income-like input fail closed to `needs_review`. Ambiguous categories stay `未分類` rather than forcing a guess.

## Clarity fit

The output maps directly to the existing Clarity Universal Gateway contract:

- `domain = money`
- `intent = create`
- `target = money_capture_candidate`
- `amount`
- `category_candidate`
- `destination = MY_WAY_Money`
- `applied = false`

Target flow after the current signed Clarity runtime is available:

`Clarity raw input -> model/fast parser -> Money Capture candidate -> Money executor -> verify -> ledger`

## Example

Input:

```text
コンビニ850円
```

Candidate:

```json
{
  "domain": "money",
  "intent": "create",
  "target": "money_capture_candidate",
  "amount": 850,
  "merchant_text": "コンビニ",
  "category_candidate": "未分類",
  "destination": "MY_WAY_Money",
  "applied": false
}
```

No user confirmation is required merely because the category is unknown; the expense can remain unclassified until the Money executor policy applies it.

## Verification checkpoint — 2026-09-15

The unchanged parser contract was re-run against all seven existing acceptance cases and passed 7/7. Current main's Money storage contract was separately checked before updating this document. This checkpoint does not claim iPhone persistence or physical E2E.