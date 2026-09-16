import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { defineConfig } from '@playwright/test';

// Use an existing local browser when available; CI can install Playwright's browser.
const localChromium = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;
const executablePath = process.env['CHROMIUM_PATH'] ??
  (existsSync(localChromium) ? localChromium : undefined);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Deliberately exercise relative assets beneath a static hosting subpath.
    baseURL: 'http://127.0.0.1:4173/chairo/browser/',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
    reducedMotion: 'reduce'
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:4173/chairo/browser/',
    reuseExistingServer: !process.env['CI']
  }
});
