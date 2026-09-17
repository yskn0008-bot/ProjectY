# YOS Life AUTO Router v0.1

## Purpose
Use one shared life-state contract for 起床 / 外出 / 車 / 仕事 / 帰宅 / 就寝, then connect only the existing assets needed for that state.

## Pilot routing
- 起床 -> Morning Flow -> YOS Battery Sync
- 外出 -> YOS Battery Sync
- 車 -> state only
- 仕事 -> state only
- 帰宅 -> YOS Battery Sync
- 就寝 -> Night Reset -> YOS Battery Sync

## Safety boundary
This prototype does not directly control BRAVIA, lighting, or air conditioning. It also does not directly launch child shortcuts yet. It returns an execution plan to iOS Shortcuts and stores the current state in Scriptable Keychain as `yos.life.auto.state.v1`.

Unknown states fail closed with zero actions.

## First iPhone E2E gate
Connect only two Personal Automations first:
1. Wake-up trigger -> pass `起床` to the Router.
2. Sleep/bedtime trigger -> pass `就寝` to the Router.

Do not activate the remaining states or home-device actions until both paths have been confirmed on the real iPhone.

## Completion rule
Code checks are not completion. v0.1 remains unverified for production until the iPhone E2E succeeds.
