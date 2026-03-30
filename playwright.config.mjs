import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.tmpdir(), `gwn-e2e-${process.pid}-${Date.now()}.db`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
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
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '3011',
      NODE_ENV: 'test',
      GWN_DB_PATH: dbPath,
    },
    timeout: 15_000,
  },
});
