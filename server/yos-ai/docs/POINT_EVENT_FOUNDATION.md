# Point / Event Foundation v1

Issue: #277

## Purpose

This foundation connects existing ProjectY raw/event owners without creating a second source of truth.

Target direction:

`Raw Point / Event → Context → Link → Network → Pattern → Prediction → Action / Notification → Feedback → Rule`

Phase 1 only defines the common reference contract and safety gates needed by later phases.

## Non-goals

Phase 1 does **not** add:

- a new raw/event database;
- a new localStorage key;
- migration of YOS Capture, Hero's Journey, Taxi, or Life data;
- an API endpoint or OpenAPI change;
- auth/deploy changes;
- a Service Worker change;
- UI changes;
- pattern mining, prediction, notification scheduling, or automatic rule activation.

Existing owner stores remain authoritative.

## PointEventRefV1

A Point/Event is a projection/reference to an owner record, not a replacement record.

Required fields:

- `schemaVersion = 1`
- `pointId`
- `sourceSystem`
- `sourceRecordId`
- `capturedAt`
- `occurredAt`
- `raw`
- `status = raw`
- `provenance` compatible with the existing YOS AI `SourceRef`

### Identity

When an owner has a stable ID, `pointId` is derived from:

`sourceSystem + sourceRecordId`

Examples:

- YOS Capture → `captureID`
- Taxi → `eventId`
- Hero's Journey → scene ID
- Life → emitted snapshot ID

Content similarity is never authoritative identity or dedupe.

If an owner record has no stable record ID, a caller may provide an explicit `pointId` and keep `sourceRecordId = null`. The contract does not invent an ID from guessed meaning.

### Time

`capturedAt` is the acquisition time supplied by the owner/producer.

`occurredAt` is only populated when the event time is explicitly available to the caller. Missing or ambiguous event time remains `null`. Phase 1 does not infer it from free text.

### Raw

`raw` is either:

- `{mode: "snapshot", value: <JSON-safe original payload>}`; or
- `{mode: "reference", ref: <safe owner reference>}`.

Snapshot adapters clone the JSON payload so the projection cannot mutate the owner object. Validation rejects non-JSON-safe values rather than silently rewriting them.

Raw content is never replaced by a summary.

## Existing owner adapters

### YOS Capture

`mapYosCaptureToPointEvent` preserves:

- `captureID`
- `rawText`
- `capturedAt`

The adapter does not use `parsedDateTime` to guess `occurredAt`.

### Taxi

`mapTaxiEventToPointEvent` preserves:

- `eventId`
- original JSON-safe payload
- owner-provided acquisition/event times

An owner payload such as `未確認` remains inside raw payload. The common Point/Event status remains `raw`; the adapter does not upgrade it to confirmed history.

### Hero's Journey

`mapHjRawInputToPointEvent` preserves:

- scene ID
- `rawInput`
- capture time

It does not fabricate `fact`, `confirmedFacts`, or other confirmation fields.

### Life

`mapLifeSnapshotToPointEvent` consumes an emitted read-only snapshot and snapshot ID.

It never mutates `yos-life-v1` or any owner object. Phase 1 adds no Life storage key.

### Future producers

The source-system vocabulary already reserves:

- `life-stream`
- `morning`
- `night`
- `notification`

This does not claim those producers are implemented. In particular, Phase 1 does not invent a Life Stream storage implementation.

## Derived-state safety gates

Derived state remains separate from Raw Point/Event.

### Causal Link

A `causal` link may not be `confirmed` when it has neither:

- evidence Point IDs; nor
- explicit user confirmation time.

AI output alone must remain candidate/hypothesis-level evidence.

### Rule

Rule lifecycle:

`candidate → user_approved_active → disabled / superseded`

`user_approved_active` requires:

- a positive version;
- explicit approval time;
- an approval reference.

There is no model-only path from one event, a pattern candidate, or a prediction directly to an active persistent rule.

`disabled` and `superseded` remain representable so rules are stoppable, changeable, and reversible.

## Storage/API boundary

This module is intentionally storage-agnostic.

It contains no:

- filesystem write;
- localStorage write;
- network request;
- migration routine;
- API route;
- notification sender.

Owner-specific execution remains in owner adapters and later issues.

## Phase 1 verification

Required verification:

1. TypeScript build passes.
2. `tests/*.test.mjs` includes Point/Event tests.
3. YOS Capture mapping preserves raw identity/text/time.
4. Taxi mapping preserves `eventId` and unconfirmed payload.
5. HJ mapping does not fabricate confirmed facts.
6. Life mapping is detached/read-only.
7. missing `occurredAt` stays `null`.
8. stable source identity gives stable `pointId`.
9. custom JSON raw payload survives validation without semantic rewrite.
10. causal confirmation gate fails closed without evidence/user confirmation.
11. rule activation gate fails closed without explicit user approval.
12. final Git diff contains only the additive Point/Event files and no source storage/API/SW/product changes.

## Current parallel-lane boundary

At implementation time, PR #276 owns `life/**` / `yos/**` and related Service Worker/HJ smoke changes.

PR #278 owns ProjectY HQ automation changes including `.github/**`, `server/yos-ai/package.json`, `server/yos-ai/api/yos/projecty-decision.mjs`, its schema, and its test.

Phase 1 does not modify those files.
