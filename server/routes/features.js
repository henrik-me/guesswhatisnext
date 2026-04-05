'use strict';

const express = require('express');
const logger = require('../logger');
const { getFeatureFlags } = require('../feature-flags');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const features = getFeatureFlags(req);
  const userId = req.user ? req.user.id : null;
  logger.info({ features, userId }, 'feature flags requested');
  res.json({ features });
});

module.exports = router;
