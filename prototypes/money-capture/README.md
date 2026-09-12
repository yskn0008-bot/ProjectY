# Money Capture prototype v1

## Goal

Turn a natural one-line input such as `コンビニ850円` into a safe MY WAY Money record candidate without making the user choose a category or destination.

## Boundary

This prototype **does not write to MY WAY Money**. Current Money UI reads aggregate values from existing Life data (`life.moneySafety` / `today.money`) and no individual-spend ledger is established as SSOT yet. The prototype therefore emits a candidate object that Clarity can route later.

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

Future flow:

`Clarity raw input -> model/fast parser -> Money Capture candidate -> Money executor -> verify -> ledger`

The Money executor should only be added after the individual transaction storage contract is fixed. Until then, this candidate layer avoids creating a second financial SSOT.

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

No user confirmation is required merely because the category is unknown; the expense can remain unclassified until the Money ledger/executor policy is defined.
