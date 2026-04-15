#!/usr/bin/env node
// check-compose-v2.js — Verify Docker Compose v2+ is available.
// Used by npm scripts to provide a clear error if Docker Compose v1 is installed.

const { execSync } = require('child_process');

try {
  const version = execSync('docker compose version --short', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const major = parseInt(version.replace(/^v/, '').split('.')[0], 10);
  if (major < 2) {
    console.error(`Docker Compose v2+ required (found v${version})`);
    process.exit(1);
  }
  console.log(`Docker Compose v${version} ✓`);
} catch {
  console.error('Docker Compose v2+ required. Install: https://docs.docker.com/compose/install/');
  console.error('  "docker compose" command not found — the legacy "docker-compose" (v1) is not supported.');
  process.exit(1);
}
