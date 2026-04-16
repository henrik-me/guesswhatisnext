// @ts-check
/**
 * Per-test Docker container log capture fixture for Playwright.
 *
 * Usage: import { test, expect } from './fixtures/docker-logs.mjs';
 *
 * Only activates when CONTAINER_LOGS=true is set (MSSQL docker mode).
 * Captures docker compose logs generated during each test and attaches
 * them to the Playwright HTML report. Flags ERROR/FATAL pino entries.
 */
import { test as base, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const COMPOSE_FILE = 'docker-compose.mssql.yml';
const isContainerMode = !!process.env.CONTAINER_LOGS;

/** File path for persisting cumulative log capture time across workers. */
const OVERHEAD_FILE = path.join('test-results', '.log-capture-overhead-ms');

/** Cumulative log capture time in milliseconds (in-process tracker). */
let cumulativeLogCaptureMs = 0;

/**
 * Persist cumulative log capture time to a file so the global teardown
 * (which runs in a separate process) can read it.
 */
function persistOverhead() {
  try {
    fs.mkdirSync('test-results', { recursive: true });
    // Read existing value (from prior worker runs) and add current
    let existing = 0;
    try {
      existing = parseInt(fs.readFileSync(OVERHEAD_FILE, 'utf8'), 10) || 0;
    } catch {
      // File doesn't exist yet
    }
    fs.writeFileSync(OVERHEAD_FILE, String(existing + cumulativeLogCaptureMs), 'utf8');
  } catch {
    // Best-effort
  }
}

/**
 * Read the persisted cumulative log capture time from the overhead file.
 */
export function readPersistedOverheadMs() {
  try {
    return parseInt(fs.readFileSync(OVERHEAD_FILE, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
}

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
 * Returns { logs, error } — error is set when capture fails.
 */
function captureDockerLogs(sinceTimestamp) {
  try {
    const output = execSync(
      `docker compose -f ${COMPOSE_FILE} logs --since ${sinceTimestamp} app --no-log-prefix`,
      { encoding: 'utf8', timeout: 30000 }
    );
    return { logs: output, error: null };
  } catch (err) {
    return { logs: '', error: err.message };
  }
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
    const { logs, error: captureError } = captureDockerLogs(startTime);
    const captureElapsed = Date.now() - captureStart;
    cumulativeLogCaptureMs += captureElapsed;

    // Persist overhead to file for global teardown
    persistOverhead();
    // Reset in-process counter after persisting to avoid double-counting
    cumulativeLogCaptureMs = 0;

    // Surface log capture failures as annotations
    if (captureError) {
      testInfo.annotations.push({
        type: 'log-capture-error',
        description: `Docker log capture failed: ${captureError}`,
      });
    }

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
