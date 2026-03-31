/**
 * Migration 001 — Initial schema.
 *
 * Executes schema.sql which creates all tables with IF NOT EXISTS.
 * For new databases this creates everything; for existing databases
 * the IF NOT EXISTS clauses make it a safe no-op.
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  version: 1,
  name: 'initial-schema',
  async up(db) {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await db.exec(schema);
  },
};
