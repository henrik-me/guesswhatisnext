/**
 * Production log format validation — verifies pino outputs structured JSON
 * (not pretty-printed) with required fields when NODE_ENV=production.
 */

const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

/** Find an available port by briefly binding to port 0. */
async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** Collect complete newline-terminated lines, carrying partial tails. */
function createLineBuffer() {
  let pending = '';
  const lines = [];
  return {
    lines,
    append(chunk) {
      pending += chunk;
      const parts = pending.split('\n');
      pending = parts.pop(); // keep incomplete trailing fragment
      for (const p of parts) {
        if (p.trim()) lines.push(p);
      }
    },
    flush() {
      if (pending.trim()) lines.push(pending);
      pending = '';
    },
  };
}

describe('Production log format', () => {
  let child;
  let logBuffer;
  let port;
  const tmpDir = path.join(os.tmpdir(), `gwn-log-format-test-${process.pid}`);
  const dbPath = path.join(tmpDir, 'test.db');

  beforeAll(async () => {
    port = await findFreePort();

    fs.mkdirSync(tmpDir, { recursive: true });

    logBuffer = createLineBuffer();

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

    child.stdout.on('data', (chunk) => { logBuffer.append(chunk.toString()); });
    child.stderr.on('data', (chunk) => { logBuffer.append(chunk.toString()); });

    await new Promise((resolve, reject) => {
      let done = false;
      let retryTimer;

      const cleanup = () => {
        clearTimeout(timeout);
        if (retryTimer) clearTimeout(retryTimer);
        child.off('exit', onExit);
        child.off('error', onError);
      };
      const finish = (err) => {
        if (done) return;
        done = true;
        cleanup();
        err ? reject(err) : resolve();
      };
      const onExit = (code, signal) => {
        finish(new Error(`Server exited before ready (code: ${code}, signal: ${signal})`));
      };
      const onError = (err) => {
        finish(err);
      };

      const timeout = setTimeout(() => finish(new Error('Server startup timeout')), 15000);

      const checkReady = () => {
        if (done) return;
        const req = http.get(`http://localhost:${port}/api/health`, {
          headers: { 'X-API-Key': 'test-log-format-key', 'X-Forwarded-Proto': 'https' },
        }, (res) => {
          if (done) { res.resume(); return; }
          if (res.statusCode === 200) { finish(); }
          else { retryTimer = setTimeout(checkReady, 500); }
          res.resume();
        });
        req.on('error', () => { if (!done) retryTimer = setTimeout(checkReady, 500); });
      };

      child.once('exit', onExit);
      child.once('error', onError);
      retryTimer = setTimeout(checkReady, 1000);
    });
  }, 20000);

  afterAll(async () => {
    if (child && child.exitCode == null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const killTimeout = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, 5000);
        child.once('exit', () => { clearTimeout(killTimeout); resolve(); });
        if (child.exitCode != null) { clearTimeout(killTimeout); resolve(); }
      });
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function getLogLines() {
    logBuffer.flush();
    return logBuffer.lines;
  }

  function getRawOutput() {
    logBuffer.flush();
    return logBuffer.lines.join('\n');
  }

  it('outputs JSON lines (not pretty-printed)', () => {
    const lines = getLogLines();
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

    const lines = getLogLines();
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
    expect(getRawOutput()).not.toMatch(/\x1b\[/);
  });

  it('does not contain pino-pretty formatting', () => {
    const lines = getLogLines();
    const indentedObjectLines = lines.filter(l => /^\s{4,}\w+:/.test(l));
    expect(indentedObjectLines).toHaveLength(0);
  });
});