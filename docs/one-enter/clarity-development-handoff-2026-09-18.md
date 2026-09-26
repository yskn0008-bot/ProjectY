# Clarity development handoff — 2026-09-18

Status: One Enter development SSOT update

## Decision

Treat Apple Shortcuts **Use Model / モデルを使用** as the preferred implementation path for Clarity's **UNDERSTAND** layer.

The current physical-iPhone entry prototype is **Clarity Demo**. It is the entry path to extend next.

This is **not** a retirement of the existing Clarity implementation. It is a newly discovered preferred implementation path and remains subject to physical iPhone E2E acceptance.

## Physical iPhone evidence already observed

On the physical iPhone, **Clarity Demo** currently runs:

```text
voice input
→ ChatGPT / モデルを使用
→ natural-language understanding
→ multi-intent decomposition
→ display result
```

A single natural-language input was successfully decomposed into multiple actions.

Observed decomposition included:

- Calendar
- Reminder / Shopping-style follow-up
- Idea

Example physical result showed one spoken input being separated into Calendar, Reminder and Idea intents.

This proves that the **Clarity Demo entry + model understanding** path is viable enough to become the implementation priority. It does not yet prove structured Router execution.

## Important correction — proof Shortcuts are not the entry path

The following proof artifacts are **repository / compile / signing proofs only** and must not be treated as the normal physical-iPhone entry or as the next owner installation path:

- `YOS_Test`
- `Clarity Dispatcher Proof`
- `Clarity Model Router Proof`

Repeated physical-device correction attempts around those proof Shortcuts do not replace the working Clarity Demo entry direction.

Do **not** ask the owner to install or use those three as the normal Clarity entry.

Their useful repository evidence may be retained, but future physical integration should start from the working **Clarity Demo** prototype and connect that path forward.

## Preferred architecture

```text
Clarity Demo / final Clarity entry
→ INPUT
→ RAW FIRST
→ CONTEXT
→ UNDERSTAND (Shortcuts model action)
→ structured multi-ACTION data
→ PLAN / POLICY
→ existing Router contract
→ approved child executors
→ EXECUTE
→ VERIFY
→ LEDGER
→ FEEDBACK
```

Do not grow a giant fixed Router to perform language understanding. The preferred separation is:

1. Clarity receives one natural voice/text input.
2. The model interprets it and emits structured multi-ACTION data.
3. Existing Policy checks the structured actions.
4. Existing Router consumes that structure and selects the appropriate child executor.
5. Child executors perform the iPhone-side action.
6. Verify / Ledger / Feedback confirm the outcome.

## Preserve / do not remove

- Existing Clarity assets
- Clarity Demo as the current physical prototype entry
- Raw First
- Context handling
- Policy
- Verify
- Ledger / Feedback
- Existing Router contract
- Existing child-executor structure
- Existing execution path as fallback until the new path passes physical iPhone E2E

No destructive cutover is authorized by this handoff.

## Next implementation step

Modify **Clarity Demo** rather than replacing the entry with proof Shortcuts.

Change the model output from the current display-oriented prose into **structured data** that supports multiple ACTIONs from one natural-language input.

Then connect that structured output to the existing Router contract while preserving Policy / Verify / Ledger / Feedback and fallback behavior.

The immediate target is:

```text
Clarity Demo
→ one natural input
→ structured ACTION[]
→ existing Router
→ child executor
→ verified result
```

Do not enable normal cutover until physical iPhone E2E proves this path end-to-end.

## Coordination rule

All One Enter / Clarity development should consult this handoff before extending the UNDERSTAND or Router layers.

If another branch/chat proposes installing or using `YOS_Test`, `Clarity Dispatcher Proof`, or `Clarity Model Router Proof` as the main entry, treat that as stale implementation direction and reconcile it with this handoff first.

PR #374 remains relevant for the Money child executor and physical acceptance boundary. This handoff changes the preferred entry/UNDERSTAND integration path, not the Money ledger or rollback requirements.

## Automation-first implementation rule

For One Enter / Clarity iPhone work, do not default to asking the owner to manually assemble Shortcut actions.

Preferred implementation order:

1. Reuse the existing Clarity Factory / code-generation path.
2. Generate or patch the Shortcut in source.
3. Compile automatically.
4. Run repository validation automatically.
5. Sign automatically when the established signing path is available.
6. Give the owner only the finished signed Shortcut.
7. Ask for physical-device verification only where the owner is the only party who can perform it.

Additional guardrails:

- Do not use repeated manual "add action / if / dictionary / repeat" construction as the standard path.
- If the same class of physical failure requires a second correction, stop local hand-editing and fix the Factory/source instead.
- Do not repeatedly ask the owner to paste replacement code when the repository/Factory path can produce the corrected artifact.
- Proof-only Shortcuts remain proof assets and must not be substituted for the actual owner-facing entry.
- A generated Shortcut is not complete until physical iPhone E2E confirms the intended path.
- Preserve rollback/fallback until that physical acceptance passes.

Current generated physical harness:
- `Clarity Demo Auto`
- source: `tools/clarity-factory/clarity-demo-auto.cherri`
- purpose: automate the structured JSON → Router validation for the working Clarity Demo direction without requiring manual Shortcut construction.
