# Hero's Journey integration audit v1

Date: 2026-08-02
Base: `main` at `d543c240728d7cc5fcf41e0c1a7142b63d4d7bc2`

## Decision

Do not merge PR #144 and PR #175 together without an explicit data migration and
file-by-file reconciliation. Continue from current `main`, preserve the #144 data
contract, and use the multiple-journey model from #175 only after its branch can
be fetched and audited. The #175 source was not present in the checkout used for
this audit, so its implementation and Actions result remain unverified.

YOS remains the sole mentor and identity. The user remains the protagonist.

## Scope and evidence limits

- Audited files: `yos/index.html`, `yos/journey.html`, `yos/journey.css`,
  `yos/journey.js`, `yos/manifest.webmanifest`, and `yos/service-worker.js`.
- No Taxi, Life, Nav, server, root PWA, or business-data file is changed.
- GitHub-synced Mission Control records PR #144 and PR #175 as drafts, and issues
  #51, #120, #142, and #158 as open.
- Direct GitHub API, web, and Git transport were unavailable in this environment.
  PR #175's files, check-run details, Vercel Preview, branch head, and exact
  ahead/behind counts therefore require a follow-up audit with GitHub access.

## Asset comparison

| Area | #144 / current main | #175 described behavior | Integration decision |
| --- | --- | --- | --- |
| Journey model | One chapter, main quest, active quests | Multiple journeys and a spiral cycle | Keep old reader; map old state into one imported journey before retiring the old model. |
| Progress | XP, completed count, streak | Twelve stages per journey and cycle count | Keep XP/history as evidence; do not infer a stage or cycle from XP. |
| Daily record | One reflection per JST day | One scene per day with edit/delete | Preserve reflection text and timestamp as imported factual material. Do not invent dialogue, feelings, results, meaning, or learning. |
| Weekly story | None | Facts aggregated into weekly works | Reuse only user-entered facts. Keep fact, interpretation, and presentation separate. |
| Works/export | None in audited main | Comic, newspaper, short story, picture book, PNG | #175-only candidate; verify implementation and iOS share/save behavior before adoption. |
| Backup | No JSON UI in audited main | Full JSON backup and restore | #175-only candidate; restoration must accept the legacy key without deleting it. |
| YOS handoff | Copies a prompt and opens the configured YOS URL | Generates a YOS consultation prompt | Reconcile into one handoff to the existing YOS chat; never create or rename a YOS identity. |
| Home entry | Journey card in `yos/index.html` | HJ entry from YOS home | Duplicate responsibility; retain one accessible entry. |
| PWA | YOS manifest and SW cache all HJ assets | PWA/offline behavior described | Reconcile cache lists and bump cache version when merged. Test offline reload, not only install. |
| Visual design | Dark command-center UI | Current PR reportedly dark; watercolor/storybook direction not proven in code | Treat the visual direction as unimplemented until code and screenshots are reviewed. |

## Storage compatibility contract

The audited implementation reads and writes `yos-hero-journey-v1`. Its durable
fields are `chapter`, `chapterMessage`, `mainQuest`, `selectedXp`, `totalXp`,
`quests`, `completed`, and `reflections`. It also reads `yos-home-settings-v2`
only to locate the existing YOS chat URL.

An integration must:

1. Never overwrite or remove `yos-hero-journey-v1` during initial migration.
2. Parse malformed or partial legacy data without preventing app startup.
3. Copy legacy records into a versioned new store and mark migration completion
   separately, so retry and rollback remain possible.
4. Preserve quest/reflection text, XP, timestamps, and JST day keys verbatim.
5. Never infer journey category, stage, cycle, facts, feelings, dialogue, meaning,
   or learning from legacy content without user confirmation.
6. Verify #175's actual storage key and schema before choosing the new-store name.

## File-conflict and PWA audit

The known same-responsibility files are `yos/index.html` and the Journey HTML,
CSS, JavaScript, and Service Worker assets. Current `yos/service-worker.js` uses
cache `yos-command-center-v4-live-link` and precaches the three Journey assets.
Because activation deletes every other cache in the YOS scope, a merge must use
one reviewed cache manifest and a deliberate version bump. The root, Taxi, Life,
and Nav service workers are outside this task and must not be edited.

## Safest integration sequence

1. Fetch the exact #175 head and its Actions metadata; record its commit SHA.
2. Compare #175 against current main and #144 file by file, including storage
   keys, manifest scope, cache name/list, and YOS-home navigation.
3. Add fixture-based migration tests before modifying either data model.
4. Port only #175-only capabilities onto current main; do not merge both PRs.
5. Preserve the legacy store until migrated data is user-verified and rollback is
   no longer required.
6. Run syntax/unit tests plus Chromium and WebKit tests, then perform the listed
   iPhone and production checks. Automated browser emulation is not an iPhone
   device verification.

## Still unverified

- PR #175 source, check runs, review state, and Vercel Preview behavior.
- Exact ahead/behind counts and same-line merge conflicts for HJ branches.
- #175 storage schema and compatibility with `yos-hero-journey-v1`.
- iPhone SE3 Safari, Add to Home Screen, standalone launch, offline relaunch,
  iOS share sheet, PNG save, JSON save/restore, existing YOS chat navigation,
  existing-device migration, and production deployment.
