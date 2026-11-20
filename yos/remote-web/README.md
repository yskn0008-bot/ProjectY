# YOS Remote Web — safe prototype

## Status
Static interface and command contract implemented. Diagnostic BRAVIA gateway implemented for **loopback-only Node.js hosts**. This is NOT a remotely accessible or finished iPhone web app. The Tapo/Matter device adapters, secure LAN gateway, hosting and real-device tests are pending.

## Tests
From this directory: `node --test tests/*.test.mjs` (Node.js 20+). Tests do not touch physical devices.

## Local diagnostic only
On a trusted computer inside the home LAN, set `YOS_REMOTE_TOKEN` to a random secret of at least 32 characters, `YOS_BRAVIA_HOST` to the BRAVIA's local IPv4 address, and `YOS_BRAVIA_PSK` to the TV's configured PSK. Run `node gateway.mjs`. Server binds **127.0.0.1** only. The UI does not transmit the token, so it cannot yet control the gateway; the endpoint can be exercised locally with an explicit Bearer token for diagnostics. Do not put secrets into a repo, terminal history, public URL or client JavaScript. Do not bind this diagnostic gateway to 0.0.0.0 or port-forward it.

## Why it is not ready
iPhone Safari cannot access a different computer's loopback listener. An always-on trusted LAN execution point and secure authenticated transport must be selected and physically tested. Current setup only establishes a BRAVIA diagnostic transport and fails closed for Tapo. Existing Scriptable remains the working fallback.

## Go/no-go
No production deployment until iPhone-to-LAN secure access, CSRF/authentication, Tapo device identification, color/brightness capability and hardware tests all pass.
