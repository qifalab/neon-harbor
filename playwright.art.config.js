import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({ ...base, testDir: './tests/visual', timeout: 1200000,
  outputDir: './art-test-results',
  reporter: [['list'], ['html', { outputFolder: 'art-playwright-report', open: 'never' }]],
  use: { ...base.use, trace: 'off', baseURL: 'http://127.0.0.1:5174', viewport: { width: 640, height: 400 } },
  webServer: { ...base.webServer, command: 'node tools/server.mjs --dir dist --port 5174', url: 'http://127.0.0.1:5174' },
});
