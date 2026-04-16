#!/usr/bin/env node
// test-e2e-mssql.js — Run the full E2E suite against the MSSQL Docker stack.
// Cross-platform (Windows + Unix). Used by `npm run test:e2e:mssql`.

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = 'docker-compose.mssql.yml';
const HTTPS_PORT = process.env.HTTPS_PORT || '443';
const HTTP_PORT = process.env.HTTP_PORT || '3001';
const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY || 'test-system-api-key';

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

// ── Step 1: Check Docker Compose v2 ────────────────────────────────────
if (!run('Checking Docker Compose v2', 'node scripts/check-compose-v2.js')) {
  process.exit(1);
}

// ── Step 2: Start the MSSQL stack ──────────────────────────────────────
const composeUp = `docker compose -f ${COMPOSE_FILE} up -d --build`;
const composeEnv = {};
if (process.env.HTTPS_PORT) composeEnv.HTTPS_PORT = HTTPS_PORT;
if (process.env.HTTP_PORT) composeEnv.HTTP_PORT = HTTP_PORT;

if (!run('Starting MSSQL stack', composeUp, { env: { ...process.env, ...composeEnv } })) {
  console.error('\nFailed to start the MSSQL Docker stack. Skipping tests.');
  teardown();
  process.exit(1);
}

// ── Step 3: Wait for DB readiness ──────────────────────────────────────
const waitCmd = `bash scripts/wait-for-healthy.sh ${BASE_URL}`;

if (!run('Waiting for DB readiness', waitCmd, {
  env: { ...process.env, SYSTEM_API_KEY },
})) {
  console.error('\nHealth check failed — DB not ready. Skipping tests.');
  teardown();
  process.exit(1);
}

// ── Step 4: Run Playwright tests ───────────────────────────────────────
console.log('\n=== Running Playwright E2E tests ===');
console.log(`> BASE_URL=${BASE_URL} SYSTEM_API_KEY=${SYSTEM_API_KEY} npx playwright test\n`);

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

// ── Step 5: Teardown ───────────────────────────────────────────────────
teardown();

process.exit(testExitCode);
