/**
 * Migration registry — exports all migration definitions sorted by version.
 */

const migrations = [
  require('./001-initial'),
  require('./002-add-role'),
  require('./003-add-max-players'),
  require('./004-add-submitted-by'),
].sort((a, b) => a.version - b.version);

module.exports = migrations;
