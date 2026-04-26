/**
 * Tests for scripts/check-migration-policy.js (CS41-11).
 *
 * Verifies pattern coverage, override mechanism, and that all 8 real
 * migrations under server/db/migrations/ pass without overrides.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'check-migration-policy.js');
const REPO_ROOT = path.resolve(__dirname, '..');

const {
  stripJsToSqlMask,
  scanFile,
  scanAll,
  formatFindings,
  validateOverrideReason,
  findOverrideOnLine,
  MIGRATIONS_DIR,
} = require('../scripts/check-migration-policy.js');

// ---------------------------------------------------------------------------
// Real-codebase smoke
// ---------------------------------------------------------------------------

describe('CS41-11 — real migrations smoke', () => {
  it('all 8 current migrations pass with no findings (no overrides needed)', () => {
    const { files, findings } = scanAll(MIGRATIONS_DIR);
    expect(files.length).toBe(8);
    if (findings.length !== 0) {
      // Surface details if this fails
      console.error(formatFindings(findings, REPO_ROOT).text);
    }
    expect(findings).toEqual([]);
  });

  it('CLI exits 0 against the real migrations directory', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/8 migration file\(s\) scanned, no findings/);
  });
});

// ---------------------------------------------------------------------------
// Synthetic fixture migrations
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs41-11-'));
});
afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writeMigration(name, body) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, body, 'utf-8');
  return p;
}

describe('CS41-11 — clean additive migration', () => {
  it('passes with no findings', () => {
    const file = writeMigration(
      '010-add-column.js',
      `module.exports = {
  version: 10,
  name: 'add-flag',
  async up(db) {
    await db.exec('ALTER TABLE users ADD COLUMN flag INTEGER NOT NULL DEFAULT 0');
    await db.exec(\`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL
      );
    \`);
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });
});

describe('CS41-11 — DROP COLUMN', () => {
  it('flags DROP COLUMN without override', () => {
    const file = writeMigration(
      '011-drop-column.js',
      `module.exports = {
  version: 11,
  name: 'drop-col',
  async up(db) {
    await db.exec('ALTER TABLE users DROP COLUMN legacy_flag');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.length).toBe(1);
    expect(findings[0].rule).toBe('drop-column');
    expect(findings[0].override).toBeNull();
  });

  it('passes with valid override comment on the line above', () => {
    const file = writeMigration(
      '012-drop-with-override.js',
      `module.exports = {
  version: 12,
  name: 'drop-col',
  async up(db) {
    // MIGRATION-POLICY-OVERRIDE: column dropped per expand-migrate-contract plan CS41-13 phase C
    await db.exec('ALTER TABLE users DROP COLUMN legacy_flag');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.length).toBe(1);
    expect(findings[0].override).not.toBeNull();
    expect(findings[0].override.validation.ok).toBe(true);
  });

  it('passes with valid inline override comment', () => {
    const file = writeMigration(
      '013-drop-inline.js',
      `module.exports = {
  version: 13,
  name: 'drop-col',
  async up(db) {
    await db.exec('ALTER TABLE users DROP COLUMN legacy_flag'); // MIGRATION-POLICY-OVERRIDE: per https://example.com/cs41-13-plan
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.length).toBe(1);
    expect(findings[0].override.validation.ok).toBe(true);
  });

  it('rejects override that is too short', () => {
    const file = writeMigration(
      '014-drop-shortreason.js',
      `module.exports = {
  version: 14,
  name: 'drop-col',
  async up(db) {
    // MIGRATION-POLICY-OVERRIDE: oops
    await db.exec('ALTER TABLE users DROP COLUMN legacy_flag');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.length).toBe(1);
    expect(findings[0].override.validation.ok).toBe(false);
    expect(findings[0].override.validation.error).toMatch(/too short/);
  });

  it('rejects override that has no URL or CS-link', () => {
    const file = writeMigration(
      '015-drop-nolink.js',
      `module.exports = {
  version: 15,
  name: 'drop-col',
  async up(db) {
    // MIGRATION-POLICY-OVERRIDE: legacy column not used anymore — safe to drop
    await db.exec('ALTER TABLE users DROP COLUMN legacy_flag');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.length).toBe(1);
    expect(findings[0].override.validation.ok).toBe(false);
    expect(findings[0].override.validation.error).toMatch(/URL or a CS-link/);
  });
});

describe('CS41-11 — NOT NULL without DEFAULT', () => {
  it('flags ADD COLUMN x NOT NULL without DEFAULT', () => {
    const file = writeMigration(
      '020-not-null-no-default.js',
      `module.exports = {
  version: 20,
  name: 'add-required',
  async up(db) {
    await db.exec('ALTER TABLE users ADD COLUMN required_field TEXT NOT NULL');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.length).toBe(1);
    expect(findings[0].rule).toBe('not-null-without-default');
  });

  it('passes ADD COLUMN x NOT NULL DEFAULT 0', () => {
    const file = writeMigration(
      '021-not-null-default.js',
      `module.exports = {
  version: 21,
  name: 'add-required',
  async up(db) {
    await db.exec('ALTER TABLE users ADD COLUMN required_field INTEGER NOT NULL DEFAULT 0');
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });

  it('passes MSSQL ADD col NOT NULL CONSTRAINT DF_x DEFAULT \'value\'', () => {
    const file = writeMigration(
      '022-mssql-default.js',
      `module.exports = {
  version: 22,
  name: 'add-required',
  async up(db) {
    await db.exec(\`
      IF COL_LENGTH('users', 'role2') IS NULL
        ALTER TABLE users ADD role2 NVARCHAR(50) NOT NULL
          CONSTRAINT DF_users_role2 DEFAULT 'user';
    \`);
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });

  it('does NOT flag NOT NULL inside CREATE TABLE (fresh table is safe)', () => {
    const file = writeMigration(
      '023-create-table.js',
      `module.exports = {
  version: 23,
  name: 'create-table',
  async up(db) {
    await db.exec(\`
      CREATE TABLE IF NOT EXISTS new_thing (
        id INTEGER PRIMARY KEY,
        required_field TEXT NOT NULL
      );
    \`);
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });
});

describe('CS41-11 — DROP TABLE / RENAME TABLE', () => {
  it('flags DROP TABLE without IF EXISTS and no rebuild idiom', () => {
    const file = writeMigration(
      '030-drop-table.js',
      `module.exports = {
  version: 30,
  name: 'drop-table',
  async up(db) {
    await db.exec('DROP TABLE old_table');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.some((f) => f.rule === 'drop-table')).toBe(true);
  });

  it('passes DROP TABLE IF EXISTS', () => {
    const file = writeMigration(
      '031-drop-if-exists.js',
      `module.exports = {
  version: 31,
  name: 'drop-temp',
  async up(db) {
    await db.exec('DROP TABLE IF EXISTS scratch_table');
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });

  it('passes the SQLite rebuild idiom (DROP + RENAME _new TO original)', () => {
    const file = writeMigration(
      '032-rebuild.js',
      `module.exports = {
  version: 32,
  name: 'rebuild',
  async up(db) {
    await db.exec('CREATE TABLE foo_new (id INTEGER PRIMARY KEY)');
    await db.exec('INSERT INTO foo_new SELECT id FROM foo');
    await db.exec('DROP TABLE foo');
    await db.exec('ALTER TABLE foo_new RENAME TO foo');
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });

  it('flags ALTER TABLE x RENAME TO y where source is not *_new', () => {
    const file = writeMigration(
      '033-rename-table.js',
      `module.exports = {
  version: 33,
  name: 'rename-table',
  async up(db) {
    await db.exec('ALTER TABLE users RENAME TO accounts');
  },
};
`
    );
    const findings = scanFile(file);
    expect(findings.some((f) => f.rule === 'rename-table')).toBe(true);
  });
});

describe('CS41-11 — RENAME COLUMN, ALTER COLUMN, FK changes', () => {
  it('flags RENAME COLUMN', () => {
    const file = writeMigration(
      '040-rename-col.js',
      `module.exports = {
  version: 40, name: 'rc',
  async up(db) { await db.exec('ALTER TABLE users RENAME COLUMN old_name TO new_name'); },
};
`
    );
    expect(scanFile(file).some((f) => f.rule === 'rename-column')).toBe(true);
  });

  it('flags ALTER COLUMN ... NOT NULL even with DEFAULT', () => {
    const file = writeMigration(
      '041-alter-col.js',
      `module.exports = {
  version: 41, name: 'ac',
  async up(db) { await db.exec('ALTER TABLE users ALTER COLUMN field NVARCHAR(50) NOT NULL'); },
};
`
    );
    expect(scanFile(file).some((f) => f.rule === 'alter-column-not-null')).toBe(true);
  });

  it('flags DROP CONSTRAINT FK_*', () => {
    const file = writeMigration(
      '042-drop-fk.js',
      `module.exports = {
  version: 42, name: 'fk',
  async up(db) { await db.exec('ALTER TABLE matches DROP CONSTRAINT FK_matches_host_user_id'); },
};
`
    );
    expect(scanFile(file).some((f) => f.rule === 'drop-foreign-key')).toBe(true);
  });

  it('does NOT flag DROP CONSTRAINT CK_* (CHECK widening is backward-compat)', () => {
    const file = writeMigration(
      '043-drop-check.js',
      `module.exports = {
  version: 43, name: 'ck',
  async up(db) {
    await db.exec(\`
      ALTER TABLE puzzle_submissions DROP CONSTRAINT CK_puzzle_submissions_type;
      ALTER TABLE puzzle_submissions ADD CONSTRAINT CK_puzzle_submissions_type
        CHECK(type IN ('emoji','text','image'));
    \`);
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });
});

describe('CS41-11 — false-positive guards', () => {
  it('ignores SQL keywords inside JS comments', () => {
    const file = writeMigration(
      '050-comment.js',
      `// This migration does NOT do DROP COLUMN. We promise.
/* DROP TABLE users; would be bad. */
module.exports = {
  version: 50, name: 'comment-only',
  async up(db) { await db.exec('SELECT 1'); },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });

  it('does not scan JS code inside ${} template interpolation', () => {
    const file = writeMigration(
      '051-interp.js',
      `module.exports = {
  version: 51, name: 'interp',
  async up(db) {
    const tableName = 'users';
    // The identifier inside \${} is JS code, not SQL — even if it were named
    // dropColumnOldFlag, the linter must not treat it as a SQL DROP COLUMN.
    const dropColumnOldFlag = 1;
    await db.exec(\`SELECT * FROM \${tableName} WHERE x = \${dropColumnOldFlag}\`);
  },
};
`
    );
    expect(scanFile(file)).toEqual([]);
  });
});

describe('CS41-11 — CLI exit codes against fixtures', () => {
  it('exits non-zero on a directory with violations', () => {
    writeMigration(
      '011-bad.js',
      `module.exports = { version: 11, name: 'b',
  async up(db) { await db.exec('ALTER TABLE users DROP COLUMN x'); } };`
    );
    // Run the linter as a child process pointed at a custom dir via require.
    const inlineRunner = `
      const path = require('path');
      const { scanAll, formatFindings } = require(${JSON.stringify(SCRIPT)});
      const r = scanAll(${JSON.stringify(tmpDir)});
      const { hardFailures } = formatFindings(r.findings, ${JSON.stringify(tmpDir)});
      process.exit(hardFailures > 0 ? 1 : 0);
    `;
    const res = spawnSync(process.execPath, ['-e', inlineRunner], { encoding: 'utf-8' });
    expect(res.status).toBe(1);
  });

  it('exits zero when all violations have valid overrides', () => {
    writeMigration(
      '012-overridden.js',
      `module.exports = { version: 12, name: 'b', async up(db) {
        // MIGRATION-POLICY-OVERRIDE: dropping per CS41-13 expand-migrate-contract plan
        await db.exec('ALTER TABLE users DROP COLUMN x');
      }};`
    );
    const inlineRunner = `
      const { scanAll, formatFindings } = require(${JSON.stringify(SCRIPT)});
      const r = scanAll(${JSON.stringify(tmpDir)});
      const { hardFailures } = formatFindings(r.findings, ${JSON.stringify(tmpDir)});
      process.exit(hardFailures > 0 ? 1 : 0);
    `;
    const res = spawnSync(process.execPath, ['-e', inlineRunner], { encoding: 'utf-8' });
    expect(res.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure-function unit tests
// ---------------------------------------------------------------------------

describe('CS41-11 — validateOverrideReason', () => {
  it('rejects empty / short reasons', () => {
    expect(validateOverrideReason('').ok).toBe(false);
    expect(validateOverrideReason('short').ok).toBe(false);
  });
  it('requires URL or CS-link', () => {
    expect(validateOverrideReason('this is twenty characters easily here').ok).toBe(false);
  });
  it('accepts a CS-link', () => {
    expect(validateOverrideReason('per the CS41-13 expand-migrate-contract plan').ok).toBe(true);
  });
  it('accepts a URL', () => {
    expect(validateOverrideReason('see https://github.com/x/y/pull/123 for plan').ok).toBe(true);
  });
});

describe('CS41-11 — findOverrideOnLine', () => {
  it('parses inline reason after //', () => {
    const r = findOverrideOnLine(
      "    await db.exec('DROP COLUMN x'); // MIGRATION-POLICY-OVERRIDE: per CS41-13 plan and notes"
    );
    expect(r).not.toBeNull();
    expect(r.reason).toMatch(/CS41-13/);
  });
  it('parses block-comment-style override', () => {
    const r = findOverrideOnLine('    /* MIGRATION-POLICY-OVERRIDE: per CS41-13 plan */');
    expect(r).not.toBeNull();
    expect(r.reason.trim()).toMatch(/CS41-13 plan/);
  });
  it('returns null for unrelated lines', () => {
    expect(findOverrideOnLine("await db.exec('SELECT 1');")).toBeNull();
  });
});

describe('CS41-11 — stripJsToSqlMask', () => {
  it('preserves string literal contents and blanks JS code', () => {
    const src = "const x = 1; // comment\nawait db.exec('DROP COLUMN y');\n";
    const masked = stripJsToSqlMask(src);
    expect(masked.length).toBe(src.length);
    expect(masked).toContain('DROP COLUMN y');
    expect(masked).not.toContain('const');
    expect(masked).not.toContain('comment');
  });
  it('preserves newlines so line numbers align', () => {
    const src = "// line1 DROP COLUMN\nawait db.exec('ALTER TABLE x DROP COLUMN y');\n";
    const masked = stripJsToSqlMask(src);
    const lines = masked.split('\n');
    expect(lines.length).toBe(src.split('\n').length);
    expect(lines[0]).not.toMatch(/DROP COLUMN/); // comment blanked
    expect(lines[1]).toMatch(/DROP COLUMN/);
  });
});
