#!/usr/bin/env node
// check-compose-v2.js — Verify Docker Compose v2+ is available.
// Used by npm scripts to provide a clear error if Docker Compose v1 is installed.

const { execSync } = require('child_process');

try {
  const version = execSync('docker compose version --short', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const normalizedVersion = version.replace(/^v/, '');
  const major = parseInt(normalizedVersion.split('.')[0], 10);
  if (major < 2) {
    console.error(`Docker Compose v2+ required (found ${version})`);
    process.exit(1);
  }
  console.log(`Docker Compose ${version} ✓`);
} catch (error) {
  const errorOutput = [
    error && typeof error.stderr === 'string' ? error.stderr : '',
    error && typeof error.stdout === 'string' ? error.stdout : '',
    error && error.message ? error.message : ''
  ].find((value) => value && value.trim());

  console.error('Docker Compose v2+ required. Install: https://docs.docker.com/compose/install/');
  console.error('  "docker compose" is unavailable or failed to run — the legacy "docker-compose" (v1) is not supported.');
  if (errorOutput) {
    console.error(`  Command output: ${errorOutput.trim()}`);
  }
  process.exit(1);
}
