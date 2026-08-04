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

## iPhone SE3 browser smoke tests

Install the browser-test dependencies and browsers, then run from the repository root:

```bash
npm --prefix taxi/tests install
npx --prefix taxi/tests playwright install chromium webkit
npm --prefix taxi/tests run test:se3
```

The Playwright suite runs Chromium and WebKit at `375 x 667` with touch enabled. It
checks the Sales, Today, Week, Month, and Management views, all five themes,
horizontal overflow, bottom-menu overlap, clipped text, 44 px navigation targets,
uncaught JavaScript exceptions, and Service Worker control. Full-page screenshots
are written to `taxi/test-results/artifacts/`; the HTML report and traces for every
browser run are kept beneath `taxi/test-results/` for CI artifact upload.
