import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

// When BASE_URL is set (e.g. staging CI), run against that external server
// and skip the local webServer entirely.
const externalBaseURL = process.env.BASE_URL;

// Use a fixed temp directory so leftover dirs don't accumulate.
// globalTeardown cleans this up after each run.
const tmpDir = path.join(os.tmpdir(), 'gwn-e2e');
if (!externalBaseURL) {
  // Ensure each E2E run starts from a clean DB by removing the temp dir entirely.
  // On Windows, individual file unlinkSync can fail with EBUSY if the DB is still
  // locked by a prior server process. Removing the parent dir is more reliable.
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; the webServer will create a fresh DB if the path is new.
  }
  fs.mkdirSync(tmpDir, { recursive: true });
}
const dbPath = path.join(tmpDir, 'test.db');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: externalBaseURL || 'http://localhost:3011',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'node server/index.js',
        port: 3011,
        reuseExistingServer: false,
        env: {
          PORT: '3011',
          NODE_ENV: 'test',
          GWN_DB_PATH: dbPath,
          JWT_SECRET: 'test-jwt-secret',
          SYSTEM_API_KEY: 'test-system-api-key',
        },
        timeout: 15000,
      },
  globalTeardown: externalBaseURL ? undefined : './tests/e2e/global-teardown.mjs',
});
