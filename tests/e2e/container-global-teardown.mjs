/**
 * Global teardown for container (MSSQL) E2E runs.
 * Reports cumulative per-test log capture overhead and enforces thresholds.
 */
import { getCumulativeLogCaptureMs } from './fixtures/docker-logs.mjs';
import fs from 'fs';
import path from 'path';

const WARN_THRESHOLD_MS = 60000;  // 60 seconds
const FAIL_THRESHOLD_MS = 120000; // 120 seconds

export default function containerGlobalTeardown() {
  const totalMs = getCumulativeLogCaptureMs();
  const totalSec = (totalMs / 1000).toFixed(1);

  console.log('\n=== Log Capture Overhead ===');
  console.log(`Total per-test log capture time: ${totalSec}s (${totalMs}ms)`);

  // Save overhead measurement as artifact
  try {
    const artifactDir = 'test-results';
    fs.mkdirSync(artifactDir, { recursive: true });
    const report = {
      cumulativeLogCaptureMs: totalMs,
      cumulativeLogCaptureSec: parseFloat(totalSec),
      warnThresholdMs: WARN_THRESHOLD_MS,
      failThresholdMs: FAIL_THRESHOLD_MS,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(artifactDir, 'log-capture-overhead.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );
  } catch {
    // Best-effort artifact save
  }

  if (totalMs > FAIL_THRESHOLD_MS) {
    console.error(
      `\n❌ Log capture overhead EXCEEDED failure threshold: ${totalSec}s > ${FAIL_THRESHOLD_MS / 1000}s`
    );
    console.error('Per-test log capture is too slow. Consider reducing test count or optimizing docker compose logs.');
    throw new Error(
      `Log capture overhead ${totalSec}s exceeds ${FAIL_THRESHOLD_MS / 1000}s threshold`
    );
  }

  if (totalMs > WARN_THRESHOLD_MS) {
    console.warn(
      `\n⚠️  Log capture overhead WARNING: ${totalSec}s > ${WARN_THRESHOLD_MS / 1000}s`
    );
    console.warn('Consider monitoring this — log capture may be slowing down the test suite.');
  } else {
    console.log(`✅ Log capture overhead within threshold (< ${WARN_THRESHOLD_MS / 1000}s)`);
  }
}
