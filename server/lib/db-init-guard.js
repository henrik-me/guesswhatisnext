/**
 * Init concurrency guard.
 *
 * Wraps an async task (typically `initializeDatabase`) so that overlapping
 * callers share a single in-flight execution instead of starting their own.
 *
 * Used by CS53-1 to prevent /api/admin/init-db and the slow-retry self-init
 * timer from racing into concurrent `initializeDatabase()` calls — which
 * could leave the process broken even if one of them succeeds, because the
 * loser may close the freshly-built adapter and reset `dbInitialized`.
 *
 * Contract:
 *   - `runOnce()` returns the in-flight promise if one exists, otherwise
 *     starts a new execution.
 *   - The promise resolves to whatever `taskFn()` resolves to (or rejects
 *     with whatever it rejects with). All concurrent callers see the same
 *     result.
 *   - `isInFlight()` reports whether a task is currently executing — useful
 *     for callers that want to skip-and-reschedule rather than join.
 *   - The in-flight slot is cleared after the task settles (success or
 *     failure), so the next call starts a fresh execution.
 */
function createInitGuard(taskFn) {
  if (typeof taskFn !== 'function') {
    throw new TypeError('createInitGuard: taskFn must be a function');
  }
  let inFlight = null;

  function runOnce() {
    if (inFlight) return inFlight;
    // Invoke taskFn synchronously so observers (e.g. `isInFlight()`) see the
    // in-flight state before yielding. Promise.resolve() lifts both sync
    // returns and sync throws into the promise chain.
    let raw;
    try {
      raw = taskFn();
    } catch (err) {
      raw = Promise.reject(err);
    }
    inFlight = Promise.resolve(raw).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function isInFlight() {
    return inFlight !== null;
  }

  return { runOnce, isInFlight };
}

module.exports = { createInitGuard };
