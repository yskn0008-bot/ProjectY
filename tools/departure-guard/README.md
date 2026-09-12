# YOS Departure Guard v0.1

## Status

Isolated Scriptable prototype. It does not modify MY WAY, Life, Morning Flow, Battery Widget, Remote, or production data.

- Repository implementation: prototype branch only
- Physical iPhone: **not yet verified**
- Calendar / notification permissions: **not yet verified on the physical iPhone**
- Existing Shortcut Factory PoC is not used as a completion claim because its current generated action is only an Open App PoC and physical import is still unverified.

## Purpose

Run an outward-bound check without creating another screen to manage.

The default behavior is silent. A notification appears only when there is something useful to act on:

- departure time is close or already passed
- iPhone / AirPods / AirPods case battery is below the prototype threshold
- AirPods battery information is stale when an actual leaving signal is received
- the next event explicitly declares exceptional carry items

## Existing assets reused

- `YOS Battery Widget` local data file: `YOS-Battery-Widget-v1.json`
- existing Battery Sync path that refreshes AirPods / case data
- iOS Calendar data through Scriptable `CalendarEvent`
- iPhone battery through Scriptable `Device`
- local notification through Scriptable `Notification`
- Morning Flow and the existing AirPods-connect Automation as trigger candidates

No new backend, account, paid service, or database is required.

## Prototype defaults

These are provisional and live in one CONFIG block at the top of `YOS Departure Guard.js`.

- look ahead: 6 hours
- normal departure lead: 45 minutes before event start
- timing alert: departure within 20 minutes
- battery check near scheduled departure: within 60 minutes
- iPhone warning: below 40%
- AirPods warning: below 30%
- case warning: below 20%
- AirPods/case data considered stale: 90 minutes
- duplicate suppression: 25 minutes

## Optional event-note syntax

Nothing is required for normal events. Only exceptional events need metadata.

```text
持: 保険証, 診察券
出発: 60
```

`持:` / `持ち物:` lists things that should be shown near departure. This is a reminder, **not physical presence detection**.

`出発:` overrides the default lead time in minutes before the event. Example: `出発: 60` means the departure target is one hour before the event starts.

## Recommended wiring

### Existing AirPods connection Automation

Keep the existing Battery Sync first, then run this script second.

```text
AirPods connected
→ YOS Battery Sync
→ Scriptable: Run Script “YOS Departure Guard”
   Parameter: leaving
```

This gives the guard a fresh AirPods/case reading immediately before it decides whether to interrupt.

### Morning Flow

At the end of Morning Flow, add this script with parameter `morning`.

```text
Morning Flow
→ existing flow
→ Scriptable: Run Script “YOS Departure Guard”
   Parameter: morning
```

Because the guard is silent by default, adding it does not create another daily confirmation screen.

## Decision behavior

Examples:

### Nothing wrong

```text
Next event is not close
Battery is fine
No exceptional carry items
→ no notification
```

### Needs attention

```text
出発チェック
次: 14:00 歯医者
出発目安: 13:15
場所: ○○歯科
⚠︎ 出発まであと12分
⚠︎ iPhone 31%
⚠︎ 持ち物: 保険証・診察券
```

Repeated identical warnings are suppressed for 25 minutes.

## Important limitation in v0.1

The prototype calculates departure time as `event start - lead minutes`. It does **not** yet calculate live route/travel time from the current position to the event location.

That is intentional: the Scriptable APIs used here expose Calendar event location but not a verified native travel-time API. The next upgrade should connect a verified Apple Maps/Shortcuts travel-time action rather than guessing a private Shortcut schema.

Also, “forgotten item” means a departure reminder from calendar notes in v0.1. Actual possession detection would require a separate trusted signal such as a supported device/location presence source.

## Physical acceptance

Do not call this complete until the physical iPhone confirms all of the following:

1. Scriptable can read the synced calendar containing the real events.
2. Notification permission is granted and a real alert appears only when a test condition is triggered.
3. iPhone battery percentage is correct.
4. After `YOS Battery Sync`, AirPods and case percentages match the existing widget data.
5. A normal/no-problem run stays silent.
6. `持:` and `出発:` metadata are parsed correctly.
7. AirPods-connect Automation runs Battery Sync first and Departure Guard second.
8. Morning Flow still works normally after adding the final Scriptable action.

## Rollback

Remove the final `YOS Departure Guard` action from Morning Flow / AirPods Automation and delete the Scriptable script. Existing Battery Widget and Battery Sync remain untouched.
