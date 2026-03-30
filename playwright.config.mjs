import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-e2e-'));
const dbPath = path.join(tmpDir, 'test.db');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3011',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node server/index.js',
    port: 3011,
    reuseExistingServer: false,
    env: {
      PORT: '3011',
      NODE_ENV: 'test',
      GWN_DB_PATH: dbPath,
    },
    timeout: 15_000,
  },
  globalTeardown: './tests/e2e/global-teardown.mjs',
});
