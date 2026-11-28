# YOS Remote Web — implementation boundary

## Existing assets
- `ios-app/scriptable/remote-widgets/YOS Remote Hub.js`: UI and TV button definitions.
- `YOS Tapo H110 Core.js`: KLAP v2 local LAN communication and credential handling in Scriptable Keychain.
- `YOS Remote Direct Actions.js`: validated light, AC and floor command subset.
- `ios-app/docs/issue-254-spike.md`: BRAVIA IP control design and secure credential boundary.

## Non-negotiable architecture
The web page is an unprivileged UI. It never stores BRAVIA PSK, Tapo account credentials, KLAP keys, LAN IPs, or API tokens in source, browser localStorage, query strings or GitHub. An authenticated `POST /api/remote/command` is a proposed contract, not an implemented endpoint. It MUST NOT be publicly enabled until the trusted LAN-side execution path exists.

A hosted HTTPS page cannot be assumed to communicate directly with HTTP RFC1918 devices (mixed content, Private Network Access, CORS and network reachability). Do not introduce a publicly reachable unauthenticated proxy or forward private credentials to a cloud service.

## Candidate paths (test before selecting)
1. Official cloud control where documented and supported by the exact devices, with authorization and revocation.
2. LAN-resident gateway with secure authenticated remote access; this requires an always-on LAN host or supported gateway and is not assumed to exist.
3. Browser-only LAN control only if HTTPS/CORS/permission/credential constraints are proven on physical iPhone Safari.

## Safety
- Preserve existing Scriptable scripts and Keychain values.
- Require authorization, origin validation, strict command allowlist, rate limiting and device-level access restrictions for the command endpoint.
- Explicitly distinguish network accepted / device acknowledged / observed state.
- Do not retry non-idempotent IR commands blindly; fail closed on unknown state.
- Never expose a control endpoint in a public GitHub Pages deployment without a real authenticated gateway.
- No automatic deployment or migration without verified iPhone and device testing.

## First milestone
The isolated static UI exists at `yos/remote-web/index.html`. It intentionally shows an error when the API endpoint is absent. It is NOT a functioning remote.

## Remaining
Identify actual floor lamp model and Matter controller availability, confirm current hosting and LAN topology, implement and test the secure device adapter, validate on iPhone Safari, then decide deployment and cutover.
