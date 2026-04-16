// @ts-check
/**
 * Per-test Docker container log capture fixture for Playwright.
 *
 * Usage: import { test, expect } from './fixtures/docker-logs.mjs';
 *
 * Only activates when BASE_URL is set (container/external mode).
 * Captures docker compose logs generated during each test and attaches
 * them to the Playwright HTML report. Flags ERROR/FATAL pino entries.
 */
import { test as base, expect } from '@playwright/test';
import { execSync } from 'child_process';

const COMPOSE_FILE = 'docker-compose.mssql.yml';
const isContainerMode = !!process.env.BASE_URL;

/** Cumulative log capture time in milliseconds, shared across all tests. */
let cumulativeLogCaptureMs = 0;

/**
 * Parse a log line as pino JSON and return the numeric level, or null.
 */
function parsePinoLevel(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    return typeof obj.level === 'number' ? obj.level : null;
  } catch {
    return null;
  }
}

/**
 * Capture docker compose logs since the given ISO timestamp.
 * Returns the raw log output as a string.
 */
function captureDockerLogs(sinceTimestamp) {
  try {
    const output = execSync(
      `docker compose -f ${COMPOSE_FILE} logs --since ${sinceTimestamp} app --no-log-prefix`,
      { encoding: 'utf8', timeout: 30000 }
    );
    return output;
  } catch (err) {
    return `[docker-logs fixture] Failed to capture logs: ${err.message}`;
  }
}

/**
 * Get the cumulative log capture time in milliseconds.
 */
export function getCumulativeLogCaptureMs() {
  return cumulativeLogCaptureMs;
}

/**
 * Reset the cumulative log capture time (for testing purposes).
 */
export function resetCumulativeLogCaptureMs() {
  cumulativeLogCaptureMs = 0;
}

/**
 * Extended Playwright test fixture with per-test Docker log capture.
 */
export const test = base.extend({
  // Auto-fixture: runs for every test without explicit use
  // eslint-disable-next-line no-empty-pattern
  dockerLogs: [async ({}, use, testInfo) => {
    if (!isContainerMode) {
      await use(undefined);
      return;
    }

    // Record start time with 1s buffer subtracted for clock skew
    const startTime = new Date(Date.now() - 1000).toISOString();

    await use(undefined);

    // afterEach: capture logs generated during this test
    const captureStart = Date.now();
    const logs = captureDockerLogs(startTime);
    const captureElapsed = Date.now() - captureStart;
    cumulativeLogCaptureMs += captureElapsed;

    // Attach logs to test report
    if (logs.trim()) {
      await testInfo.attach('server-logs', {
        body: logs,
        contentType: 'text/plain',
      });
    }

    // Parse for ERROR (level 50) or FATAL (level 60) entries
    const lines = logs.split('\n');
    const serverErrors = [];
    for (const line of lines) {
      const level = parsePinoLevel(line);
      if (level !== null && level >= 50) {
        serverErrors.push(line.trim());
      }
    }

    if (serverErrors.length > 0) {
      testInfo.annotations.push({
        type: 'server-error',
        description: 'Server emitted ERROR/FATAL during this test',
      });

      // Optionally fail the test if FAIL_ON_SERVER_ERROR=true
      if (process.env.FAIL_ON_SERVER_ERROR === 'true') {
        throw new Error(
          `Server emitted ${serverErrors.length} ERROR/FATAL log entries during this test:\n` +
          serverErrors.slice(0, 5).join('\n') +
          (serverErrors.length > 5 ? `\n... and ${serverErrors.length - 5} more` : '')
        );
      }
    }
  }, { auto: true }],
});

export { expect };
