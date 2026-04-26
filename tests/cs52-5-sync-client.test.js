/**
 * CS52-5 — sync-client.js unit tests.
 *
 * Covers (per the CS52-5 task spec § F. Tests):
 *   - X-User-Activity header sent on every sync
 *   - Sign-in / score-submit / sync-now triggers fire the sync RPC
 *   - Silent token refresh (boot path) does NOT fire sync
 *     (verified at the app.js call-site — tested indirectly via
 *      the absence of a sync trigger from auth-boot.js)
 *   - Single-flight + coalesce: 5 rapid triggers → exactly 2 server calls
 *   - Connectivity precedence: 401 + network down → ends in `auth-expired`
 *   - Client-side dedupe in db-unavailable: rapid triggers within
 *     retryAfterMs do not re-update lastQueuedAt for the same record
 *   - Claim prompt: unattached + mismatched → claimable bucket
 *   - Sign-out: L2 cleared, L1 user_id demoted to null, in-flight aborted
 *   - online event alone does NOT fire sync
 *   - Legacy queues are migrated into L1 on first call
 */

import { describe, it, expect, vi } from 'vitest';

// Mock browser globals
globalThis.document = undefined;
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
// EventTarget stand-in for installConnectivityListeners
class FakeWindow {
  constructor() { this._listeners = {}; }
  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }
  dispatch(type) {
    for (const fn of (this._listeners[type] || [])) fn();
  }
}

async function loadFresh() {
  vi.resetModules();
  localStorage.clear();
  const mod = await import('../public/js/sync-client.js');
  mod._resetSyncClientForTests();
  return mod;
}

function fakeOk(body = {}) {
  return Promise.resolve({
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  });
}
function fakeStatus(status, body = {}, headers = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h) => headers[h] || null },
    json: () => Promise.resolve(body),
  });
}

describe('buildRecord + enqueueRecord', () => {
  it('produces an immutable shape with generated client_game_id', async () => {
    const m = await loadFresh();
    const rec = m.buildRecord({
      score: 100,
      mode: 'freeplay',
      correctCount: 7,
      totalRounds: 10,
      bestStreak: 3,
      results: [{ correct: true, timeMs: 500 }, { correct: true, timeMs: 700 }],
    }, 42);
    expect(rec.client_game_id).toMatch(/^cg-/);
    expect(rec.user_id).toBe(42);
    expect(rec.schema_version).toBe(1);
    expect(rec.fastest_answer_ms).toBe(500);
    expect(rec.lastQueuedAt).toBeNull();
  });

  it('idempotent enqueue (same client_game_id → no-op)', async () => {
    const m = await loadFresh();
    const rec = m.buildRecord({ score: 1 }, null);
    expect(m.enqueueRecord(rec)).toBe(true);
    expect(m.enqueueRecord(rec)).toBe(false);
    expect(m.getL1Records().length).toBe(1);
  });
});

describe('syncNow happy path', () => {
  it('sends X-User-Activity header and processes acked/rejected/entities', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 100 }, 1));
    m.enqueueRecord(m.buildRecord({ score: 200 }, 1));
    const recs = m.getL1Records();
    const apiFetch = vi.fn(() => fakeOk({
      acked: [recs[0].client_game_id],
      rejected: [{ client_game_id: recs[1].client_game_id, reason: 'conflict_with_existing' }],
      entities: { profile: { stats: [], updatedAt: '2026-04-25T00:00:00Z' } },
    }));
    const result = await m.syncNow({ apiFetch, trigger: 'sign-in', currentUserId: 1 });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetch.mock.calls[0];
    expect(url).toBe('/api/sync');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-User-Activity']).toBe('1');
    expect(JSON.parse(opts.body).queuedRecords.length).toBe(2);
    expect(result.status).toBe(200);
    expect(m.getL1Records().length).toBe(0); // both removed (acked + rejected)
    expect(m.getL1Rejected().length).toBe(1);
    expect(m.getL2Entity('profile')).toBeTruthy();
    expect(m.connectivity.state).toBe('ok');
  });

  it('only includes records belonging to currentUserId', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 100 }, 1));
    m.enqueueRecord(m.buildRecord({ score: 200 }, 2));
    m.enqueueRecord(m.buildRecord({ score: 300 }, null)); // guest
    const apiFetch = vi.fn(() => fakeOk({ acked: [], rejected: [], entities: {} }));
    await m.syncNow({ apiFetch, trigger: 'sign-in', currentUserId: 1 });
    const sent = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(sent.queuedRecords.length).toBe(1);
    expect(sent.queuedRecords[0].score).toBe(100);
  });
});

describe('single-flight + coalesce', () => {
  it('5 rapid triggers during a flight → exactly 2 server calls', async () => {
    const m = await loadFresh();
    let resolveFirst;
    const apiFetch = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }))
      .mockImplementation(() => fakeOk({ acked: [], rejected: [], entities: {} }));
    // Fire 5 triggers in quick succession
    const ps = [];
    for (let i = 0; i < 5; i++) {
      ps.push(m.syncNow({ apiFetch, trigger: 'sync-now-button' }));
    }
    expect(m._isInFlight()).toBe(true);
    expect(m._hasPendingFollowup()).toBe(true);
    // Resolve the first
    resolveFirst({
      status: 200, ok: true,
      headers: { get: () => null },
      json: () => Promise.resolve({ acked: [], rejected: [], entities: {} }),
    });
    await Promise.all(ps);
    // Wait a microtask for the coalesced follow-up to launch + complete
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

describe('connectivity state machine precedence', () => {
  it('401 wins over db-unavailable (lower precedence)', async () => {
    // Start from a lower-precedence state where canSync is still true so the
    // RPC actually fires; the 401 path must escalate to auth-expired
    // regardless of prior state. (network-down skips at the syncNow gate by
    // design — see "syncNow connectivity gate" suite — so we use
    // db-unavailable here to exercise the 401 escalation path.)
    const m = await loadFresh();
    m.setConnectivityState('db-unavailable', 'manual-test');
    expect(m.connectivity.state).toBe('db-unavailable');
    const apiFetch = vi.fn(() => fakeStatus(401, { error: 'expired' }));
    await m.syncNow({ apiFetch, trigger: 'sync-now-button' });
    expect(m.connectivity.state).toBe('auth-expired');
  });

  it('network-down does NOT downgrade auth-expired', async () => {
    const m = await loadFresh();
    m.setConnectivityState('auth-expired', 'manual-test');
    m.setConnectivityState('network-down', 'lower-precedence');
    expect(m.connectivity.state).toBe('auth-expired');
  });

  it('successful 200 force-clears any state to ok', async () => {
    const m = await loadFresh();
    m.setConnectivityState('db-unavailable', 'manual-test');
    const apiFetch = vi.fn(() => fakeOk({ acked: [], rejected: [], entities: {} }));
    await m.syncNow({ apiFetch, trigger: 'sync-now-button' });
    expect(m.connectivity.state).toBe('ok');
  });
});

describe('db-unavailable (503 unavailable body) + client-side dedupe', () => {
  it('first call sets lastQueuedAt; rapid follow-ups within retryAfterMs are deduped (queuedRecords becomes empty)', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 50 }, 1));
    const apiFetch = vi.fn(() => fakeStatus(
      503,
      { unavailable: true, reason: 'capacity-exhausted', message: 'paused' },
      { 'Retry-After': '5' }
    ));
    await m.syncNow({ apiFetch, trigger: 'score-submit', currentUserId: 1 });
    expect(m.connectivity.state).toBe('db-unavailable');
    const after1 = m.getL1Records();
    expect(after1[0].lastQueuedAt).not.toBeNull();
    // 4 more rapid triggers — all skipped at dedupe (wire payload empty).
    for (let i = 0; i < 4; i++) {
      await m.syncNow({ apiFetch, trigger: 'sync-now-button', currentUserId: 1 });
    }
    // Each follow-up still calls the server (revalidate map non-empty), but
    // the queuedRecords array is empty due to dedupe.
    const lastCall = apiFetch.mock.calls[apiFetch.mock.calls.length - 1];
    const sent = JSON.parse(lastCall[1].body);
    expect(sent.queuedRecords.length).toBe(0);
  });

  it('cold-start 503 (Retry-After header without unavailable body) → db-unavailable, NOT network-down', async () => {
    // Regression for Copilot R5 #1: previously any 503 without a canonical
    // unavailable body fell into the network-down branch, which flips
    // canSync to false. The cold-start gate ({ error: 'Database not yet
    // initialized', retryAfter: 5 } + Retry-After: 5) doesn't fire an
    // online event to recover, so this could deadlock syncing after a
    // single cold-start hit.
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 50 }, 1));
    const apiFetch = vi.fn(() => fakeStatus(
      503,
      { error: 'Database not yet initialized', retryAfter: 5 },
      { 'Retry-After': '5' }
    ));
    await m.syncNow({ apiFetch, trigger: 'score-submit', currentUserId: 1 });
    expect(m.connectivity.state).toBe('db-unavailable');
    expect(m.connectivity.canSync).toBe(true);
  });

  it('non-retryable 503 (no Retry-After, no body markers) → network-down', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 50 }, 1));
    const apiFetch = vi.fn(() => fakeStatus(503, { error: 'something else' }));
    await m.syncNow({ apiFetch, trigger: 'score-submit', currentUserId: 1 });
    expect(m.connectivity.state).toBe('network-down');
  });
});

describe('sign-out semantics', () => {
  it('clears L2, demotes L1 user_id to null, aborts in-flight', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 1 }, 7));
    m.setL2Entity('profile', { stats: [{ a: 1 }], updatedAt: '2026-01-01T00:00:00Z' });
    expect(m.getL2Entity('profile')).toBeTruthy();
    // Real abort wiring: the fake apiFetch observes opts.signal and rejects
    // with an AbortError when the controller fires, so abortFired now
    // actually proves handleSignOut() invoked controller.abort().
    let abortFired = false;
    const apiFetch = vi.fn((_url, opts = {}) => new Promise((_resolve, reject) => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      if (opts.signal?.aborted) {
        abortFired = true;
        reject(abortError);
        return;
      }
      opts.signal?.addEventListener('abort', () => {
        abortFired = true;
        reject(abortError);
      }, { once: true });
    }));
    void m.syncNow({ apiFetch, trigger: 'sign-in', currentUserId: 7 });
    expect(m._isInFlight()).toBe(true);
    m.handleSignOut();
    // Yield so the abort handler + the rejected-promise catch run.
    await Promise.resolve();
    expect(m._isInFlight()).toBe(false);
    expect(m.getL2Entity('profile')).toBeNull();
    const records = m.getL1Records();
    expect(records.length).toBe(1);
    expect(records[0].user_id).toBeNull();
    expect(abortFired).toBe(true);
  });

  it('clears the L1 rejected bucket on sign-out (no prior-user history leak)', async () => {
    // Regression for Copilot R6 #1: previously gwn_l1_rejected survived
    // sign-out, leaving rejected records (with original user_id) tied to
    // the prior user on a shared device.
    const m = await loadFresh();
    // Seed the rejected bucket directly via localStorage so we don't depend
    // on the ack/reject pipeline.
    localStorage.setItem('gwn_l1_rejected', JSON.stringify([
      { client_game_id: 'rej-1', user_id: 7, score: 50 },
    ]));
    expect(m.getL1Rejected().length).toBe(1);
    m.handleSignOut();
    expect(m.getL1Rejected().length).toBe(0);
    expect(localStorage.getItem('gwn_l1_rejected')).toBeNull();
  });

  it('falls back to clearing L1 records when persisting the demotion fails', async () => {
    // Regression for Copilot R6 #3: previously handleSignOut ignored
    // setL1Records' boolean, so a localStorage failure left records still
    // attributed to the prior user_id.
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 1 }, 7));
    expect(m.getL1Records()[0].user_id).toBe(7);
    const origSet = localStorage.setItem;
    const origRemove = localStorage.removeItem;
    const origWarn = console.warn;
    console.warn = () => {};
    // Make setItem fail (so demotion can't persist) but allow removeItem
    // to succeed (so the privacy-safe fallback can clear the key).
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    m.handleSignOut();
    localStorage.setItem = origSet;
    localStorage.removeItem = origRemove;
    console.warn = origWarn;
    // Privacy guarantee: no L1 record can remain attributed to user 7.
    expect(m.getL1Records().length).toBe(0);
  });
});

describe('claim prompt', () => {
  it('detects unattached and mismatched records', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 1 }, null));   // guest
    m.enqueueRecord(m.buildRecord({ score: 2 }, 99));     // mismatched
    m.enqueueRecord(m.buildRecord({ score: 3 }, 5));      // matched
    const claim = m.findClaimableRecords(5);
    expect(claim.unattached.length).toBe(1);
    expect(claim.mismatched.length).toBe(1);
    const changed = m.applyClaim(5);
    expect(changed).toBe(2);
    for (const r of m.getL1Records()) expect(r.user_id).toBe(5);
  });
});

describe('online/offline event observers do NOT auto-fire sync', () => {
  it('online event clears network-down but does not call apiFetch', async () => {
    const m = await loadFresh();
    const fakeWin = new FakeWindow();
    m.installConnectivityListeners(fakeWin);
    m.setConnectivityState('network-down', 'manual-test');
    const apiFetch = vi.fn(() => fakeOk());
    fakeWin.dispatch('online');
    // No syncNow was called — the online event only flipped state.
    expect(apiFetch).not.toHaveBeenCalled();
    expect(m.connectivity.state).toBe('ok');
  });
});

describe('legacy queue migration', () => {
  it('drains gwn_pending_scores + gwn_score_sync_queue into L1', async () => {
    const m = await loadFresh();
    localStorage.setItem('gwn_pending_scores', JSON.stringify([
      { score: 100, mode: 'freeplay', correctCount: 5, totalRounds: 10, bestStreak: 2 },
    ]));
    localStorage.setItem('gwn_score_sync_queue', JSON.stringify([
      { score: 200, mode: 'daily', correctCount: 8, totalRounds: 10, bestStreak: 4 },
    ]));
    const migrated = m.migrateLegacyQueues();
    expect(migrated).toBe(2);
    expect(localStorage.getItem('gwn_pending_scores')).toBeNull();
    expect(localStorage.getItem('gwn_score_sync_queue')).toBeNull();
    expect(m.getL1Records().length).toBe(2);
    // Per CS52-5: migrated records are unattached (user_id=null) so the
    // claim-prompt flow can attribute them — no silent auto-claim.
    for (const r of m.getL1Records()) expect(r.user_id).toBeNull();
    const claim = m.findClaimableRecords(7);
    expect(claim.unattached.length).toBe(2);
  });
});

describe('batching: large L1 backlog drained across requests', () => {
  it('sends at most MAX_RECORDS_PER_REQUEST (50) per call and schedules a follow-up', async () => {
    const m = await loadFresh();
    for (let i = 0; i < 75; i++) {
      m.enqueueRecord(m.buildRecord({ score: i }, 1));
    }
    expect(m.getL1Records().length).toBe(75);
    const apiFetch = vi.fn((url, opts) => {
      const sent = JSON.parse(opts.body);
      // Ack everything we received so it gets removed from L1.
      return fakeOk({
        acked: sent.queuedRecords.map(r => r.client_game_id),
        rejected: [], entities: {},
      });
    });
    await m.syncNow({ apiFetch, trigger: 'sync-now-button', currentUserId: 1 });
    // Wait for coalesced follow-up
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    // Two calls: first 50, then remaining 25.
    expect(apiFetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(apiFetch.mock.calls[0][1].body);
    const second = JSON.parse(apiFetch.mock.calls[1][1].body);
    expect(first.queuedRecords.length).toBe(50);
    expect(second.queuedRecords.length).toBe(25);
    expect(m.getL1Records().length).toBe(0);
  });

  it('refuses new enqueues when L1 cap is hit (no silent eviction)', async () => {
    const m = await loadFresh();
    for (let i = 0; i < 500; i++) {
      const ok = m.enqueueRecord(m.buildRecord({ score: i }, 1));
      expect(ok).toBe(true);
    }
    expect(m.getL1Records().length).toBe(500);
    // Suppress the warn line for this test
    const orig = console.warn;
    console.warn = () => {};
    const refused = m.enqueueRecord(m.buildRecord({ score: 999 }, 1));
    console.warn = orig;
    expect(refused).toBe(false);
    expect(m.getL1Records().length).toBe(500);
    // Oldest record (score=0) must still be present (no shift).
    expect(m.getL1Records()[0].score).toBe(0);
  });

  it('rolls back the in-memory push when localStorage persist fails', async () => {
    // Regression for Copilot R2 #3: enqueueRecord used to return true even
    // when safeWrite returned false, so callers thought an offline score was
    // saved while it had actually been silently dropped.
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 1 }, 1));
    expect(m.getL1Records().length).toBe(1);
    const origSet = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    const origWarn = console.warn;
    console.warn = () => {};
    const ok = m.enqueueRecord(m.buildRecord({ score: 2 }, 1));
    console.warn = origWarn;
    localStorage.setItem = origSet;
    expect(ok).toBe(false);
    // In-memory state must reflect the rollback so subsequent reads don't lie.
    expect(m.getL1Records().length).toBe(1);
    expect(m.getL1Records()[0].score).toBe(1);
  });
});

describe('syncNow connectivity gate', () => {
  it('skips when state is network-down (canSync is false)', async () => {
    // Regression for Copilot R2 #5: previously the early-return only fired
    // for auth-expired, so network-down still attempted an RPC despite
    // canSync being false.
    const m = await loadFresh();
    m.setConnectivityState('network-down', 'manual-test');
    const apiFetch = vi.fn();
    const result = await m.syncNow({ apiFetch, trigger: 'sync-now-button' });
    expect(result).toEqual({ skipped: 'network-down' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('401 contract: opt out of generic auto-logout', () => {
  it('passes skipAuthHandling:true so apiFetch does not wipe L1/L2', async () => {
    const m = await loadFresh();
    m.setL2Entity('profile', { stats: [], updatedAt: '2026-01-01T00:00:00Z' });
    m.enqueueRecord(m.buildRecord({ score: 1 }, 1));
    const apiFetch = vi.fn((_url, opts) => {
      // Verify the opt-out flag is set on the way in.
      expect(opts.skipAuthHandling).toBe(true);
      return fakeStatus(401, { error: 'expired' });
    });
    await m.syncNow({ apiFetch, trigger: 'sync-now-button', currentUserId: 1 });
    expect(m.connectivity.state).toBe('auth-expired');
    // L2 stays warm; L1 records stay attributed (not demoted by sign-out).
    expect(m.getL2Entity('profile')).toBeTruthy();
    expect(m.getL1Records()[0].user_id).toBe(1);
  });
});

describe('boot-quiet contract: 400 without X-User-Activity is server-side', () => {
  it('client always sends the header — verified per call', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 1 }, 1));
    const apiFetch = vi.fn(() => fakeOk({ acked: [], rejected: [], entities: {} }));
    await m.syncNow({ apiFetch, trigger: 'sync-now-button', currentUserId: 1 });
    const opts = apiFetch.mock.calls[0][1];
    expect(opts.headers['X-User-Activity']).toBe('1');
  });
});


describe('R7 regressions', () => {
  it('coalesced syncNow returns the in-flight result (not null) so callers see success/failure', async () => {
    // Regression for Copilot R7 #1: previously coalesced callers got
    // .then(() => null), so e.g. score-submit indicator could not observe
    // the real outcome of the coalesced sync.
    const m = await loadFresh();
    let resolveFirst;
    const firstPayload = { acked: [], rejected: [], entities: { profile: { x: 1 } } };
    const apiFetch = vi.fn(() => new Promise(r => { resolveFirst = r; }));
    const p1 = m.syncNow({ apiFetch, trigger: 'sync-now-button' });
    const p2 = m.syncNow({ apiFetch, trigger: 'score-submit' }); // coalesced
    resolveFirst({
      status: 200, ok: true,
      headers: { get: () => null },
      json: () => Promise.resolve(firstPayload),
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBeTruthy();
    expect(r1.status).toBe(200);
    // Coalesced caller MUST receive the same outcome (not null).
    expect(r2).toBe(r1);
  });

  it('prunes corrupted L1 records (missing client_game_id) before sending', async () => {
    // Regression for Copilot R7 #2: previously a corrupted L1 row would be
    // sent with client_game_id: undefined, server would reject with
    // client_game_id: null, and the ack/reject pipeline could not match
    // (undefined !== null) -- leaving it stuck in L1 forever.
    const m = await loadFresh();
    // Seed a mix: one valid record, one corrupted (missing client_game_id),
    // one non-object.
    const good = m.buildRecord({ score: 100 }, 1);
    localStorage.setItem('gwn_l1_records', JSON.stringify([
      good,
      { score: 50, user_id: 1 }, // missing client_game_id
      'not-an-object',
    ]));
    expect(m.getL1Records().length).toBe(3);
    const apiFetch = vi.fn(() => fakeOk({ acked: [], rejected: [], entities: {} }));
    await m.syncNow({ apiFetch, trigger: 'sync-now-button', currentUserId: 1 });
    // Wire only carries the valid record.
    const sent = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(sent.queuedRecords.length).toBe(1);
    expect(sent.queuedRecords[0].client_game_id).toBe(good.client_game_id);
    // L1 storage is cleaned (no stuck corrupted rows).
    const remaining = m.getL1Records();
    expect(remaining.length).toBe(1);
    expect(remaining[0].client_game_id).toBe(good.client_game_id);
    // Corrupted rows moved to rejected bucket with local reason.
    const rj = m.getL1Rejected();
    expect(rj.length).toBe(2);
    for (const r of rj) expect(r.rejected_reason).toBe('invalid_local_record');
  });
});

describe('R9 regressions', () => {
  it('handleSignOut tolerates corrupted L1 storage (null / non-object entries)', async () => {
    // Regression for Copilot R9: previously a JSON-valid but corrupted L1
    // array containing a null element would make the spread { ...r } throw,
    // skipping the rest of sign-out cleanup (L2 clear, L1 demotion,
    // in-flight abort) -- a privacy hazard on a shared device.
    const m = await loadFresh();
    const good = m.buildRecord({ score: 1 }, 7);
    localStorage.setItem('gwn_l1_records', JSON.stringify([good, null, 'x']));
    m.setL2Entity('profile', { stats: [], updatedAt: 'now' });
    expect(() => m.handleSignOut()).not.toThrow();
    // L2 was cleared.
    expect(m.getL2Entity('profile')).toBeNull();
    // Only the valid record survives, and it is demoted to guest.
    const remaining = m.getL1Records();
    expect(remaining.length).toBe(1);
    expect(remaining[0].user_id).toBeNull();
    // Connectivity returned to ok.
    expect(m.connectivity.state).toBe('ok');
  });
});