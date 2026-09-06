# MY REMOTE widgets — Issue #297

## Goal
Create three independent Scriptable medium widgets that can be stacked in the same iPhone Home Screen slot:

1. BRAVIA
2. SHARP air conditioner (physical remote A988JB)
3. Panasonic light (physical remote HK9494)

Each widget should expose only frequent controls. Tapping the title opens that appliance's full remote.

## Current status

- BRAVIA medium widget scaffold implemented and wired to the existing Sony IRCC/PSK flow.
- Tapo H110 confirmed as the IR hub.
- H110 firmware observed on-device: 1.5.4 Build 260725.
- Aircon/light full-remotes should follow the physical remotes rather than reproducing every Tapo app control.

## Tapo transport direction

H110 stores child IR remotes and key maps. Public community implementations show they can be enumerated over the local KLAP API, and stored IR keys can be fired using `control_child(... sendIrCmdById ...)`.

Target architecture:

- Tapo credentials and hub address stay only in Scriptable Keychain.
- Discover child IR remotes and their keys at runtime.
- Map the user's selected physical-remote buttons to the discovered key IDs.
- Do not hardcode account credentials, hub secrets, or user IPs in GitHub.

## Acceptance

Not complete until all three widgets are installed on the user's iPhone, stacked, and the primary buttons are verified against the real devices.