/**
 * Unit tests for createInitGuard (CS53-1b).
 *
 * Covers the concurrency contract used by /api/admin/init-db and the
 * slow-retry self-init timer: overlapping callers must share a single
 * in-flight execution rather than each invoking the underlying init.
 */

const { createInitGuard } = require('../server/lib/db-init-guard');

describe('createInitGuard', () => {
  test('concurrent runOnce calls invoke the task exactly once', async () => {
    let calls = 0;
    let resolveTask;
    const guard = createInitGuard(() => {
      calls++;
      return new Promise((resolve) => { resolveTask = resolve; });
    });

    const p1 = guard.runOnce();
    const p2 = guard.runOnce();
    const p3 = guard.runOnce();

    expect(guard.isInFlight()).toBe(true);
    expect(calls).toBe(1);

    resolveTask('ok');
    const results = await Promise.all([p1, p2, p3]);

    expect(results).toEqual(['ok', 'ok', 'ok']);
    expect(calls).toBe(1);
    // After settle, the guard clears the in-flight slot.
    await new Promise((r) => setImmediate(r));
    expect(guard.isInFlight()).toBe(false);
  });

  test('all concurrent callers see the same rejection', async () => {
    let calls = 0;
    let rejectTask;
    const guard = createInitGuard(() => {
      calls++;
      return new Promise((_resolve, reject) => { rejectTask = reject; });
    });

    const p1 = guard.runOnce();
    const p2 = guard.runOnce();

    rejectTask(new Error('boom'));

    await expect(p1).rejects.toThrow('boom');
    await expect(p2).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  test('after a settled run, the next runOnce starts a fresh execution', async () => {
    let calls = 0;
    const guard = createInitGuard(async () => { calls++; return calls; });

    await expect(guard.runOnce()).resolves.toBe(1);
    await expect(guard.runOnce()).resolves.toBe(2);
    expect(calls).toBe(2);
  });

  test('after a failed run, the next runOnce can succeed (no permanent stick)', async () => {
    let mode = 'fail';
    const guard = createInitGuard(async () => {
      if (mode === 'fail') throw new Error('first');
      return 'ok';
    });

    await expect(guard.runOnce()).rejects.toThrow('first');
    expect(guard.isInFlight()).toBe(false);

    mode = 'pass';
    await expect(guard.runOnce()).resolves.toBe('ok');
  });

  test('throws if taskFn is not a function', () => {
    expect(() => createInitGuard(null)).toThrow(TypeError);
    expect(() => createInitGuard('nope')).toThrow(TypeError);
  });
});
