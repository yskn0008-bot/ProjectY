import { defineConfig } from '@playwright/test';

const iphone17 = {
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
};

export default defineConfig({
  testDir: '.',
  testMatch: 'iphone17.spec.mjs',
  outputDir: '../test-results/iphone17-raw',
  reporter: [
    ['line'],
    ['html', { outputFolder: '../test-results/iphone17-report', open: 'never' }],
  ],
  use: {
    ...iphone17,
    baseURL: 'http://127.0.0.1:4173/taxi/',
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-iphone17', use: { ...iphone17, browserName: 'chromium' } },
    { name: 'webkit-iphone17', use: { ...iphone17, browserName: 'webkit' } },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ../..',
    url: 'http://127.0.0.1:4173/taxi/',
    reuseExistingServer: true,
  },
});
