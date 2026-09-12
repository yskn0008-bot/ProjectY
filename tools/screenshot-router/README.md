# YOS Screenshot Router v1

## Goal

Stop making the owner decide where every iPhone screenshot belongs.

The shortest usable path is to replace the ordinary screenshot gesture for screenshots worth keeping with one Shortcut:

```text
Back Tap
  -> YOS Screenshot Router
  -> Take Screenshot
  -> Raw First: iCloud Drive/Shortcuts/YOS Screenshots/Inbox
  -> on-device OCR
  -> ChatGPT Dictionary classification
  -> categorized copy
     - 資料
     - 買い物
     - 予定
     - Idea
     - 仕事
     - 未分類
  -> append lightweight index.tsv metadata
  -> silence on success
```

Apple documents that iOS 26 can run a Shortcut from double/triple Back Tap, so v1 does not need a new app or a continuously running background process.

## Why this shape

There is no screenshot-taken Personal Automation trigger used by this prototype. Instead, the Shortcut itself performs the screenshot capture. That makes the capture event and routing one operation and avoids polling the Photos library.

The prototype intentionally does not modify the current Clarity runtime while its new implementation is still moving. Its output is designed as a future Clarity input adapter: `index.tsv` preserves category + summary metadata, while the raw image remains recoverable.

## Safety / ownership

- The raw screenshot is saved before AI classification.
- Classification has a strict allowlist: `reference | shopping | schedule | idea | work | other`.
- Confidence below 0.70 must fail closed to `other / 未分類`.
- v1 does **not** create Calendar events, Reminders, purchases, emails, messages, Idea records, or work records.
- No API key, bearer token, account secret, private host, or user content is embedded in the Shortcut source.
- Runtime screenshots/OCR are not present in build artifacts or signing requests.

## Storage trade-off in v1

Each successful run keeps two file copies:

1. `Inbox/<timestamp>.png` — Raw First recovery copy.
2. `<category>/<timestamp>.png` — user-facing organized copy.

This is deliberate for the prototype so a model/classification or later routing mistake cannot destroy the original. A later cleanup layer can remove aged Inbox copies only after iPhone E2E proves the categorized copy is durable. Do not add automatic deletion before that acceptance.

## Build and signing status

Repository compile acceptance and iPhone-installable signing are separate.

- Source contracts: verified in CI.
- Secret-free guard: verified in CI.
- Cherri v2.3.0 compile: verified in CI.
- Signed `.shortcut`: currently blocked by the signing environment, not by source compilation.

The tested GitHub-hosted macOS runner cannot use Apple's native `shortcuts sign` because that runner is not signed into the owner's iCloud account. Cherri's public HubSign fallback was also unavailable during the verified attempt. For that reason, PR/push CI treats successful compilation as code acceptance and does not misreport an external signing outage as a source failure. A manual workflow dispatch can retry the signing path when a valid signer is available.

The unsigned workflow artifact is proof-only and is **not** presented to the owner as an installable Shortcut. Repository governance evidence must likewise report physical iPhone readiness separately from code readiness.

## Intended iPhone setup

After a signed Shortcut artifact is genuinely available:

1. Import `YOS Screenshot Router.shortcut` once.
2. Allow Files / screenshot / ChatGPT permissions when iOS first asks.
3. Set `Settings -> Accessibility -> Touch -> Back Tap -> Triple Tap -> YOS Screenshot Router`.
4. Use triple Back Tap instead of Side + Volume Up when the screenshot should be automatically organized.

Double Back Tap may be used instead if it is not already assigned. Triple Back Tap is the default recommendation to reduce accidental captures.

## Acceptance

Repository readiness is separate from physical iPhone readiness.

A physical iPhone check must confirm:

- a screenshot is actually captured;
- the raw file appears in `YOS Screenshots/Inbox`;
- text is extracted from a representative screenshot;
- the model returns a valid category;
- the categorized file appears in the expected folder;
- success produces no unnecessary notification/dialog;
- an ambiguous screenshot lands in `未分類`;
- no Calendar/Reminder/purchase/external write occurs;
- Back Tap reliably launches the Shortcut in normal apps.

Until those checks pass, do not call this `利用可能`.

## Future connection

Once the new Clarity Universal Gateway stabilizes, only an adapter should be added:

- `予定` -> Calendar candidate (`needs_review`, no silent external write)
- `買い物` -> Shopping candidate / price-watch candidate
- `Idea` -> Idea Inbox candidate
- `仕事` -> work capture candidate
- `資料` -> file-only by default

The screenshot image remains owned by Files; Clarity should consume a reference/metadata projection rather than becoming a second image SSOT.
