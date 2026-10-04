# Home / Out appliance automation — Tapo H110 decision (2026-10-04)

## Decision

Home / Out appliance automation is owned by **Tapo H110 Smart Actions / Geofencing**, not by Scriptable.

Reason:
- Current MY REMOTE Scriptable implementation talks directly to the H110 over the home LAN.
- Once the iPhone leaves the home Wi-Fi, that LAN route is unavailable.
- Tapo H110 supports remote/cloud control and GPS-linked Smart Actions.
- No Apple Home hub is currently available, so Matter / Apple Home is not the selected runtime.

## Responsibility split

### YOS / Shortcuts
Owns:
- Morning / Home / Work / Out life-flow orchestration
- schedule/task/context judgement
- user-facing result when action is actually needed

Must not depend on:
- auto-opening Scriptable
- MY REMOTE being foregrounded
- home Wi-Fi being connected

### Tapo H110
Owns:
- arrival / departure geofence
- IR appliance automation
- execution while the iPhone is away from the home LAN

### Scriptable / MY REMOTE
Remains:
- manual remote control
- detailed appliance controls
- troubleshooting / fallback while reachable

It is **not** the Home / Out geofence automation engine.

## Selected appliance policy

### Out / leaving home
Default safe actions:
1. Light: OFF
2. Air conditioner: OFF
3. TV: automate only if the Tapo action exposed on the actual iPhone is a discrete OFF command.

Do not automate a TV power-toggle as an OFF action. IR is one-way; a toggle can turn an already-off TV back on.

### Home / arriving home
Default safe actions:
1. Floor lamp: ON.
2. Main white ceiling light: manual on arrival; do not auto-ON.
3. Air conditioner: no unconditional ON in v1.
4. TV: no automatic ON.

Reason: arrival should improve comfort without creating unnecessary energy use or surprise playback. AC arrival automation can be added later when there is a reliable condition (for example temperature sensor) or an explicitly approved fixed rule.

## Geofencing requirements

Tapo app:
- Precise Location enabled.
- Location permission must allow background / always-on location use.
- Geofencing enabled for this iPhone.
- Create one Arrive automation and one Leave automation.
- Use the actual home location selected inside Tapo; do not duplicate the address into ProjectY.
- Effective time: all day for Leave. Arrival lighting may be restricted later if the app/device evidence supports a useful time condition.

## Duplicate prevention

- Do not add a second iOS Personal Automation for the same appliance state.
- Home / Out Focus can remain the YOS life-context trigger, but it must not duplicate Tapo appliance actions.
- Existing MY REMOTE commands remain manual only.

## Failure safety

- Departure actions are idempotent only when the underlying device action is explicit OFF.
- Exclude any ambiguous toggle-only action from unattended automation.
- Arrival actions must not turn on TV.
- Arrival AC remains disabled until a reliable condition or explicit fixed rule exists.
- No new DB, SSOT, router, or state ledger is created.

## Acceptance criteria

Tapo physical iPhone verification:
1. Leave geofence fires with iPhone locked and after home Wi-Fi disconnects.
2. Light turns OFF.
3. AC turns OFF.
4. TV is included only if Tapo exposes a discrete OFF action and it is verified not to toggle ON from an already-off state.
5. Arrive geofence fires with iPhone locked.
6. Floor lamp turns ON; main white ceiling light remains manual on arrival.
7. No Scriptable screen opens for either automation.
8. Existing MY REMOTE manual control still works when used normally.

ProjectY status remains incomplete until those physical checks pass.
