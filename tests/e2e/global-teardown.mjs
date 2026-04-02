import fs from 'fs';
import path from 'path';
import os from 'os';

/** Strip ANSI escape codes from pino-pretty output. */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Classify a log line as 'error', 'warn', or null.
 * Handles both pino JSON (numeric level) and pino-pretty (text level) formats.
 */
function classifyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try JSON parse for pino structured logs (NODE_ENV=test)
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj.level === 'number') {
        if (obj.level >= 50) return 'error';  // 50=ERROR, 60=FATAL
        if (obj.level === 40) return 'warn';
        return null;
      }
    } catch {
      // Not valid JSON; fall through to text matching
    }
  }

  // Text-based matching for pino-pretty output (NODE_ENV=development)
  if (/\b(ERROR|FATAL)\b/.test(trimmed)) return 'error';
  if (/\bWARN\b/.test(trimmed)) return 'warn';
  return null;
}

/**
 * Post-test assertions and cleanup:
 * 1. Check server log for unexpected ERROR/FATAL entries
 * 2. Copy server log to test-results/ for CI artifact upload
 * 3. Clean up temp DB directory (always runs, even on assertion failure)
 */
export default function globalTeardown() {
  let assertionError = null;

  try {
    assertLogClean();
  } catch (err) {
    assertionError = err;
  }

  // --- Clean up temp DB directory (always runs) ---
  const tmpDir = path.join(os.tmpdir(), 'gwn-e2e');
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  if (assertionError) throw assertionError;
}

/** Check server log for unexpected ERROR/FATAL entries. */
function assertLogClean() {
  const serverLogPath = path.join('.playwright', 'server.log');
  if (!fs.existsSync(serverLogPath)) return;

  let raw;
  try {
    raw = fs.readFileSync(serverLogPath, 'utf8');
  } catch (error) {
    console.warn(
      `\n⚠️  Unable to read server log during global teardown: ${path.resolve(serverLogPath)}`
    );
    console.warn(`   ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const clean = stripAnsi(raw);
  const lines = clean.split('\n');

  // Copy server log into test-results/ for CI artifact upload
  const artifactPath = path.join('test-results', 'server.log');
  let artifactCopied = false;
  try {
    fs.mkdirSync('test-results', { recursive: true });
    fs.copyFileSync(serverLogPath, artifactPath);
    artifactCopied = true;
  } catch (error) {
    console.warn(
      `\n⚠️  Unable to copy server log artifact: ${path.resolve(artifactPath)}`
    );
    console.warn(`   ${error instanceof Error ? error.message : String(error)}`);
  }

  const errors = [];
  const warnings = [];
  for (const line of lines) {
    const cls = classifyLine(line);
    if (cls === 'error') errors.push(line);
    else if (cls === 'warn') warnings.push(line);
  }

  if (errors.length > 0) {
    console.error('\n❌ Server log contains ERROR/FATAL entries during e2e run:');
    errors.forEach(line => console.error('  ', line.trim()));
    const logRef = artifactCopied
      ? path.resolve(artifactPath)
      : path.resolve(serverLogPath);
    console.error(`\nFull server log: ${logRef}`);
    throw new Error(
      `Server emitted ${errors.length} ERROR/FATAL log entries during e2e tests. See ${logRef} for details.`
    );
  }

  // Report warnings (informational, not a failure)
  if (warnings.length > 0) {
    console.log(`\n⚠️  Server log contains ${warnings.length} WARN entries (not a failure):`);
    warnings.slice(0, 5).forEach(line => console.log('  ', line.trim()));
    if (warnings.length > 5) console.log(`  ... and ${warnings.length - 5} more`);
  }

  console.log(`\n✅ Server log clean: ${lines.length} lines, 0 errors`);
}
