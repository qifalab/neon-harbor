import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Six focused native-resolution High photographs supplement the all-address
// Low-mode layout review. All travel and settings use the public controls.
export default defineConfig({ ...base, testDir: './tests/visual-detail', timeout: 600000, workers: 1,
  outputDir: './detail-test-results',
  reporter: [['list'], ['html', { outputFolder: 'detail-playwright-report', open: 'never' }]],
  use: { ...base.use, trace: 'off', baseURL: 'http://127.0.0.1:5177', viewport: { width: 640, height: 400 } },
  webServer: { ...base.webServer, command: 'node tools/server.mjs --dir dist --port 5177', url: 'http://127.0.0.1:5177' },
});
