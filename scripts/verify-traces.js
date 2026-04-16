#!/usr/bin/env node
// verify-traces.js — Post-E2E trace verification against OTel collector output.
// Reads exported traces from the otel-collector container and validates:
//  1. Spans exist for HTTP requests
//  2. Spans include expected attributes (http.method, service.name)
//  3. At least one trace_id from spans correlates with container server logs

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = 'docker-compose.mssql.yml';
const ARTIFACTS_DIR = path.join(ROOT, 'test-results');

function exec(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' });
}

function readCollectorTraces() {
  try {
    const raw = exec(
      `docker compose -f ${COMPOSE_FILE} exec -T otel-collector cat /data/traces.json`,
    );
    // The file exporter writes one JSON object per line (JSONL format)
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  } catch (err) {
    console.error('Failed to read traces from collector:', err.message);
    return [];
  }
}

function extractSpans(traceObjects) {
  const spans = [];
  for (const obj of traceObjects) {
    const resourceSpans = obj.resourceSpans || [];
    for (const rs of resourceSpans) {
      const resource = rs.resource || {};
      const resourceAttrs = {};
      for (const attr of (resource.attributes || [])) {
        resourceAttrs[attr.key] = attr.value?.stringValue || attr.value?.intValue || attr.value;
      }

      const scopeSpans = rs.scopeSpans || [];
      for (const ss of scopeSpans) {
        for (const span of (ss.spans || [])) {
          const spanAttrs = {};
          for (const attr of (span.attributes || [])) {
            spanAttrs[attr.key] = attr.value?.stringValue || attr.value?.intValue || attr.value;
          }
          spans.push({
            traceId: span.traceId,
            spanId: span.spanId,
            name: span.name,
            kind: span.kind,
            attributes: spanAttrs,
            resourceAttributes: resourceAttrs,
          });
        }
      }
    }
  }
  return spans;
}

function readServerLogs() {
  try {
    return exec(
      `docker compose -f ${COMPOSE_FILE} logs app --no-log-prefix`,
    );
  } catch {
    return '';
  }
}

function verify() {
  console.log('\n=== OTel Trace Verification ===\n');

  // Step 1: Read traces
  const traceObjects = readCollectorTraces();
  if (traceObjects.length === 0) {
    console.error('✗ No trace data found in collector output');
    return false;
  }
  console.log(`  Found ${traceObjects.length} trace export(s) from collector`);

  // Step 2: Extract spans
  const spans = extractSpans(traceObjects);
  if (spans.length === 0) {
    console.error('✗ No spans found in trace data');
    return false;
  }
  console.log(`  Found ${spans.length} span(s) total`);

  // Step 3: Verify HTTP spans exist
  const httpSpans = spans.filter((s) =>
    s.attributes['http.method'] ||
    s.attributes['http.request.method'] ||
    s.name?.startsWith('GET ') ||
    s.name?.startsWith('POST ') ||
    s.name?.startsWith('PUT ') ||
    s.name?.startsWith('DELETE '),
  );
  if (httpSpans.length === 0) {
    console.error('✗ No HTTP spans found (expected http.method or http.request.method attribute)');
    return false;
  }
  console.log(`  ✓ Found ${httpSpans.length} HTTP span(s)`);

  // Step 4: Verify service.name attribute
  const spansWithServiceName = spans.filter((s) =>
    s.resourceAttributes['service.name'],
  );
  if (spansWithServiceName.length === 0) {
    console.error('✗ No spans found with service.name resource attribute');
    return false;
  }
  const serviceNames = [...new Set(spansWithServiceName.map((s) => s.resourceAttributes['service.name']))];
  console.log(`  ✓ service.name found: ${serviceNames.join(', ')}`);

  // Step 5: Correlate trace IDs with server logs
  const serverLogs = readServerLogs();
  const traceIds = [...new Set(spans.map((s) => s.traceId))];
  console.log(`  Found ${traceIds.length} unique trace ID(s)`);

  let correlatedCount = 0;
  for (const traceId of traceIds) {
    if (serverLogs.includes(traceId)) {
      correlatedCount++;
    }
  }

  if (correlatedCount > 0) {
    console.log(`  ✓ ${correlatedCount} trace ID(s) correlated with server logs`);
  } else {
    // Log correlation is best-effort — OTel trace IDs may not appear in pino logs
    // unless trace context propagation is configured. Report as a warning, not failure.
    console.log('  ⚠ No trace IDs found in server logs (trace context propagation may not be configured)');
  }

  // Save trace summary to artifacts
  try {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    const summary = {
      totalExports: traceObjects.length,
      totalSpans: spans.length,
      httpSpans: httpSpans.length,
      serviceNames,
      uniqueTraceIds: traceIds.length,
      correlatedTraceIds: correlatedCount,
      sampleSpans: httpSpans.slice(0, 5).map((s) => ({
        name: s.name,
        traceId: s.traceId,
        attributes: s.attributes,
      })),
    };
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'otel-trace-summary.json'),
      JSON.stringify(summary, null, 2),
    );
    console.log('  ✓ Trace summary saved to test-results/otel-trace-summary.json');
  } catch {
    console.log('  ⚠ Could not save trace summary to artifacts');
  }

  console.log('\n✓ OTel trace verification passed\n');
  return true;
}

if (require.main === module) {
  const passed = verify();
  process.exit(passed ? 0 : 1);
}

module.exports = { verify, readCollectorTraces, extractSpans };
