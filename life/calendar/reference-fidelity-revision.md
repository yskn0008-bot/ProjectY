# Reference fidelity correction — unpublished checkpoint

User explicitly rejected the distributed design as different from the supplied images. Previous tests validated logic, not appearance. The previous claim of an approved-design implementation is superseded by this rejection.

## Correction scope

Reproduce the first reference’s compact chronological HOME composition: small YOS/LIFE FLOW identity, 今日のタイムライン, selected date, 編集 action, period selector, narrow time rail and compact pastel icon/title/duration rows, add control and bottom navigation. Separate proportional 0–24h editing from this overview, retaining exact geometry, protected source appointments, draft/undo and explicit save/readback. No reference example is imported as a personal routine.

## Safety and resume

Only source correction is checkpointed. Existing distributed installer and app stay unchanged. Generated files can be reproduced with build-timeline-review.py after restoring source from this checkpoint. Do not repin or distribute until design-qa.md has real rendered evidence. Subsequent updater must accept known current script hash47d78c6fe61eaa5ad8b3f695250559f6e2686dafd8ff16a94eb40647e8469727 in addition to earlier reviewed versions and retain conflict/readback/backup guards.

Current blockers: rendered visual comparison; physical iPhone rendering/touch/persistence; Figma editable canvas limit from earlier work. No source-data writes, deployment, merge or production changes.

## Automated source checks

`node --test timeline.test.mjs timeline.dom.test.mjs`: 30/30 passed, including compact HOME projection, explicit HOME/EDIT switching, unchanged proportional editor geometry and preservation of unsaved edits through navigation. See task-app-home-edit-test-results.txt. This result is not visual acceptance. The generated HTML/Scriptable bundles were built locally for tests but are deliberately not distributed in this source checkpoint.
