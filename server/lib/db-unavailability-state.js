'use strict';

/**
 * Process-local in-memory holder for the current "DB permanently
 * unavailable" descriptor (CS53 Bug B / CS52-7e).
 *
 * Single source of truth that the request gate (`server/app.js`), the
 * /api/sync route, and the /api/sessions/:id/finish route consult to
 * decide whether to enqueue a `pending_writes` file (CS52-7e) instead
 * of attempting a real DB write.
 *
 * Shape of the descriptor matches what
 * `lib/transient-db-error.js#getDbUnavailability` returns:
 *   { reason: string, message: string }
 *
 * Listeners registered via `onUnavailabilityCleared` fire on the
 * non-null → null transition (i.e. "DB is back"). The only consumer
 * today is the `pending-writes` drain worker, which kicks off a
 * single drain pass on transition. Listeners run synchronously and
 * MUST NOT throw; their internal failures are swallowed so a buggy
 * listener can't break the gate path.
 *
 * Per [INSTRUCTIONS.md § Database & Data], no timer/scheduler is
 * registered here — drain triggers are caller-driven (next-successful-
 * DB-write hook + state-cleared listener).
 */

let _state = null;
let _listeners = [];

function getDbUnavailabilityState() {
  return _state;
}

function setDbUnavailabilityState(next) {
  const prev = _state;
  _state = next || null;
  if (prev && !_state) {
    const ls = _listeners.slice();
    for (const fn of ls) {
      try { fn(); } catch { /* ignore listener failure */ }
    }
  }
}

function onUnavailabilityCleared(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter((f) => f !== fn); };
}

function __resetForTests() {
  _state = null;
  _listeners = [];
}

module.exports = {
  getDbUnavailabilityState,
  setDbUnavailabilityState,
  onUnavailabilityCleared,
  __resetForTests,
};
