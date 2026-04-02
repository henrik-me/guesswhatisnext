import fs from 'fs';
import path from 'path';
import os from 'os';

/** Strip ANSI escape codes from pino-pretty output. */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Post-test assertions and cleanup:
 * 1. Check server log for unexpected ERROR/FATAL entries
 * 2. Copy server log to test-results/ for CI artifact upload
 * 3. Clean up temp DB directory
 */
export default function globalTeardown() {
  // --- Log assertion: no ERROR/FATAL entries during clean e2e run ---
  const serverLogPath = path.join('.playwright', 'server.log');
  if (fs.existsSync(serverLogPath)) {
    const raw = fs.readFileSync(serverLogPath, 'utf8');
    const clean = stripAnsi(raw);
    const lines = clean.split('\n');

    // Copy server log into test-results/ for CI artifact upload
    const artifactPath = path.join('test-results', 'server.log');
    fs.mkdirSync('test-results', { recursive: true });
    fs.copyFileSync(serverLogPath, artifactPath);

    const errors = lines.filter(line => /\b(ERROR|FATAL)\b/.test(line));
    if (errors.length > 0) {
      console.error('\n❌ Server log contains ERROR/FATAL entries during e2e run:');
      errors.forEach(line => console.error('  ', line.trim()));
      console.error(`\nFull server log: ${path.resolve(artifactPath)}`);
      throw new Error(
        `Server emitted ${errors.length} ERROR/FATAL log entries during e2e tests. See test-results/server.log for details.`
      );
    }

    // Report warnings (informational, not a failure)
    const warnings = lines.filter(line => /\bWARN\b/.test(line));
    if (warnings.length > 0) {
      console.log(`\n⚠️  Server log contains ${warnings.length} WARN entries (not a failure):`);
      warnings.slice(0, 5).forEach(line => console.log('  ', line.trim()));
      if (warnings.length > 5) console.log(`  ... and ${warnings.length - 5} more`);
    }

    console.log(`\n✅ Server log clean: ${lines.length} lines, 0 errors`);
  }

  // --- Clean up temp DB directory ---
  const tmpDir = path.join(os.tmpdir(), 'gwn-e2e');
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
