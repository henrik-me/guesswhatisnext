'use strict';

/**
 * CS61-1 — seed-smoke-user-via-api.js
 *
 * Deploy-time companion to `scripts/setup-smoke-user.js`. Where setup-smoke-user
 * works in environments with direct DB access (prod's managed MSSQL via
 * `DB_BACKEND=mssql`), this script creates the same `gwn-smoke-bot` user via
 * the new `POST /api/admin/seed-smoke-user` admin endpoint — needed for staging
 * because staging persists to container-local SQLite at /tmp/game.db, which is
 * unreachable from the GitHub Actions runner.
 *
 * Usage (CS61-3 wires this into staging-deploy.yml):
 *
 *   SMOKE_USER_PASSWORD=<pw> SYSTEM_API_KEY=<key> \
 *     node scripts/seed-smoke-user-via-api.js <fqdn>
 *
 * Idempotency contract owned by the endpoint:
 *   HTTP 201  → user created (first call).
 *   HTTP 200  → user already existed (subsequent calls).
 *   Both are SUCCESS — exit 0.
 *
 * Exit codes:
 *   0  success.
 *   1  HTTP error / network error / unexpected response from the endpoint.
 *   2  bad CLI usage (missing FQDN or env vars).
 *
 * Testability: the network logic is exported as `seedViaApi(opts)` so the unit
 * tests can call it directly with a mocked `fetch`. The `if (require.main ===
 * module)` block is the CLI entry point.
 */

const SMOKE_USERNAME = 'gwn-smoke-bot';

/**
 * Perform the seed POST. Returns `{ exitCode, message }` — never throws.
 *
 * @param {object} opts
 * @param {string} opts.fqdn      — e.g. `gwn-staging.westeurope.azurecontainerapps.io`.
 * @param {string} opts.password  — value to hash + store as the smoke-bot password.
 * @param {string} opts.apiKey    — SYSTEM_API_KEY for x-api-key auth.
 * @param {Function} [opts.fetchImpl] — injectable `fetch` (defaults to global).
 */
async function seedViaApi({ fqdn, password, apiKey, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    return { exitCode: 1, message: '❌ no fetch implementation available (Node ≥18 required)' };
  }

  const url = `https://${fqdn}/api/admin/seed-smoke-user`;
  let res;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ password }),
    });
  } catch (err) {
    return { exitCode: 1, message: `❌ ${err.message || String(err)}` };
  }

  if (res.status === 200 || res.status === 201) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = { status: 'unknown' };
    }
    return {
      exitCode: 0,
      message: `✅ smoke-bot ${body.status || 'ok'} (HTTP ${res.status}, username=${body.username || SMOKE_USERNAME})`,
    };
  }

  let errBody = '';
  try {
    errBody = await res.text();
  } catch {
    errBody = '<no body>';
  }
  return { exitCode: 1, message: `❌ HTTP ${res.status}: ${errBody}` };
}

async function main(argv, env) {
  const fqdn = argv[2];
  const password = env.SMOKE_USER_PASSWORD;
  const apiKey = env.SYSTEM_API_KEY;

  if (!fqdn) {
    console.error('Usage: node seed-smoke-user-via-api.js <fqdn>');
    return 2;
  }
  if (!password) {
    console.error('SMOKE_USER_PASSWORD env var required');
    return 2;
  }
  if (!apiKey) {
    console.error('SYSTEM_API_KEY env var required');
    return 2;
  }

  const { exitCode, message } = await seedViaApi({ fqdn, password, apiKey });
  if (exitCode === 0) {
    console.log(message);
  } else {
    console.error(message);
  }
  return exitCode;
}

if (require.main === module) {
  main(process.argv, process.env)
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ unexpected: ${err && err.stack || err}`);
      process.exit(1);
    });
}

module.exports = { main, seedViaApi, SMOKE_USERNAME };
