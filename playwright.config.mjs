import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

// When BASE_URL is set (e.g. staging CI), run against that external server
// and skip the local webServer entirely.
const externalBaseURL = process.env.BASE_URL;

// When running the local webServer (i.e. when BASE_URL is not set), use a fixed
// temp directory so leftover dirs don't accumulate; globalTeardown cleans this
// up after each run.
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

// Capture server output to a log file for post-test assertions and CI artifacts.
// Write to .playwright/ initially; global teardown copies into test-results/
// (Playwright cleans its outputDir after the webServer starts).
const serverLogPath = path.join('.playwright', 'server.log');
if (!externalBaseURL) {
  fs.mkdirSync('.playwright', { recursive: true });
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: externalBaseURL ? 2 : (process.env.CI ? 2 : 0),
  reporter: 'list',
  use: {
    baseURL: externalBaseURL || 'http://localhost:3011',
    trace: 'retain-on-failure',
    ...(externalBaseURL ? { ignoreHTTPSErrors: true, extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' } } : {}),
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
        command: `node scripts/dev-server.js --no-https --output ${serverLogPath}`,
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
  globalTeardown: externalBaseURL
    ? './tests/e2e/container-global-teardown.mjs'
    : './tests/e2e/global-teardown.mjs',
});
