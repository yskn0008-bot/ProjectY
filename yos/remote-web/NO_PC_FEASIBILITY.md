# No always-on PC: feasibility decision (2026-11-14)

## Confirmed
- Tapo H110 is a Matter bridge for IR appliances, and supports Tapo app remote controls and third-party ecosystems. Source: https://www.tp-link.com/jp/home-networking/smart-hub/tapo-h110/
- TP-Link's official compatibility matrix shows limited IR features on Matter/Apple Home, and IR status cannot be trusted as observed device state: https://www.tp-link.com/jp/support/faq/4128/
- Apple Home can pair some Matter devices on iOS 18+ without a separate home hub, but automations and remote access need a home hub. This is **Apple Home functionality**, not a JavaScript/Safari Matter API: https://www.tp-link.com/us/support/faq/3520/
- Existing BRAVIA control uses local HTTP with PSK and IRCC. Sony documents this as trusted LAN control: https://pro-bravia.sony.net/remote-display-control/rest-api/structure/

## Architecture conclusion
With iPhone + existing appliances only, there is **no verified path** to full 4-device, no-Scriptable, pure Safari control. Do not claim that H110 Matter makes a Safari web API. Do not place Tapo credentials or BRAVIA PSK in a public web app.

## No-new-hardware alternatives, in preference order
1. Try native Apple Home integration via H110 Matter bridge. Validate whether light and AC appear and exactly which controls work. This does not directly satisfy the custom web UI requirement.
2. Check whether existing Tapo iOS app exposes Siri Shortcuts/App Shortcuts actions for needed commands. A web page could launch a user-installed Shortcut via URL, but app transitions, confirmation and return navigation must be tested; this is **not** an in-browser direct remote.
3. Consider an iOS native shell with local network permissions and Keychain only if pure Safari fails and user approves a non-Web-only implementation. Existing Capacitor code is a potential asset; signing and on-device install are unresolved.
4. Revisit always-on secure LAN bridge only if user later has a suitable device. No additional device is assumed.

## Validation needed from iPhone
- In Tapo app H110 settings: verify 'Bind to Matter' and firmware version, without resetting or exposing pairing codes.
- In Apple Home: check available accessories and controls after pairing (pairing requires user approval).
- In Shortcuts: check Tapo actions for all desired commands.
- In Safari: test only harmless same-LAN read-only probe if device allows, without embedding PSK or exposing credentials.
- Confirm floor lamp exact model and whether it is native Matter.

## Stop conditions
No deployment of a fake working remote. Keep PR draft, Scriptable unchanged. A full-Web claim requires confirmed secure transport and physical device tests.
