import { defineConfig, devices } from '@playwright/test';

const se3 = {
  viewport: { width: 375, height: 667 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
};

export default defineConfig({
  testDir: '.',
  testMatch: 'iphone-se3.spec.mjs',
  outputDir: '../test-results/raw',
  reporter: [
    ['line'],
    ['html', { outputFolder: '../test-results/report', open: 'never' }],
  ],
  use: {
    ...se3,
    baseURL: 'http://127.0.0.1:4173/taxi/',
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-se3', use: { ...devices['iPhone SE'], ...se3, browserName: 'chromium' } },
    { name: 'webkit-se3', use: { ...devices['iPhone SE'], ...se3, browserName: 'webkit' } },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory ../..',
    url: 'http://127.0.0.1:4173/taxi/',
    reuseExistingServer: true,
  },
});
