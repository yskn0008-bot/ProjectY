# Taxi safety tests

Run from the repository root:

```bash
node --check taxi/service-worker.js
node --test taxi/tests/service-worker-safety.test.mjs
```

The Service Worker safety test checks:

- Taxi-only cache namespace and cache/version synchronisation
- duplicate or unsafe paths in the `STATIC` manifest
- existence of every precached Taxi asset
- inclusion of every injected CSS/JavaScript asset in `STATIC`
- required page precaching and `/taxi/` route mapping
- deletion of old Taxi caches only
- network-first navigation with cached fallback

These tests do not change runtime behaviour or stored Taxi data.
