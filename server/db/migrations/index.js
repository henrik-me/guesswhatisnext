/**
 * Migration registry — exports all migration definitions sorted by version.
 */

const migrations = [
  require('./001-initial'),
  require('./002-add-role'),
  require('./003-add-max-players'),
  require('./004-add-submitted-by'),
  require('./005-add-submission-type'),
  require('./006-add-image-type'),
  require('./007-add-notifications'),
].sort((a, b) => a.version - b.version);

module.exports = migrations;
