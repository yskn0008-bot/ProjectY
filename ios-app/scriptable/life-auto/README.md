# YOS Life AUTO Router v0.2

## Purpose
Use one shared life-state contract for 起床 / 外出 / 車 / 仕事 / 帰宅 / 就寝, then call only the existing shortcuts needed for that state.

## Pilot routing
- 起床 -> Morning Flow -> YOS Battery Sync
- 外出 -> YOS Battery Sync
- 車 -> state only
- 仕事 -> state only
- 帰宅 -> YOS Battery Sync
- 就寝 -> Night Reset -> YOS Battery Sync

## Execution
The Router uses Apple's Shortcuts x-callback URL from Scriptable and waits for each child shortcut to finish before moving to the next allowlisted action. It stores the current state in Scriptable Keychain as `yos.life.auto.state.v1` and returns a JSON result containing each execution result.

Pass a plain state such as `起床` for normal execution. For a no-action check, pass JSON such as `{"state":"起床","dryRun":true}`.

Unknown states fail closed with zero actions.

## Install path
Use `YOS Life AUTO Bootstrap.js` as the one-paste entry point on iPhone. The Bootstrap downloads the pinned `YOS Life AUTO Installer.js`, verifies it, saves it into Scriptable iCloud, and opens it. The Installer then downloads the pinned Router, verifies required markers, backs up an existing Router if present, writes the new Router, verifies the written file, and rolls back on failure.

Rollback: if an older Router existed, its content is preserved as `YOS Life AUTO Router.js.backup`. The production/main branch is not changed by this prototype.

## Safety boundary
This prototype does not directly control BRAVIA, lighting, or air conditioning. Only the named existing shortcuts in the route table can be launched. 車 and 仕事 intentionally execute nothing in v0.2.

## First iPhone E2E gate
Connect only two Personal Automations first:
1. Wake-up trigger -> pass `起床` to `YOS Life AUTO Router` in Scriptable.
2. Sleep/bedtime trigger -> pass `就寝` to the same Router.

Do not activate the remaining states or home-device actions until both paths have been confirmed on the real iPhone.

## Verification
Local syntax checks pass for Router / Installer / Bootstrap. Contract tests pass for all six states, fail-closed unknown input, dry-run, callback execution order, Installer pin/rollback markers, and Bootstrap pin/install/open markers.

## Completion rule
Code checks are not completion. v0.2 remains unverified for production until the iPhone E2E succeeds.
