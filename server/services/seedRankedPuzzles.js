'use strict';

/**
 * CS52-followup — shared core for ranked-puzzle seeding.
 *
 * Used by BOTH:
 *   - `scripts/seed-ranked-puzzles.js` (operator-invoked CLI; opens its own
 *     adapter, runs migrations, logs the structured event, exits)
 *   - `POST /api/admin/seed-ranked-puzzles` (in-container HTTP path so
 *     staging/prod can be seeded without `docker cp` of the script)
 *
 * Both callers must end up issuing the same dialect-specific idempotent
 * INSERT (SQLite `INSERT OR IGNORE`, MSSQL `WHERE NOT EXISTS`) so a second
 * invocation observes `inserted=0, skipped=N, total=N` regardless of which
 * surface invoked it. Keeping the SQL in one place is the whole point.
 *
 * Returns `{ inserted, skipped, total, version }`. Callers do their own
 * logging so each call site can use its own message (`Ranked puzzles seeded`
 * for the script, plus a route-specific audit log for the HTTP path).
 *
 * Boot-quiet contract: this module is imported lazily only from the script
 * and the admin route — never from app boot — so it cannot wake the DB on
 * its own.
 */

const path = require('path');
const fs = require('fs');

const SEED_FILE = path.join(
  __dirname,
  '..',
  'db',
  'seeds',
  'ranked-puzzles-v1.json'
);

function loadSeed() {
  const raw = fs.readFileSync(SEED_FILE, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.puzzles)) {
    throw new Error(`Seed file missing "puzzles" array: ${SEED_FILE}`);
  }
  return data;
}

async function seedRankedPuzzles(db) {
  if (!db || typeof db.transaction !== 'function') {
    throw new Error('seedRankedPuzzles requires a DB adapter with .transaction()');
  }
  const data = loadSeed();
  let inserted = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    for (const p of data.puzzles) {
      // created_at omitted intentionally — column DEFAULT (GETDATE() on
      // MSSQL, CURRENT_TIMESTAMP on SQLite) supplies a typed datetime.
      // Sending an ISO-Z string into an Azure SQL DATETIME is brittle
      // (implicit-conversion failures), so leave it to the schema.
      const params = [
        p.id,
        p.category,
        typeof p.prompt === 'string' ? p.prompt : JSON.stringify(p.prompt),
        JSON.stringify(p.options),
        p.answer,
        p.difficulty ?? null,
      ];
      let result;
      if (db.dialect === 'mssql') {
        // MERGE … WITH (HOLDLOCK) for race-safe idempotency: two
        // concurrent admin POSTs (or a CLI run that overlaps a route call)
        // could both pass a plain WHERE-NOT-EXISTS check and one would
        // trip the primary-key constraint as a 500. HOLDLOCK takes a
        // key-range lock so the existence check + INSERT happen atomically.
        // Mirrors `server/routes/admin.js`'s upsertConfig (CS52-7c) — the
        // canonical lock-safe MSSQL pattern in this codebase.
        // `$action` is `'INSERT'` when a row was inserted; we count
        // anything else (no MATCH-action here) as skipped.
        result = await tx.run(
          `MERGE INTO ranked_puzzles WITH (HOLDLOCK) AS t
           USING (SELECT ? AS id, ? AS category, ? AS prompt, ? AS options,
                         ? AS answer, ? AS difficulty) AS s
             ON t.id = s.id
           WHEN NOT MATCHED THEN
             INSERT (id, category, prompt, options, answer, difficulty, status)
             VALUES (s.id, s.category, s.prompt, s.options, s.answer, s.difficulty, 'active');`,
          params
        );
      } else {
        result = await tx.run(
          `INSERT OR IGNORE INTO ranked_puzzles
             (id, category, prompt, options, answer, difficulty, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          params
        );
      }
      const changes = result && typeof result.changes === 'number' ? result.changes : 0;
      if (changes > 0) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }
  });

  return { inserted, skipped, total: data.puzzles.length, version: data.version };
}

module.exports = { seedRankedPuzzles, loadSeed, SEED_FILE };
