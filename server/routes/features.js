'use strict';

const express = require('express');
const logger = require('../logger');
const { getFeatureFlags } = require('../feature-flags');
const { optionalAuth } = require('../middleware/auth');
const { bootQuietContext, logBootQuiet } = require('../services/boot-quiet');

const router = express.Router();

// CS53-19: `/api/features` is a pure in-memory read (no DB at all), so the
// boot-quiet contract is trivially satisfied — `dbTouched` is always false.
// We still emit the boot-quiet telemetry line so the per-endpoint matrix in
// docs/observability.md observes the route consistently and the CI
// regression test in tests/e2e/boot-quiet.spec.mjs can assert on it.
router.get('/', optionalAuth, (req, res) => {
  const features = getFeatureFlags(req);
  const userId = req.user ? req.user.id : null;
  const featureCount = Object.keys(features).length;
  logger.debug({ userId, featureCount }, 'feature flags requested');
  const ctx = bootQuietContext(req);
  logBootQuiet('/api/features', ctx, false);
  res.json({ features });
});

module.exports = router;
