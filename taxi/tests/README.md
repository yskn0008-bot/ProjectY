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

## iPhone SE3 smoke test

The browser smoke test reuses the same approach as the HJ smoke tests and checks Taxi at 375 × 667 with touch enabled in Chromium and WebKit.

```bash
npm install --no-save playwright@1.55.0
npx playwright install chromium webkit
python3 -m http.server 4173 --directory .
TAXI_BROWSER=chromium node taxi/tests/iphone-se3-smoke.mjs
TAXI_BROWSER=webkit node taxi/tests/iphone-se3-smoke.mjs
```

It covers:

- Drive, Today, Week, Month and Manage pages
- Minimal, Night Gold, Light, Map and HUD themes
- horizontal overflow
- fixed bottom navigation size and viewport containment
- small touch-target count
- JavaScript page errors
- Service Worker activation
- full-page screenshots for every page/theme/browser combination

The smoke test does not change runtime code or stored Taxi data. It only writes screenshots to `test-results/taxi/`.
