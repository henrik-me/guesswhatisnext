import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations, main } = require('../scripts/migrate.js');
const liveMigrations = require('../server/db/migrations');

describe('scripts/migrate.js', () => {
  describe('runMigrations(deps)', () => {
    it('connects via the injected getDbAdapter() and forwards migrations to db.migrate()', async () => {
      const migrate = vi.fn().mockResolvedValue(3);
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });

      const applied = await runMigrations({ getDbAdapter });

      expect(getDbAdapter).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
      // Defaults to the live migration registry (verifies the wiring).
      expect(migrate.mock.calls[0][0]).toBe(liveMigrations);
      expect(applied).toBe(3);
    });

    it('returns 0 when no migrations are pending (idempotent re-run)', async () => {
      const migrate = vi.fn().mockResolvedValue(0);
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });

      const applied = await runMigrations({ getDbAdapter });

      expect(applied).toBe(0);
      expect(migrate).toHaveBeenCalledTimes(1);
    });

    it('forwards an injected migrations array (smaller-than-live test override)', async () => {
      const migrate = vi.fn().mockResolvedValue(1);
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });
      const fakeMigrations = [{ version: 99, name: 'fake', up: async () => {} }];

      await runMigrations({ getDbAdapter, migrations: fakeMigrations });

      expect(migrate).toHaveBeenCalledWith(fakeMigrations);
    });

    it('propagates errors thrown by db.migrate()', async () => {
      const migrate = vi.fn().mockRejectedValue(new Error('connection refused'));
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });

      await expect(runMigrations({ getDbAdapter })).rejects.toThrow('connection refused');
    });
  });

  describe('main(deps) — CLI exit handling', () => {
    let exitSpy;
    let logSpy;
    let errSpy;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`__exit_${code}__`);
      });
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      errSpy.mockRestore();
    });

    it('success path: logs completion, closes adapter, exits 0', async () => {
      const migrate = vi.fn().mockResolvedValue(2);
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });
      const closeDbAdapter = vi.fn().mockResolvedValue(undefined);

      let exitCode;
      try {
        await main({ getDbAdapter, closeDbAdapter });
      } catch (err) {
        exitCode = err.message;
      }

      expect(exitCode).toBe('__exit_0__');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Migrations complete'));
      expect(closeDbAdapter).toHaveBeenCalledTimes(1);
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('failure path: logs error, closes adapter, exits 1', async () => {
      const migrate = vi.fn().mockRejectedValue(new Error('schema mismatch'));
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });
      const closeDbAdapter = vi.fn().mockResolvedValue(undefined);

      let exitCode;
      try {
        await main({ getDbAdapter, closeDbAdapter });
      } catch (err) {
        exitCode = err.message;
      }

      expect(exitCode).toBe('__exit_1__');
      expect(errSpy).toHaveBeenCalledWith(
        'Migration failed:',
        expect.stringContaining('schema mismatch')
      );
      expect(closeDbAdapter).toHaveBeenCalledTimes(1);
    });

    it('failure path: still exits 1 even if closeDbAdapter() also throws', async () => {
      const migrate = vi.fn().mockRejectedValue(new Error('migration boom'));
      const getDbAdapter = vi.fn().mockResolvedValue({ migrate });
      const closeDbAdapter = vi.fn().mockRejectedValue(new Error('close boom'));

      let exitCode;
      try {
        await main({ getDbAdapter, closeDbAdapter });
      } catch (err) {
        exitCode = err.message;
      }

      expect(exitCode).toBe('__exit_1__');
      // Both errors are surfaced for operator diagnosis.
      const stderrMessages = errSpy.mock.calls.map((args) => args.join(' '));
      expect(stderrMessages.some((m) => m.includes('migration boom'))).toBe(true);
      expect(stderrMessages.some((m) => m.includes('close boom'))).toBe(true);
    });
  });
});
