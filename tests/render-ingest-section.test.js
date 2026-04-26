/**
 * Tests for scripts/render-ingest-section.js (CS41-7).
 *
 * Pure markdown renderer — fixture-based. Covers:
 *   - Happy path: window + totals + per-itemType table.
 *   - Empty rows → "no telemetry rows in window" placeholder row.
 *   - Fallback window flag → ⚠️ annotation.
 *   - error field → ⚠️ status line.
 *   - Missing/null data → degraded placeholder, doesn't crash.
 */

import { describe, it, expect } from 'vitest';
import { render, fmtGb, fmtDurationMs } from '../scripts/render-ingest-section.js';

const happyDelta = {
  env: 'production',
  ai_resource: 'gwn-ai-production',
  resource_group: 'gwn-rg',
  workflow: 'prod-deploy.yml',
  window_start: '2026-04-26T19:30:00.000Z',
  window_end: '2026-04-26T22:15:00.000Z',
  used_fallback: false,
  fallback_hours: null,
  kql: 'union requests, ...',
  by_itemType: [
    { itemType: 'requests', gb_ingested: 0.0021, rows: 32 },
    { itemType: 'customEvents', gb_ingested: 0.0013, rows: 15 },
  ],
  total_gb: 0.0034,
  total_rows: 47,
  error: null,
};

describe('CS41-7 — render-ingest-section happy path', () => {
  it('emits header naming the AI resource', () => {
    const md = render(happyDelta);
    expect(md).toMatch(/^## AI ingest since previous deploy \(gwn-ai-production\)/);
  });

  it('shows window + duration + totals', () => {
    const md = render(happyDelta);
    expect(md).toContain('2026-04-26T19:30:00.000Z → 2026-04-26T22:15:00.000Z');
    expect(md).toContain('~2h 45m');
    expect(md).toContain('**Total ingest:** 0.0034 GB');
    expect(md).toContain('**Total rows:** 47');
  });

  it('emits per-itemType table rows', () => {
    const md = render(happyDelta);
    expect(md).toContain('| itemType | rows | GB |');
    expect(md).toContain('| requests | 32 | 0.0021 |');
    expect(md).toContain('| customEvents | 15 | 0.0013 |');
  });

  it('includes workflow + env footer when workflow set', () => {
    const md = render(happyDelta);
    expect(md).toContain('Workflow: `prod-deploy.yml`');
    expect(md).toContain('env: `production`');
  });
});

describe('CS41-7 — render-ingest-section degraded paths', () => {
  it('shows fallback warning when used_fallback=true', () => {
    const md = render({ ...happyDelta, used_fallback: true, fallback_hours: 24 });
    expect(md).toContain('no prior successful deploy found');
    expect(md).toContain('24h fallback');
  });

  it('shows error status line when error set', () => {
    const md = render({ ...happyDelta, error: 'az exited 1: auth failure' });
    expect(md).toContain('⚠️ query failed');
    expect(md).toContain('az exited 1: auth failure');
  });

  it('emits placeholder row when by_itemType empty', () => {
    const md = render({ ...happyDelta, by_itemType: [], total_rows: 0, total_gb: 0 });
    expect(md).toContain('_no telemetry rows in window_');
  });

  it('handles null/undefined data without crashing', () => {
    const md = render(null);
    expect(md).toContain('## AI ingest since previous deploy');
    expect(md).toContain('_Ingest delta not produced._');
  });

  it('renders even when ai_resource missing (uses env-derived name)', () => {
    const md = render({ env: 'staging', by_itemType: [], total_rows: 0, total_gb: 0 });
    expect(md).toMatch(/^## AI ingest since previous deploy \(gwn-ai-staging\)/);
  });
});

describe('CS41-7 — fmt helpers', () => {
  it('fmtGb trims trailing zeros and handles edge cases', () => {
    expect(fmtGb(0)).toBe('0');
    expect(fmtGb(0.0021)).toBe('0.0021');
    expect(fmtGb(NaN)).toBe('—');
    expect(fmtGb(null)).toBe('—');
  });

  it('fmtDurationMs formats sub-minute, sub-hour, and multi-hour windows', () => {
    expect(fmtDurationMs(45 * 1000)).toBe('45s');
    expect(fmtDurationMs(45 * 60 * 1000)).toBe('45m');
    expect(fmtDurationMs((2 * 3600 + 45 * 60) * 1000)).toBe('2h 45m');
    expect(fmtDurationMs(-1)).toBe('—');
  });
});
