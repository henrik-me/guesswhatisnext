#!/usr/bin/env node
/**
 * Run the test suite against a local MSSQL (SQL Server) container.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.mssql.yml up -d
 *
 * This script:
 *   1. Connects to the master database.
 *   2. Creates the gwn_test database if it doesn't exist.
 *   3. Runs `npx vitest run` with DATABASE_URL pointing at the container.
 */

const { execSync } = require('child_process');

const SA_PASSWORD = process.env.MSSQL_SA_PASSWORD;

if (!SA_PASSWORD) {
  console.error('Error: MSSQL_SA_PASSWORD environment variable must be set.');
  console.error('Example: $env:MSSQL_SA_PASSWORD = "YourPassword"; npm run test:mssql');
  process.exit(1);
}
const CONNECTION = `Server=localhost,1433;Database=master;User Id=sa;Password=${SA_PASSWORD};Encrypt=false;TrustServerCertificate=true`;
const TEST_DB = 'gwn_test';
const TEST_CONNECTION = `Server=localhost,1433;Database=${TEST_DB};User Id=sa;Password=${SA_PASSWORD};Encrypt=false;TrustServerCertificate=true`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDatabase() {
  const sql = require('mssql');
  const maxAttempts = 10;
  let pool;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      pool = await sql.connect(CONNECTION);
      break;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) throw lastError;
      const delayMs = attempt * 1000;
      console.log(`Waiting for SQL Server (attempt ${attempt}/${maxAttempts})...`);
      await sleep(delayMs);
    }
  }

  try {
    await pool.request().query(
      `IF DB_ID('${TEST_DB}') IS NULL CREATE DATABASE [${TEST_DB}]`
    );
    console.log(`Database '${TEST_DB}' is ready.`);
  } finally {
    await pool.close();
  }
}

async function main() {
  await ensureDatabase();

  process.env.DATABASE_URL = TEST_CONNECTION;
  execSync('npx vitest run', { stdio: 'inherit', env: process.env });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
