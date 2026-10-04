# Flow canonicalization audit — 2026-10-04

## Result

The existing iPhone Flow family has been recovered from the five iCloud Shortcut shares supplied by the owner and canonicalized without creating a replacement Flow system.

Canonical set:

- Morning Flow → share `08b110bd699a4ee9ab7b1a1bd4bb67f3`
- Home Flow → share `904f29b9bf5d475dbd32646e458d4249`
- Work Flow → share `3b75f6e2f3d547ddbb48e366ede0f0b9`
- Out Flow → share `38dcc0c037294f419d24d4bdac2567a8`

A second supplied Morning Flow share, `ba12343727064dde851140c6715b80db`, is retained as evidence but is explicitly non-canonical because it embeds a Morning Focus-enable trigger and creates a duplicate-trigger risk against the already-verified parent Morning path.

No new Flow router, DB, SSOT, Focus system, or duplicated child processing was added.

## Source recovery

Each supplied iCloud share was recovered into three exact representations on the feature branch:

- binary unsigned Shortcut plist
- readable XML plist
- Apple-signed `.shortcut` artifact

The signed artifacts are not re-signed. Re-signing or recompiling recovered current iPhone artifacts would replace the implementation being canonicalized. Factory therefore verifies the source and the existing Apple signature container, then packages the exact signed artifact.

## Morning Flow

### Trigger

Canonical Morning Flow has **no embedded trigger**.

The canonical caller remains the existing parent `Morning` Shortcut. ProjectY production evidence already records:

`Morning -> Morning Brief + Morning Flow -> YOS Today Note`

This keeps Focus gating and orchestration in the existing parent path.

### Actions

The recovered canonical Morning Flow contains 45 actions.

It:

1. Finds the next Calendar event within the next day.
2. Reads event title, start time, and location.
3. Calculates time until the event starts.
4. If a location exists, calculates travel time.
5. Applies a 10-minute arrival buffer.
6. Derives arrival and departure targets and time until departure.
7. Returns `○余裕あり`, `△準備開始`, or `●急ぐ`.
8. The latter two urgency branches also vibrate.
9. If there is no location, parallel urgency branches return the simpler schedule-only output.
10. If no event exists, returns `○予定なし`.

### Existing YOS assets called

Morning Flow itself calls no child Shortcut.

It remains a child of the existing parent Morning path, next to:

- Morning Brief
- YOS Today Note

### Focus relation

Focus handling belongs to the existing parent Morning path.

The canonical child intentionally has no embedded Focus trigger.

### Duplicate prevention

The older supplied Morning variant has 26 actions and an embedded Morning Focus-enable trigger. It is excluded from the canonical set.

The final iPhone acceptance must confirm that this older Focus-triggered Morning variant is not active alongside the parent Morning path.

### Failure safety

The canonical Morning Flow is limited to:

- Calendar reads
- travel-time/date calculations
- variables/formatting
- output
- vibration

It contains no persistent writes, deletion, message send, purchase, payment, or data migration. Missing event and missing location are explicit safe branches.

## Home Flow

### Trigger

Embedded Focus-enable trigger for `Home`.

### Actions

**0 actions.**

The current recovered iPhone implementation is an empty no-op Flow. This is preserved rather than filled with guessed behavior.

### Existing YOS assets called

None.

### Focus relation

Runs when Home Focus is enabled.

### Duplicate prevention

Only the recovered canonical artifact is adopted. No second Home automation is added. Repeated execution has no side effects because the action list is empty.

### Failure safety

Zero actions; safe no-op.

## Work Flow

### Trigger

Embedded Focus-enable trigger for `Work`.

### Actions

**0 actions.**

The current recovered iPhone implementation is an empty no-op Flow.

### Existing YOS assets called

None.

### Focus relation

Runs when Work Focus is enabled.

### Duplicate prevention

Only the recovered canonical artifact is adopted. No second Work automation is added. Repeated execution has no side effects because the action list is empty.

### Failure safety

Zero actions; safe no-op.

## Out Flow

### Trigger

Embedded Focus-enable trigger for `Out`.

### Actions

**0 actions.**

The current recovered iPhone implementation is an empty no-op Flow.

### Existing YOS assets called

None.

### Focus relation

Runs when Out Focus is enabled.

### Duplicate prevention

Only the recovered canonical artifact is adopted. No second Out automation is added. Repeated execution has no side effects because the action list is empty.

### Failure safety

Zero actions; safe no-op.

## Factory / Verify / Audit

Existing Factory Core is reused.

Permanent Flow pipeline:

1. exact source identity validation
2. exact action sequence validation
3. exact Focus-trigger validation
4. Apple signed AEA container validation
5. exact signed-artifact packaging
6. unit tests
7. independent Flow audit
8. Git diff check
9. GitHub Actions evidence

Signing mode for all four canonical Flows is:

`preserve_existing_apple_signed_artifact`

Artifact generation copies the verified signed artifact byte-for-byte into the canonical build package.

## Completion boundary

Source recovery, canonical selection, code-level validation, artifact packaging, and independent Audit can be completed without owner intervention.

The only remaining human gate is a single native iPhone acceptance batch:

- confirm parent `Morning` is the active Morning path
- confirm the older Focus-triggered Morning variant is not also active
- enable Home / Work / Out Focus once each and confirm the current no-op behavior causes no unexpected action

No Home / Work / Out behavior should be added unless a later evidenced requirement explicitly defines it.
