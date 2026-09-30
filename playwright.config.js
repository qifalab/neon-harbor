import { defineConfig } from '@playwright/test';
const testPort = process.env.NEON_TEST_PORT || '5173';

export default defineConfig({
  testDir: './tests/e2e',
  // Shared CI CPUs render and encode evidence more slowly than local runs.
  // Keep per-interaction deadlines unchanged; allow the whole scenario to finish.
  timeout: process.env.CI ? 180000 : 90000,
  expect: { timeout: 20000 },
  workers: 1,
  outputDir: process.env.NEON_TEST_RESULTS || 'test-results',
  reporter: [['list'], ['html', { outputFolder: process.env.NEON_TEST_REPORT || 'playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `node tools/server.mjs --dir dist --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
    timeout: 15000,
  },
});
