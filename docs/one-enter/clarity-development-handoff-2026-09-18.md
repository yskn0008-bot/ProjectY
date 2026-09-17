# Clarity development handoff — 2026-09-18

Status: One Enter development SSOT update

## Decision

Treat Apple Shortcuts **Use Model / モデルを使用** as the preferred implementation path to validate for Clarity's **UNDERSTAND** layer.

This is **not** a retirement of the existing Clarity implementation. It is a newly discovered preferred implementation path and remains subject to physical iPhone E2E acceptance.

## Physical iPhone evidence already observed

A single natural-language input was successfully decomposed into multiple actions on a physical iPhone using Shortcuts' model action.

Observed intent decomposition included:

- Calendar
- Shopping
- Idea

This establishes that model-assisted multi-intent decomposition is viable enough to prioritize for the next integration step. It does not by itself prove the complete Clarity execution pipeline.

## Preferred architecture

```text
INPUT
→ RAW FIRST
→ CONTEXT
→ UNDERSTAND (Shortcuts model action prioritized for validation)
→ structured intent/action data
→ PLAN / POLICY
→ existing ROUTER contract
→ YOS child Shortcuts
→ EXECUTE
→ VERIFY
→ LEDGER
→ FEEDBACK
```

Do not grow a giant fixed Router to perform language understanding. The preferred separation is:

1. Model interprets natural language and produces structured intent/action data.
2. Existing Router consumes that structure and selects the appropriate execution path.
3. Existing `YOS_*` / approved child Shortcut executes the iPhone-side action.
4. Existing Policy, Verify, Ledger, and Feedback controls remain responsible for safety and outcome verification.

## Preserve / do not remove

- Existing Clarity
- Raw First
- Context handling
- Policy
- Verify
- Ledger / Feedback
- Existing Router contract
- Existing YOS child Shortcut structure
- Existing execution path as fallback until the new path passes physical iPhone E2E

No destructive cutover is authorized by this handoff.

## Next implementation step

Change the model output from display-oriented prose to **structured data** and connect it to the existing Router contract.

The structured output must preserve enough information for downstream Policy and Verify stages and must support multiple ACTIONs from one natural-language input.

Do not enable normal cutover until physical iPhone E2E proves the new path end-to-end. On failure, retain/fall back to the existing Clarity execution path.

## Coordination rule

All One Enter / Clarity development should consult this handoff before extending the UNDERSTAND or Router layers. New work that assumes the previous fixed-language-understanding approach is the preferred path should be reconciled with this decision first.

PR #374 remains relevant for the Money child executor and physical acceptance work; this handoff changes the preferred UNDERSTAND implementation path, not the child executor contract or rollback requirement.
