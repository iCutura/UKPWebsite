import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against a real production build, not the dev server: both bugs these tests exist to catch
 * were CSS-resolution problems, and the dev server has served stale scoped styles before.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: 'http://127.0.0.1:4322', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Chromium at an iPhone 13 viewport: keeps the suite to one browser download while still
    // exercising the touch and narrow-width paths. Add a WebKit project if Safari-only bugs appear.
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
  ],
  webServer: {
    command: 'npm run build:offline && npm run preview -- --port 4322 --host 127.0.0.1',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
