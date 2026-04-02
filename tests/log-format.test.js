/**
 * Production log format validation — verifies pino outputs structured JSON
 * (not pretty-printed) with required fields when NODE_ENV=production.
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

describe('Production log format', () => {
  let child;
  let logOutput = '';
  let port;
  const tmpDir = path.join(os.tmpdir(), `gwn-log-format-test-${process.pid}`);
  const dbPath = path.join(tmpDir, 'test.db');

  beforeAll(async () => {
    port = 3090 + Math.floor(Math.random() * 100);

    fs.mkdirSync(tmpDir, { recursive: true });

    child = spawn(process.execPath, [path.join('server', 'index.js')], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        GWN_DB_PATH: dbPath,
        JWT_SECRET: 'test-log-format-secret',
        SYSTEM_API_KEY: 'test-log-format-key',
        CANONICAL_HOST: `localhost:${port}`,
        LOG_LEVEL: 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => { logOutput += chunk.toString(); });
    child.stderr.on('data', (chunk) => { logOutput += chunk.toString(); });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
      const checkReady = () => {
        const req = http.get(`http://localhost:${port}/api/health`, {
          headers: { 'X-API-Key': 'test-log-format-key', 'X-Forwarded-Proto': 'https' },
        }, (res) => {
          if (res.statusCode === 200) { clearTimeout(timeout); resolve(); }
          else { setTimeout(checkReady, 500); }
          res.resume();
        });
        req.on('error', () => setTimeout(checkReady, 500));
      };
      setTimeout(checkReady, 1000);
    });
  }, 20000);

  afterAll(async () => {
    if (child) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.on('exit', resolve));
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('outputs JSON lines (not pretty-printed)', () => {
    const lines = logOutput.trim().split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('includes required fields in request log entries', async () => {
    // Use a non-health endpoint; /api/health is excluded from pino-http autoLogging
    await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/api/scores`, {
        headers: { 'X-API-Key': 'test-log-format-key', 'X-Forwarded-Proto': 'https' },
      }, (res) => {
        res.resume();
        res.on('end', resolve);
      });
      req.on('error', reject);
    });

    // Give pino a moment to flush
    await new Promise(resolve => setTimeout(resolve, 500));

    const lines = logOutput.trim().split('\n').filter(l => l.trim());
    const requestLogs = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(entry => entry && entry.req);

    expect(requestLogs.length).toBeGreaterThan(0);

    for (const entry of requestLogs) {
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('time');
      expect(entry).toHaveProperty('msg');
      expect(entry.req).toHaveProperty('id');
      expect(entry.req).toHaveProperty('method');
      expect(entry.req).toHaveProperty('url');
    }
  });

  it('does not contain ANSI escape codes', () => {
    // eslint-disable-next-line no-control-regex
    expect(logOutput).not.toMatch(/\x1b\[/);
  });

  it('does not contain pino-pretty formatting', () => {
    const lines = logOutput.trim().split('\n');
    const indentedObjectLines = lines.filter(l => /^\s{4,}\w+:/.test(l));
    expect(indentedObjectLines).toHaveLength(0);
  });
});
