/**
 * CS40-3 — Direct prod-mode coverage of the FEATURE_FLAG_ALLOW_OVERRIDE gate.
 *
 * `tests/feature-flags.test.js` injects `allowOverride: true` manually on
 * synthesized feature objects, so it never exercises the module-level
 * `OVERRIDE_ALLOWED` constant computed at `server/feature-flags.js:35-36`.
 * If a regression flipped that gate (e.g. someone removed the env-var
 * branch), nothing in the unit suite would catch it; the only signal would
 * be a post-merge staging smoke or local MSSQL E2E.
 *
 * This file uses `vi.resetModules()` + per-case `process.env` mutation to
 * require `server/feature-flags.js` fresh under each (NODE_ENV,
 * FEATURE_FLAG_ALLOW_OVERRIDE) combination and asserts the gate behaves
 * as designed.
 *
 * Vitest runs each test file in its own forked process
 * (`vitest.config.mjs`: `isolate: true`), so the env mutation is contained.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_OVERRIDE = process.env.FEATURE_FLAG_ALLOW_OVERRIDE;

function loadFeatureFlagsModule({ nodeEnv, override }) {
  process.env.NODE_ENV = nodeEnv;
  if (override === undefined) {
    delete process.env.FEATURE_FLAG_ALLOW_OVERRIDE;
  } else {
    process.env.FEATURE_FLAG_ALLOW_OVERRIDE = override;
  }
  // Invalidate both vitest's module registry AND the CommonJS require cache
  // for the two modules whose top-level code captures process.env values.
  // vi.resetModules() alone is insufficient when the target uses CJS require()
  // because the underlying require cache is process-scoped.
  vi.resetModules();
  const featureFlagsPath = require.resolve('../server/feature-flags');
  const configPath = require.resolve('../server/config');
  delete require.cache[featureFlagsPath];
  delete require.cache[configPath];
  // eslint-disable-next-line global-require
  return require('../server/feature-flags');
}

describe('FEATURE_FLAG_ALLOW_OVERRIDE module-level env gate', () => {
  beforeEach(() => {
    // Suppress the startup warning when the gate is explicitly opted-in
    // for production/staging — it would clutter test output.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_OVERRIDE === undefined) {
      delete process.env.FEATURE_FLAG_ALLOW_OVERRIDE;
    } else {
      process.env.FEATURE_FLAG_ALLOW_OVERRIDE = ORIGINAL_OVERRIDE;
    }
    vi.resetModules();
  });

  it('denies override in production by default (no env var)', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'production', override: undefined });
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'true' } })).toBe(false);
    expect(isFeatureEnabled('submitPuzzle', { headers: { 'x-gwn-feature-submit-puzzle': 'enabled' } })).toBe(false);
  });

  it('denies override in staging by default (no env var)', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'staging', override: undefined });
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'true' } })).toBe(false);
    expect(isFeatureEnabled('submitPuzzle', { headers: { 'x-gwn-feature-submit-puzzle': 'enabled' } })).toBe(false);
  });

  it('allows query override in production when FEATURE_FLAG_ALLOW_OVERRIDE=true', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'production', override: 'true' });
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'true' } })).toBe(true);
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'false' } })).toBe(false);
  });

  it('allows header override in production when FEATURE_FLAG_ALLOW_OVERRIDE=true', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'production', override: 'true' });
    expect(isFeatureEnabled('submitPuzzle', { headers: { 'x-gwn-feature-submit-puzzle': 'enabled' } })).toBe(true);
    expect(isFeatureEnabled('submitPuzzle', { headers: { 'x-gwn-feature-submit-puzzle': 'disabled' } })).toBe(false);
  });

  it('allows query override in staging when FEATURE_FLAG_ALLOW_OVERRIDE=true (in-CI smoke service path)', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'staging', override: 'true' });
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'true' } })).toBe(true);
  });

  it('allows query override in development without any opt-in env var', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'development', override: undefined });
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'true' } })).toBe(true);
  });

  it('does not treat non-truthy values as opt-in (FEATURE_FLAG_ALLOW_OVERRIDE=false in production stays denied)', () => {
    const { isFeatureEnabled } = loadFeatureFlagsModule({ nodeEnv: 'production', override: 'false' });
    expect(isFeatureEnabled('submitPuzzle', { query: { ff_submit_puzzle: 'true' } })).toBe(false);
  });
});
