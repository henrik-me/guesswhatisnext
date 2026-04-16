#!/usr/bin/env node
// test-e2e-mssql.js — Run the full E2E suite against the MSSQL Docker stack.
// Cross-platform (Windows + Unix). Used by `npm run test:e2e:mssql`.

const { execSync, spawnSync } = require('child_process');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = 'docker-compose.mssql.yml';
const HTTPS_PORT = process.env.HTTPS_PORT || '443';
const HTTP_PORT = process.env.HTTP_PORT || '3001';

// Must match the SYSTEM_API_KEY in docker-compose.mssql.yml
const SYSTEM_API_KEY = 'test-system-api-key';

// Build the base URL from the HTTPS port
const BASE_URL = HTTPS_PORT === '443'
  ? 'https://localhost'
  : `https://localhost:${HTTPS_PORT}`;

function run(label, cmd, opts = {}) {
  console.log(`\n=== ${label} ===`);
  console.log(`> ${cmd}\n`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
    return true;
  } catch (err) {
    if (!opts.allowFailure) {
      console.error(`\n✗ ${label} failed (exit ${err.status})`);
    }
    return false;
  }
}

function teardown() {
  console.log('\n=== Tearing down MSSQL stack ===');
  try {
    execSync(`docker compose -f ${COMPOSE_FILE} down`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch {
    console.error('Warning: teardown failed — containers may still be running');
  }
}

// Ensure teardown runs on interrupt/termination
let tornDown = false;
function safeTeardown(signal) {
  if (tornDown) return;
  tornDown = true;
  console.log(`\nReceived ${signal} — cleaning up...`);
  teardown();
  process.exit(1);
}
process.on('SIGINT', () => safeTeardown('SIGINT'));
process.on('SIGTERM', () => safeTeardown('SIGTERM'));

/**
 * Wait for /api/health to report database.status=ok.
 * Pure Node.js — no Bash/curl dependency.
 */
function waitForHealthy(baseUrl, timeoutSec = 120) {
  return new Promise((resolve, reject) => {
    const interval = 2000;
    const deadline = Date.now() + timeoutSec * 1000;
    const url = new URL('/api/health', baseUrl);

    console.log(`\n=== Waiting for DB readiness ===`);
    console.log(`Waiting for ${url.href} (timeout: ${timeoutSec}s)...`);

    function poll() {
      const elapsed = Math.round((Date.now() - (deadline - timeoutSec * 1000)) / 1000);
      if (Date.now() > deadline) {
        return reject(new Error(`Health check timed out after ${timeoutSec}s`));
      }

      const req = https.get(url, {
        rejectUnauthorized: false, // self-signed Caddy cert
        headers: { 'X-API-Key': SYSTEM_API_KEY },
        timeout: 5000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            return reject(new Error(`Health check failed with HTTP ${res.statusCode} — check SYSTEM_API_KEY`));
          }
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              if (data.checks && data.checks.database && data.checks.database.status === 'ok') {
                console.log(`Health check passed — database.status=ok (${elapsed}s elapsed)`);
                return resolve();
              }
            } catch { /* parse error, retry */ }
          }
          console.log(`  ... ${elapsed}s / ${timeoutSec}s`);
          setTimeout(poll, interval);
        });
      });

      req.on('error', () => {
        console.log(`  ... ${elapsed}s / ${timeoutSec}s`);
        setTimeout(poll, interval);
      });

      req.on('timeout', () => {
        req.destroy();
        setTimeout(poll, interval);
      });
    }

    poll();
  });
}

async function main() {
  // ── Step 1: Check Docker Compose v2 ──────────────────────────────────
  if (!run('Checking Docker Compose v2', 'node scripts/check-compose-v2.js')) {
    process.exit(1);
  }

  // ── Step 2: Start the MSSQL stack ────────────────────────────────────
  const composeUp = `docker compose -f ${COMPOSE_FILE} up -d --build`;
  const composeEnv = {};
  if (process.env.HTTPS_PORT) composeEnv.HTTPS_PORT = HTTPS_PORT;
  if (process.env.HTTP_PORT) composeEnv.HTTP_PORT = HTTP_PORT;

  if (!run('Starting MSSQL stack', composeUp, { env: { ...process.env, ...composeEnv } })) {
    console.error('\nFailed to start the MSSQL Docker stack. Skipping tests.');
    teardown();
    process.exit(1);
  }

  // ── Step 3: Wait for DB readiness ────────────────────────────────────
  try {
    await waitForHealthy(BASE_URL);
  } catch (err) {
    console.error(`\n✗ ${err.message}`);
    teardown();
    process.exit(1);
  }

  // ── Step 4: Run Playwright tests ─────────────────────────────────────
  console.log('\n=== Running Playwright E2E tests ===');
  console.log(`> BASE_URL=${BASE_URL} npx playwright test\n`);

  const testResult = spawnSync('npx', ['playwright', 'test'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      BASE_URL,
      SYSTEM_API_KEY,
    },
    shell: true,
  });

  const testExitCode = testResult.status ?? 1;

  if (testExitCode === 0) {
    console.log('\n✓ All E2E tests passed against MSSQL');
  } else {
    console.error(`\n✗ E2E tests failed (exit ${testExitCode})`);
  }

  // ── Step 5: Teardown ─────────────────────────────────────────────────
  tornDown = true;
  teardown();

  process.exit(testExitCode);
}

main();
