'use strict';

const express = require('express');
const { getFeatureFlags } = require('../feature-flags');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  res.json({ features: getFeatureFlags(req) });
});

module.exports = router;
