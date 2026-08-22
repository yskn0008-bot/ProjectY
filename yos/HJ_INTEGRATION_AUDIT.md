# Hero's Journey UX audit

Date: 2026-08-16  
Audited base: `main` at `4359b1e0cc1a08932b521c59329d0ea1b219ca27`  
Audited PR: Draft PR #175 at `d95d5f81be2f849aaf99912ac88ee4fce9db03dd`

## Decision

Treat the first-use stop — “I do not know what to do first” — as a blocking UX
defect. Continue the existing PR #175 and preserve its HJ data and feature set.
Replace the initial operation model with a conversation-first entry; do not add a
new HJ, a new PR, or a second AI personality.

YOS remains the sole AI personality. The user remains the source of truth and the
protagonist. HJ remains a map, not a linear progress meter or ranking.

## First-time-user audit

| Friction | Why a first-time user stops | Amendment |
| --- | --- | --- |
| Profile setup opens before the user can act | Requires name, domain, stage, theme, format, and tone before value is visible | Never force the setup dialog; keep it available from Settings |
| Three HJ areas and specialist terms appear together | Requires the user to understand the product model before using it | Show one primary action, “今のことを話す”; put the existing map and story tools behind “詳しく見る” |
| The daily scene form asks for many classifications | Fact, feeling, choice, result, stage, and archetypes are simultaneous decisions | The primary route asks one question and accepts ordinary free text |
| Save is an explicit operation | The user must remember system behavior while talking | Autosave Raw Input in the existing scene store and show a small status |
| Returning does not foreground unfinished input | The user must search for the prior record | Show “前回の続き” and reopen the saved draft |
| Free text could be mistaken for fact | A statement can mix fact, feeling, interpretation, assumption, and guess | Store it as Raw Input; never copy it into `fact` without confirmation |

## Storage compatibility contract

No storage key is added. Conversation records extend objects inside the existing
`hj-daily-scenes-v1` array with optional fields:

- `source`: `raw-input` for an unstructured user statement
- `rawInput`: the user's original text
- `confirmedFacts`: facts explicitly confirmed by the user
- `candidates`: proposed structured information, each with type, value, status,
  and evidence
- `evidence`: source evidence retained for later review
- `unknown`: unresolved categories
- `conversationStatus`: `draft`, `raw`, or `confirmed`

An unstructured statement keeps `fact` empty. Raw Input is excluded from weekly
fact aggregation. Existing scene, journey, profile, story, history, backup, and
legacy Journey keys remain readable. Missing optional fields normalize to empty
values; there is no destructive migration and no removal of legacy data.

## YOS AI integration boundary

Issue #120 provides a YOS AI v0.4 service contract, including `/api/yos/chat` and
separate facts, assumptions, unknowns, conflicts, sources, safety, next action,
and memory candidates. Production connection is not complete: external Google
authentication, OpenAI/Upstash configuration, allowed origins, PWA connection,
and physical-device verification still require completion.

This UX change therefore does not claim that AI understood or classified a
statement. It safely captures Raw Input and prepares candidate/evidence/unknown
fields for the later flow:

1. natural conversation;
2. AI proposals separated from the source;
3. one lightweight user confirmation at a time;
4. only confirmed information written as HJ structure.

API failure, missing authentication, offline use, or Issue #120 incompleteness
must never prevent or erase Raw Input. No `/server` file is changed by this PR.

## Scope and conflict audit

The audited `main`-side commits after PR #175's base change only
`data/mission-control.json`; they do not overlap HJ product files. The PR is
rebased onto current `main` before publication. Root, Taxi, Life, Nav, server,
and business-data implementation are out of scope.

Implementation files are limited to the existing HJ entry, styling, profile,
scene, current-location, editor, service-worker, smoke tests, and this audit.
Existing current-location, 12 stages, 12 archetypes, daily scenes, weekly stories,
backup/restore, YOS handoff, and offline assets are retained.

## Acceptance boundary

Automated checks cover forced-onboarding absence, a single primary conversation
CTA, one visible question, autosave/resume, Raw Input separation, old-data load,
existing features, backup/restore, no horizontal overflow, Chromium, WebKit, and
offline relaunch at 375×667.

Automation does not decide whether the experience feels familiar. Final UX
acceptance requires an explanation-free test on the physical iPhone 17. HJ is
not complete if the user still hesitates. Generated-AI integration and production
completion remain separately tracked until natural conversation → proposals →
user confirmation → structured HJ save succeeds on the physical device.
