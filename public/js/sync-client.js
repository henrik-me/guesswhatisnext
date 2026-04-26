/**
 * CS52-5 — Unified offline sync client (L1 + L2 cache + connectivity state).
 *
 * Replaces the two pre-CS52 client queues:
 *   - `gwn_pending_scores`     (app.js)
 *   - `gwn_score_sync_queue`   (progressive-loader.js)
 *
 * Spec: project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Identity & client sync model
 *   § Decision #5 (immutable record + payload-hash conflict)
 *   § POST /api/sync contract
 *   § Sign-out semantics
 *
 * Design notes:
 *   - L1 holds immutable score records. Records carry `lastQueuedAt` (set on
 *     202 from server). A separate `gwn_l1_rejected` bucket holds records
 *     the server returned with `reason: conflict_with_existing`.
 *   - L2 holds bounded read caches per entity, each with `lastUpdatedAt`.
 *   - Sync triggers are STRICTLY user-action driven. No timers; no
 *     `online`-event auto-fire. The `online` event is observed only to flip
 *     state out of `network-down` so the next gesture can fire a sync.
 *   - Single-flight: at most one /api/sync RPC in flight. New triggers during
 *     a flight set a "needs another pass" flag → exactly one coalesced
 *     follow-up after the in-flight call completes.
 *   - Connectivity precedence (deterministic):
 *         auth-expired > network-down > db-unavailable > ok
 *
 * The 202 path (`db-unavailable`) is implemented in this client as if the
 * server already returned 202. CS52-7e wires the server-side per-request
 * file queue. Until then the server returns a 503 with `unavailable: true`
 * when the DB is genuinely unavailable; this client treats either as
 * `db-unavailable` for state-transition purposes (records stay in L1 with
 * `lastQueuedAt` set so client-side dedupe still applies).
 */

// ──────────────────────────────────────────────────────────────────
// Storage keys
// ──────────────────────────────────────────────────────────────────

export const L1_RECORDS_KEY = 'gwn_l1_records';
export const L1_REJECTED_KEY = 'gwn_l1_rejected';
export const L2_KEYS = {
  profile: 'gwn_l2_profile',
  history: 'gwn_l2_history',
  achievements: 'gwn_l2_achievements',
  notifications: 'gwn_l2_notifications',
  'leaderboard:freeplay:ranked':  'gwn_l2_lb_freeplay_ranked',
  'leaderboard:freeplay:offline': 'gwn_l2_lb_freeplay_offline',
  'leaderboard:daily:ranked':     'gwn_l2_lb_daily_ranked',
  'leaderboard:daily:offline':    'gwn_l2_lb_daily_offline',
};

const L2_BOUNDS = {
  profile: 1,
  history: 50,
  achievements: 100,
  notifications: 20,
  'leaderboard:freeplay:ranked': 100,
  'leaderboard:freeplay:offline': 100,
  'leaderboard:daily:ranked': 100,
  'leaderboard:daily:offline': 100,
};

const SCHEMA_VERSION = 1;
// L1 capacity is intentionally large: per CS52-5 § Decision #5 we MUST
// NOT drop unsynced records (offline play could legitimately produce
// many games before connectivity returns). The cap exists only as a
// localStorage-quota safety net; if it is ever hit, new enqueues are
// refused rather than evicting older pending writes.
const MAX_L1_RECORDS = 500;
// Per-request wire cap matches server MAX_QUEUED_RECORDS (= 50). Larger
// L1 backlogs are drained across successive sync triggers (each ack
// clears the sent batch; the coalesced follow-up + future user gestures
// pull the next batch).
const MAX_RECORDS_PER_REQUEST = 50;
const MAX_REJECTED = 50;

// ──────────────────────────────────────────────────────────────────
// Connectivity state machine
// ──────────────────────────────────────────────────────────────────

const STATES = ['ok', 'db-unavailable', 'network-down', 'auth-expired'];
const PRECEDENCE = { ok: 0, 'db-unavailable': 1, 'network-down': 2, 'auth-expired': 3 };

export const connectivity = {
  state: 'ok',
  retryAfterMs: 0,
  /** @returns {boolean} */
  get canRank() { return this.state === 'ok'; },
  /** @returns {boolean} */
  get canSync() { return this.state === 'ok' || this.state === 'db-unavailable'; },
};

const stateListeners = new Set();

/**
 * Transition the state machine. Higher-precedence states cannot be
 * downgraded by a lower-precedence signal in the same transition pass —
 * only an explicit successful sync (200) clears auth-expired/network-down
 * back to `ok`. The trigger string is logged for telemetry.
 *
 * Pass `force: true` to bypass precedence (used by successful 200 RPC and
 * by sign-out reset).
 */
export function setConnectivityState(next, trigger, { force = false } = {}) {
  if (!STATES.includes(next)) return;
  const prev = connectivity.state;
  if (!force && PRECEDENCE[next] < PRECEDENCE[prev]) {
    // Lower-precedence signal cannot downgrade an active higher one.
    return;
  }
  if (prev === next) return;
  connectivity.state = next;
  // Structured client telemetry (forwarded server-side via CS54 telemetry).
  try {
    /* istanbul ignore next */
    if (typeof console !== 'undefined' && console.info) {
      console.info('[sync] connectivity_state_transition', { from: prev, to: next, trigger });
    }
  } catch { /* ignore */ }
  for (const fn of stateListeners) {
    try { fn(connectivity.state, prev, trigger); } catch { /* swallow */ }
  }
}

export function onConnectivityChange(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

// ──────────────────────────────────────────────────────────────────
// L1 helpers (score-submission queue)
// ──────────────────────────────────────────────────────────────────

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return fallback;
  }
}

function safeWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function getL1Records() {
  const v = safeRead(L1_RECORDS_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function getL1Rejected() {
  const v = safeRead(L1_REJECTED_KEY, []);
  return Array.isArray(v) ? v : [];
}

function setL1Records(records) {
  if (records.length === 0) { safeRemove(L1_RECORDS_KEY); return true; }
  return safeWrite(L1_RECORDS_KEY, records);
}

function setL1Rejected(rejected) {
  while (rejected.length > MAX_REJECTED) rejected.shift();
  if (rejected.length === 0) safeRemove(L1_REJECTED_KEY);
  else safeWrite(L1_REJECTED_KEY, rejected);
}

/**
 * Prune corrupted L1 entries (non-object or missing/empty client_game_id)
 * from storage before they are sent on the wire. Without this, a corrupted
 * row would be sent with `client_game_id: undefined`, get rejected by the
 * server as `client_game_id: null`, and the client-side ack/reject pipeline
 * would not be able to match it (undefined !== null) — leaving it stuck in
 * L1 and retried on every sync forever. We move pruned rows into the
 * rejected bucket with a local reason so they remain inspectable but do
 * not block sync. Returns the cleaned, valid records.
 */
function pruneInvalidL1Records() {
  const all = getL1Records();
  const valid = [];
  const invalid = [];
  for (const r of all) {
    if (r && typeof r === 'object' && typeof r.client_game_id === 'string' && r.client_game_id.length > 0) {
      valid.push(r);
    } else {
      invalid.push(r);
    }
  }
  if (invalid.length === 0) return valid;
  const rj = getL1Rejected();
  for (const bad of invalid) {
    rj.push({
      ...(bad && typeof bad === 'object' ? bad : { raw: bad }),
      rejected_reason: 'invalid_local_record',
      rejected_at: new Date().toISOString(),
    });
  }
  setL1Rejected(rj);
  setL1Records(valid);
  return valid;
}

/** Generate a stable unique client_game_id (UUID-ish, no crypto dep). */
export function generateClientGameId() {
  // RFC4122 v4-style without requiring crypto.randomUUID (older browsers).
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `cg-${Date.now().toString(36)}-${r()}${r()}-${r()}${r()}`;
}

/**
 * Build the immutable record from a game summary.
 * Caller passes `userId` (or null for guest).
 */
export function buildRecord(summary, userId) {
  const fastestAnswerMs = (summary.results || [])
    .filter(r => r.correct)
    .reduce((min, r) => Math.min(min, r.timeMs), Infinity);
  return {
    client_game_id: summary.client_game_id || generateClientGameId(),
    user_id: userId == null ? null : userId,
    mode: summary.mode || 'freeplay',
    variant: summary.variant || summary.mode || 'freeplay',
    score: Math.trunc(Number(summary.score)) || 0,
    correct_count: Math.trunc(Number(summary.correctCount)) || 0,
    total_rounds: Math.trunc(Number(summary.totalRounds)) || 0,
    best_streak: Math.trunc(Number(summary.bestStreak)) || 0,
    fastest_answer_ms: fastestAnswerMs === Infinity ? null : fastestAnswerMs,
    completed_at: summary.completed_at || new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    lastQueuedAt: null,
  };
}

/** Append a record to L1. */
export function enqueueRecord(record) {
  const records = getL1Records();
  // Idempotency: if the same client_game_id is already in L1, don't dup.
  if (records.some(r => r.client_game_id === record.client_game_id)) return false;
  if (records.length >= MAX_L1_RECORDS) {
    // Quota safety net: refuse new enqueues rather than evicting older
    // pending writes. In practice this is unreachable for normal play.
    if (typeof console !== 'undefined') {
      console.warn(`[sync] L1 cap hit (${MAX_L1_RECORDS}); refusing enqueue of ${record.client_game_id}`);
    }
    return false;
  }
  records.push(record);
  if (!setL1Records(records)) {
    // localStorage write failed (quota / serialization). Roll back the
    // in-memory push so getL1Records() doesn't lie to callers, and signal
    // the failure so submitGameOver can show the cache-full indicator.
    records.pop();
    if (typeof console !== 'undefined') {
      console.warn(`[sync] L1 persist failed for ${record.client_game_id}; refusing enqueue`);
    }
    return false;
  }
  return true;
}

/**
 * One-time migration: drain the two legacy localStorage queues into L1.
 * Safe to call repeatedly — a no-op once the legacy keys are gone.
 *
 * Migrated records are inserted with `user_id: null` regardless of the
 * currently signed-in user. The legacy queues had no per-record identity
 * binding, so silently auto-attributing them would bypass the CS52-5
 * claim-prompt flow (§ Sign-out / claim semantics). The next call to
 * `findClaimableRecords(currentUserId)` will surface them as
 * `unattached`, and `applyClaim(currentUserId)` re-attributes them only
 * after the user explicitly acknowledges the prompt.
 */
export function migrateLegacyQueues() {
  const legacyKeys = ['gwn_pending_scores', 'gwn_score_sync_queue'];
  let migrated = 0;
  for (const k of legacyKeys) {
    const items = safeRead(k, []);
    if (!Array.isArray(items) || items.length === 0) {
      if (items != null) safeRemove(k);
      continue;
    }
    // Track items we couldn't migrate (L1 cap reached or persist failed)
    // so we can rewrite the legacy key with the remainder. Removing the
    // key while items are still pending would silently drop scores —
    // the same no-silent-drop guarantee enqueueRecord enforces.
    const unmigrated = [];
    for (const item of items) {
      const enqueued = enqueueRecord(buildRecord({
        score: item.score,
        mode: item.mode || 'freeplay',
        correctCount: item.correctCount,
        totalRounds: item.totalRounds,
        bestStreak: item.bestStreak,
        results: [],
      }, null));
      if (enqueued) {
        migrated++;
      } else {
        unmigrated.push(item);
      }
    }
    if (unmigrated.length === 0) {
      safeRemove(k);
    } else {
      // Best-effort: rewrite the legacy key with what we couldn't drain.
      // If THAT write also fails (storage quota exhausted), we leave the
      // original payload untouched — better duplicates than silent loss.
      safeWrite(k, unmigrated);
    }
  }
  return migrated;
}

// ──────────────────────────────────────────────────────────────────
// L2 helpers (read cache)
// ──────────────────────────────────────────────────────────────────

export function getL2Entity(name) {
  const k = L2_KEYS[name];
  if (!k) return null;
  return safeRead(k, null);
}

export function setL2Entity(name, payload) {
  const k = L2_KEYS[name];
  if (!k) return;
  const bound = L2_BOUNDS[name];
  const value = { ...payload, lastUpdatedAt: payload.updatedAt || new Date().toISOString() };
  // Bound list payloads.
  if (Array.isArray(value.rows) && bound > 1) value.rows = value.rows.slice(0, bound);
  safeWrite(k, value);
}

export function clearL2() {
  for (const k of Object.values(L2_KEYS)) safeRemove(k);
}

// ──────────────────────────────────────────────────────────────────
// Sign-out semantics
// ──────────────────────────────────────────────────────────────────

/**
 * Sign-out: clear L2 entirely; demote L1 user_id → null; clear L1 rejected
 * bucket; abort in-flight.
 *
 * Pending L1 records are NOT deleted — they become guest records and
 * re-surface in the claim prompt on next sign-in (privacy-vs-data-loss
 * tradeoff documented in CS52 § Sign-out semantics). The L1 *rejected*
 * bucket is fully cleared because it carries the original (pre-rejection)
 * record data including the prior user_id; preserving it across sign-out
 * on a shared device would leak history.
 */
export function handleSignOut() {
  clearL2();
  safeRemove(L1_REJECTED_KEY);
  const records = getL1Records().map(r => ({ ...r, user_id: null, lastQueuedAt: null }));
  const demotionPersisted = setL1Records(records);
  if (!demotionPersisted) {
    // Privacy-safe fallback: if we can't persist the demotion, remove the
    // L1 records entirely rather than leaving them attributed to the
    // signed-out user in storage. Better data loss than identity leak.
    safeRemove(L1_RECORDS_KEY);
    if (typeof console !== 'undefined') {
      console.warn('[sync] failed to persist L1 sign-out demotion; cleared local sync storage as fallback');
    }
  }
  // Abort any in-flight sync. The response (if any) is dropped by the
  // single-flight guard's signal check.
  if (inFlight && inFlight.controller) {
    try { inFlight.controller.abort(); } catch { /* ignore */ }
  }
  inFlight = null;
  pendingFollowup = false;
  setConnectivityState('ok', 'sign-out', { force: true });
}

// ──────────────────────────────────────────────────────────────────
// Claim prompt (sign-in)
// ──────────────────────────────────────────────────────────────────

/**
 * Inspect L1 for records that need to be claimed by `currentUserId`.
 * Returns { unattached: Record[], mismatched: Record[] }.
 */
export function findClaimableRecords(currentUserId) {
  const records = getL1Records();
  const unattached = records.filter(r => r.user_id == null);
  const mismatched = records.filter(r => r.user_id != null && r.user_id !== currentUserId);
  return { unattached, mismatched };
}

/**
 * Apply a positive claim: re-attribute unattached + mismatched records to
 * `currentUserId`. No server call here — the next sync includes them.
 */
export function applyClaim(currentUserId) {
  const records = getL1Records();
  let changed = 0;
  for (const r of records) {
    if (r.user_id !== currentUserId) {
      r.user_id = currentUserId;
      r.lastQueuedAt = null; // re-queue on next sync
      changed++;
    }
  }
  setL1Records(records);
  return changed;
}

// ──────────────────────────────────────────────────────────────────
// Single-flight sync
// ──────────────────────────────────────────────────────────────────

let inFlight = null;
let pendingFollowup = false;
let l2Cursors = {}; // server cursor per revalidate key

/** All entities the L2 cache knows about, in revalidate-key form. */
const REVALIDATE_KEYS = [
  'leaderboard:freeplay:ranked',
  'leaderboard:freeplay:offline',
  'leaderboard:daily:ranked',
  'leaderboard:daily:offline',
  'profile',
  'achievements',
  'notifications',
];

function buildRevalidateMap(keys) {
  const out = {};
  for (const k of keys) {
    out[k] = { since: l2Cursors[k] || null };
  }
  return out;
}

/**
 * Trigger a sync. Gesture-driven. Returns a Promise that resolves when the
 * primary sync RPC completes. A coalesced follow-up (if a trigger fired
 * while this sync was in flight) runs in the background and is NOT awaited
 * by this promise — that pass is bounded by user gestures, not by this
 * call's lifetime.
 *
 * @param {object} opts
 * @param {Function} opts.apiFetch - the app's apiFetch wrapper (auth-aware)
 * @param {string} opts.trigger - one of 'sign-in' | 'score-submit' | 'navigation'
 *                                | 'sync-now-button' | 'connectivity-restored'
 * @param {string[]} [opts.revalidateKeys] - subset of REVALIDATE_KEYS
 * @param {number} [opts.currentUserId] - for client-side filter when signed-in
 */
export async function syncNow({ apiFetch, trigger, revalidateKeys = REVALIDATE_KEYS, currentUserId = null }) {
  if (!connectivity.canSync) {
    // Skip both auth-expired and network-down — neither will succeed and
    // we don't want to drain offline gestures into doomed RPCs.
    return { skipped: connectivity.state };
  }

  if (inFlight) {
    pendingFollowup = true;
    // Coalesce: hand the same in-flight result back so the second caller
    // (e.g. score-submit indicator) can observe success/failure too.
    return inFlight.promise;
  }

  const controller = new AbortController();
  const promise = doSync({ apiFetch, trigger, revalidateKeys, currentUserId, signal: controller.signal });
  inFlight = { controller, promise };

  try {
    const result = await promise;
    return result;
  } finally {
    inFlight = null;
    if (pendingFollowup) {
      pendingFollowup = false;
      // Fire one coalesced follow-up; do NOT chain another follow-up.
      // (Triggers during this second pass set the flag again, allowing
      // a third pass — bounded by user gestures, not unbounded loop.)
      void syncNow({ apiFetch, trigger: 'coalesced-followup', revalidateKeys, currentUserId });
    }
  }
}

async function doSync({ apiFetch, trigger, revalidateKeys, currentUserId, signal }) {
  const allRecords = pruneInvalidL1Records();

  // Filter: only records belonging to the current user (or guest records
  // when signed-out) get included on the wire.
  let candidates = currentUserId != null
    ? allRecords.filter(r => r.user_id === currentUserId)
    : allRecords.filter(r => r.user_id == null);

  // CS52-5 § client-side dedupe in db-unavailable: while in db-unavailable,
  // skip records whose lastQueuedAt is younger than retryAfterMs.
  if (connectivity.state === 'db-unavailable' && connectivity.retryAfterMs > 0) {
    const cutoff = Date.now() - connectivity.retryAfterMs;
    candidates = candidates.filter(r => r.lastQueuedAt == null || r.lastQueuedAt < cutoff);
  }

  // Per-request wire cap. Larger backlogs are drained across successive
  // sync triggers (each ack removes the sent batch from L1; the
  // coalesced follow-up below pulls the next batch automatically).
  if (candidates.length > MAX_RECORDS_PER_REQUEST) {
    candidates = candidates.slice(0, MAX_RECORDS_PER_REQUEST);
    pendingFollowup = true; // ensure remaining records get drained
  }

  const queuedRecords = candidates.map(r => ({
    client_game_id: r.client_game_id,
    mode: r.mode,
    variant: r.variant,
    score: r.score,
    correct_count: r.correct_count,
    total_rounds: r.total_rounds,
    best_streak: r.best_streak,
    fastest_answer_ms: r.fastest_answer_ms,
    completed_at: r.completed_at,
    schema_version: r.schema_version,
  }));

  const body = {
    queuedRecords,
    revalidate: buildRevalidateMap(revalidateKeys),
  };

  let res;
  try {
    res = await apiFetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Activity': '1' },
      body: JSON.stringify(body),
      signal,
      // CS52-5: a 401 here transitions our local connectivity state to
      // `auth-expired` (records stay in L1, L2 stays warm). It MUST NOT
      // trigger the generic auto-logout path in apiFetch — that would
      // wipe L2 and demote L1, defeating the resume-after-reauth flow.
      skipAuthHandling: true,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { aborted: true, trigger };
    }
    setConnectivityState('network-down', `network-error:${trigger}`);
    return { error: 'network', trigger };
  }

  if (signal && signal.aborted) return { aborted: true, trigger };

  if (res.status === 401) {
    setConnectivityState('auth-expired', `401:${trigger}`);
    return { status: 401, trigger };
  }

  if (res.status === 503) {
    // Treat 503 as transient/db-unavailable when there's any signal that
    // a future retry could succeed (canonical CS52-5 unavailable body OR a
    // Retry-After header OR a body retryAfter / phase:'cold-start' marker
    // from the cold-start gate). Going to network-down here would flip
    // canSync to false and effectively deadlock syncing — the cold-start
    // gate doesn't fire an `online` event to recover from. Keep
    // network-down for true non-retryable / generic 503s only.
    let body503 = null;
    try { body503 = await res.json(); } catch { /* ignore */ }
    const retryAfterHeader = Number(res.headers.get && res.headers.get('Retry-After')) * 1000;
    const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 5000;
    const isRetryable = !!(
      (body503 && (body503.unavailable || body503.retryAfter != null || body503.phase === 'cold-start')) ||
      (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0)
    );
    if (isRetryable) {
      const now = Date.now();
      const records = getL1Records();
      for (const r of records) {
        if (queuedRecords.some(q => q.client_game_id === r.client_game_id)) {
          r.lastQueuedAt = now;
        }
      }
      setL1Records(records);
      connectivity.retryAfterMs = retryAfterMs;
      setConnectivityState('db-unavailable', `503:${trigger}`);
      return { status: 503, queuedCount: queuedRecords.length };
    }
    // Genuinely non-retryable 503 (no body markers, no Retry-After) —
    // fall back to network-down so the next online event resets state.
    setConnectivityState('network-down', `503-other:${trigger}`);
    return { status: 503, trigger };
  }

  if (res.status === 202) {
    let body202 = null;
    try { body202 = await res.json(); } catch { /* ignore */ }
    const retryAfterMs = (body202 && Number(body202.retryAfterMs)) || 5000;
    const now = Date.now();
    const records = getL1Records();
    for (const r of records) {
      if (queuedRecords.some(q => q.client_game_id === r.client_game_id)) {
        r.lastQueuedAt = now;
      }
    }
    setL1Records(records);
    connectivity.retryAfterMs = retryAfterMs;
    setConnectivityState('db-unavailable', `202:${trigger}`);
    return { status: 202, queuedRequestIds: (body202 && body202.queuedRequestIds) || [] };
  }

  if (!res.ok) {
    setConnectivityState('network-down', `http-${res.status}:${trigger}`);
    return { status: res.status, trigger };
  }

  let payload;
  try { payload = await res.json(); } catch { payload = {}; }

  // 200 → process acked / rejected / entities.
  const ackedSet = new Set(payload.acked || []);
  const rejectedById = new Map((payload.rejected || []).map(r => [r.client_game_id, r]));

  const remaining = [];
  for (const r of getL1Records()) {
    if (ackedSet.has(r.client_game_id)) continue;
    if (rejectedById.has(r.client_game_id)) {
      const rj = getL1Rejected();
      rj.push({ ...r, rejected_reason: rejectedById.get(r.client_game_id).reason, rejected_at: new Date().toISOString() });
      setL1Rejected(rj);
      continue;
    }
    remaining.push(r);
  }
  setL1Records(remaining);

  for (const [k, ent] of Object.entries(payload.entities || {})) {
    if (!L2_KEYS[k]) continue;
    setL2Entity(k, ent);
    if (ent.cursor) l2Cursors[k] = ent.cursor;
  }

  // Successful 200 — clear retry/db-unavailable state.
  connectivity.retryAfterMs = 0;
  setConnectivityState('ok', `200:${trigger}`, { force: true });

  return {
    status: 200,
    acked: payload.acked || [],
    rejected: payload.rejected || [],
    entityKeys: Object.keys(payload.entities || {}),
  };
}

// ──────────────────────────────────────────────────────────────────
// Online-event observer (does NOT auto-fire sync)
// ──────────────────────────────────────────────────────────────────

let onlineHandler = null;

/**
 * Wire `online` / `offline` listeners. The `online` event ONLY arms the
 * state machine — it does not fire a sync (boot-quiet contract).
 * The next user gesture is what triggers the actual sync.
 */
export function installConnectivityListeners(target = (typeof window !== 'undefined' ? window : null)) {
  if (!target || onlineHandler) return;
  onlineHandler = () => {
    if (connectivity.state === 'network-down') {
      // Demote network-down so the next gesture can transition us back to
      // ok via a successful sync. Use force=true because we're DOWNGRADING
      // priority — that's the intent of an `online` event.
      setConnectivityState('ok', 'online-event', { force: true });
    }
  };
  const offlineHandler = () => setConnectivityState('network-down', 'offline-event');
  target.addEventListener('online', onlineHandler);
  target.addEventListener('offline', offlineHandler);
}

// ──────────────────────────────────────────────────────────────────
// Test-only resets
// ──────────────────────────────────────────────────────────────────

/** @internal — only for unit tests. */
export function _resetSyncClientForTests() {
  inFlight = null;
  pendingFollowup = false;
  l2Cursors = {};
  connectivity.state = 'ok';
  connectivity.retryAfterMs = 0;
  stateListeners.clear();
  onlineHandler = null;
  for (const k of [L1_RECORDS_KEY, L1_REJECTED_KEY, ...Object.values(L2_KEYS),
    'gwn_pending_scores', 'gwn_score_sync_queue']) {
    safeRemove(k);
  }
}

/** @internal */
export function _isInFlight() { return inFlight != null; }
/** @internal */
export function _hasPendingFollowup() { return pendingFollowup; }
