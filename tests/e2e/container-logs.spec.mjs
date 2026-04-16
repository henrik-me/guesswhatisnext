// @ts-check
/**
 * Container log format assertions.
 * Only runs when BASE_URL is set (i.e., against Docker containers).
 * Verifies server logs are structured JSON with expected pino fields.
 */
import { test, expect } from '../fixtures/docker-logs.mjs';
import { execSync } from 'child_process';

const COMPOSE_FILE = 'docker-compose.mssql.yml';
const isContainerMode = !!process.env.BASE_URL;

// Skip the entire file when not running in container mode
test.skip(!isContainerMode, 'Container log format tests require BASE_URL (container mode)');

test.describe('Container Log Format', () => {
  test('server logs are structured JSON with expected pino fields', async ({ request }) => {
    // Generate some server logs by making API requests
    const healthRes = await request.get('/api/health', {
      headers: { 'X-API-Key': process.env.SYSTEM_API_KEY || 'test-system-api-key' },
    });
    expect(healthRes.ok()).toBeTruthy();

    const puzzlesRes = await request.get('/api/puzzles');
    expect(puzzlesRes.ok()).toBeTruthy();

    // Brief pause to let logs flush
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Capture recent container logs (last 30s to cover our requests)
    const sinceTimestamp = new Date(Date.now() - 30000).toISOString();
    let logs;
    try {
      logs = execSync(
        `docker compose -f ${COMPOSE_FILE} logs --since ${sinceTimestamp} app --no-log-prefix`,
        { encoding: 'utf8', timeout: 15000 }
      );
    } catch (err) {
      throw new Error(`Failed to capture container logs: ${err.message}`);
    }

    const lines = logs.split('\n').filter(line => line.trim());
    expect(lines.length).toBeGreaterThan(0);

    // Every non-empty line should parse as valid JSON
    const parsedLines = [];
    const nonJsonLines = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        parsedLines.push(obj);
      } catch {
        nonJsonLines.push(trimmed);
      }
    }

    // Allow no non-JSON lines (NODE_ENV=production means no pretty-printing)
    expect(nonJsonLines).toEqual([]);

    // Verify expected pino fields on all parsed JSON lines
    for (const obj of parsedLines) {
      expect(obj).toHaveProperty('level');
      expect(typeof obj.level).toBe('number');
      expect(obj).toHaveProperty('time');
      expect(obj).toHaveProperty('msg');
    }
  });

  test('no pretty-printed output in production container', async ({ request }) => {
    // Generate a log entry
    await request.get('/api/health', {
      headers: { 'X-API-Key': process.env.SYSTEM_API_KEY || 'test-system-api-key' },
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const sinceTimestamp = new Date(Date.now() - 30000).toISOString();
    let logs;
    try {
      logs = execSync(
        `docker compose -f ${COMPOSE_FILE} logs --since ${sinceTimestamp} app --no-log-prefix`,
        { encoding: 'utf8', timeout: 15000 }
      );
    } catch (err) {
      throw new Error(`Failed to capture container logs: ${err.message}`);
    }

    const lines = logs.split('\n').filter(line => line.trim());

    // Pretty-printed pino output contains ANSI escape codes or text level labels
    // like "INFO", "DEBUG" without JSON wrapping. In production mode (JSON),
    // every line should be valid JSON — no pretty-print indicators.
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Should not contain pino-pretty style output (e.g., "[14:23:45.123] INFO:")
      // eslint-disable-next-line no-control-regex
      expect(trimmed).not.toMatch(/\x1b\[/); // No ANSI escape codes
      expect(trimmed).not.toMatch(/^\[\d{2}:\d{2}:\d{2}/); // No pino-pretty timestamp format

      // Must be valid JSON
      expect(() => JSON.parse(trimmed)).not.toThrow();
    }
  });
});
