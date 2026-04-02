#!/usr/bin/env node
/**
 * Unified dev server launcher.
 *
 * Wraps the server entry point as a child process, teeing stdout/stderr
 * to a log file. pino-pretty uses ThreadStream which bypasses shell
 * pipelines, so spawning as a child with piped stdio is the only
 * reliable capture method.
 *
 * Usage:
 *   node scripts/dev-server.js                      # HTTPS :3443 + log file
 *   node scripts/dev-server.js --no-https            # HTTP  :3000 + log file
 *   node scripts/dev-server.js --no-log-file         # HTTPS :3443, no file
 *   node scripts/dev-server.js --no-https --watch    # HTTP  :3000 + watch + log
 *   node scripts/dev-server.js --output my.log       # custom log file path
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Argument parsing (no external deps) ─────────────────────────────
const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function getFlagValue(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  if (idx + 1 >= args.length) {
    console.error(`Expected a value after ${name}`);
    process.exit(1);
  }
  const val = args[idx + 1];
  if (val.startsWith('-')) {
    console.error(`Expected a value after ${name}, got "${val}"`);
    process.exit(1);
  }
  return val;
}

const noHttps   = hasFlag('--no-https');
const noLogFile = hasFlag('--no-log-file');
const watch     = hasFlag('--watch');
const outputArg = getFlagValue('--output');
const logPath   = noLogFile ? null : path.resolve(outputArg || 'telemetry.log');

// ── Default environment variables ───────────────────────────────────
// In HTTPS mode, defer JWT/API key defaults to scripts/dev-https.js,
// which intentionally applies production-like values for some flows.
if (noHttps) {
  if (!process.env.JWT_SECRET)     process.env.JWT_SECRET     = 'dev-jwt-secret';
  if (!process.env.SYSTEM_API_KEY) process.env.SYSTEM_API_KEY = 'gwn-dev-system-key';
}
if (!process.env.LOG_LEVEL)      process.env.LOG_LEVEL      = 'debug';

// ── Build the child command ─────────────────────────────────────────
let nodeArgs = [];

if (noHttps) {
  if (watch) nodeArgs.push('--watch');
  nodeArgs.push(path.join('server', 'index.js'));
} else {
  if (watch) {
    console.warn('⚠️  --watch is ignored in HTTPS mode (dev-https.js monkey-patches http.createServer and cannot cleanly restart)');
  }
  nodeArgs.push(path.join('scripts', 'dev-https.js'));
}

const port = noHttps
  ? (process.env.PORT || '3000')
  : (process.env.HTTPS_PORT || '3443');
const protocol = noHttps ? 'http' : 'https';

// ── Banner ──────────────────────────────────────────────────────────
console.log('');
console.log('┌──────────────────────────────────────────┐');
console.log('│          dev-server.js launcher           │');
console.log('├──────────────────────────────────────────┤');
console.log(`│  Mode:     ${noHttps ? 'HTTP (plain)' : 'HTTPS (production-like)'}${' '.repeat(noHttps ? 16 : 9)}│`);
console.log(`│  URL:      ${protocol}://localhost:${port}${' '.repeat(Math.max(0, 28 - protocol.length - port.length))}│`);
console.log(`│  Log file: ${logPath ? path.relative(process.cwd(), logPath) : '(disabled)'}${' '.repeat(Math.max(0, 28 - (logPath ? path.relative(process.cwd(), logPath).length : 10)))}│`);
console.log(`│  Watch:    ${watch && noHttps ? 'enabled' : 'disabled'}${' '.repeat(Math.max(0, 28 - (watch && noHttps ? 7 : 8)))}│`);
console.log('└──────────────────────────────────────────┘');
console.log('');

// ── Spawn ───────────────────────────────────────────────────────────
const child = spawn(process.execPath, nodeArgs, {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env },
  stdio: ['inherit', 'pipe', 'pipe'],
});

let logStream = null;
if (logPath) {
  // Ensure parent directory exists (e.g. Playwright cleans test-results/ before
  // starting the webServer, so it may not exist even if the config created it).
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const stream = fs.createWriteStream(logPath, { flags: 'w' });
  logStream = stream;
  stream.on('error', (err) => {
    console.warn(`⚠️  Failed to write log file "${logPath}": ${err.message}. Falling back to console-only logging.`);
    if (!stream.destroyed) stream.destroy();
    if (logStream === stream) logStream = null;
  });
}

child.on('error', (err) => {
  console.error(`Failed to start child process: ${err.message}`);
  if (logStream) logStream.end();
  process.exit(1);
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (logStream) logStream.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  if (logStream) logStream.write(chunk);
});

const forwardSigint = () => child.kill('SIGINT');
const forwardSigterm = () => child.kill('SIGTERM');

child.on('exit', (code, signal) => {
  if (logStream) logStream.end();

  if (code !== null) {
    process.exit(code);
  }

  if (signal) {
    process.removeListener('SIGINT', forwardSigint);
    process.removeListener('SIGTERM', forwardSigterm);
    process.kill(process.pid, signal);
    return;
  }

  process.exit(1);
});

// Forward signals to child
process.on('SIGINT', forwardSigint);
process.on('SIGTERM', forwardSigterm);
