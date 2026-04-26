/**
 * Notification API tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';
const ENABLED_SUBMISSIONS_PATH = '/api/submissions?ff_submit_puzzle=1';

let userToken;
let userId;
let user2Token;

beforeAll(async () => {
  await setup();
  const reg1 = await registerUser('notifuser1');
  userToken = reg1.token;
  userId = reg1.user.id;
  const { token: t2 } = await registerUser('notifuser2');
  user2Token = t2;
});

afterAll(teardown);

/** Helper: create a submission and return its id. */
async function createSubmission(token) {
  const res = await getAgent()
    .post(ENABLED_SUBMISSIONS_PATH)
    .set('Authorization', `Bearer ${token}`)
    .send({
      sequence: ['🌑', '🌒', '🌓'],
      answer: '🌔',
      explanation: 'Moon phases progress from new to full.',
      difficulty: 1,
      category: 'Nature',
    });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  return res.body.id;
}

/** Helper: review a submission. */
async function reviewSubmission(id, status, reviewerNotes) {
  const body = { status };
  if (reviewerNotes !== undefined) body.reviewerNotes = reviewerNotes;
  return getAgent()
    .put(`/api/submissions/${id}/review`)
    .set('X-API-Key', SYSTEM_KEY)
    .send(body);
}

describe('GET /api/notifications', () => {
  test('returns 401 without auth', async () => {
    const res = await getAgent().get('/api/notifications');
    expect(res.status).toBe(401);
  });

  test('returns empty notifications for user with none', async () => {
    const res = await getAgent()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.unread_count).toBe(0);
  });

  test('returns notifications after approval', async () => {
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');

    const res = await getAgent()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications.length).toBeGreaterThanOrEqual(1);

    const notif = res.body.notifications.find(n => n.type === 'submission_approved' && n.data?.submissionId === subId);
    expect(notif).toBeDefined();
    expect(notif.message).toContain('approved');
    expect(notif.message).toContain('🌑');
    expect(notif.read).toBe(false);
  });

  test('respects unread filter', async () => {
    // Create two notifications in a self-contained manner
    const firstSubId = await createSubmission(userToken);
    await reviewSubmission(firstSubId, 'approved');
    const secondSubId = await createSubmission(userToken);
    await reviewSubmission(secondSubId, 'approved');

    const allRes = await getAgent()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    expect(allRes.status).toBe(200);

    const firstNotif = allRes.body.notifications.find(
      n => n.type === 'submission_approved' && n.data?.submissionId === firstSubId
    );
    const secondNotif = allRes.body.notifications.find(
      n => n.type === 'submission_approved' && n.data?.submissionId === secondSubId
    );
    expect(firstNotif).toBeDefined();
    expect(secondNotif).toBeDefined();

    // Mark one as read and assert success
    const markRes = await getAgent()
      .put(`/api/notifications/${firstNotif.id}/read`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(markRes.status).toBe(200);

    // Filter to unread only — marked notification should be absent
    const unreadRes = await getAgent()
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${userToken}`);
    expect(unreadRes.status).toBe(200);
    for (const n of unreadRes.body.notifications) {
      expect(n.read).toBe(false);
    }
    expect(unreadRes.body.notifications.find(n => n.id === firstNotif.id)).toBeUndefined();
    expect(unreadRes.body.notifications.find(n => n.id === secondNotif.id)).toBeDefined();
  });
});

describe('PUT /api/notifications/:id/read', () => {
  test('marks notification as read', async () => {
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'rejected', 'Try again');

    const listRes = await getAgent()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    const notif = listRes.body.notifications.find(n => n.data?.submissionId === subId);
    expect(notif).toBeDefined();

    const res = await getAgent()
      .put(`/api/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(notif.id);
    expect(res.body.read).toBe(true);
  });

  test('rejects other user\'s notification with 403', async () => {
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'rejected');

    const listRes = await getAgent()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    const notif = listRes.body.notifications.find(n => n.data?.submissionId === subId);

    const res = await getAgent()
      .put(`/api/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${user2Token}`);
    expect(res.status).toBe(403);
  });

  test('returns 404 for non-existent notification', async () => {
    const res = await getAgent()
      .put('/api/notifications/99999/read')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/notifications/read-all', () => {
  test('marks all notifications as read', async () => {
    // Ensure we have some unread notifications
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');

    const countBefore = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(countBefore.body.unread_count).toBeGreaterThan(0);

    const res = await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(res.status).toBe(200);
    expect(res.body.updated).toBeGreaterThanOrEqual(0);

    const countAfter = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(countAfter.body.unread_count).toBe(0);
  });
});

describe('GET /api/notifications/count', () => {
  // Ensure spies set up inside individual tests are restored even if an
  // assertion throws (Copilot review finding) — prevents spy leakage across
  // tests in this describe block.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 401 without auth', async () => {
    const res = await getAgent().get('/api/notifications/count');
    expect(res.status).toBe(401);
  });

  test('returns correct unread count (with X-User-Activity)', async () => {
    // Mark all as read first
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');

    // Create new notification
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');

    const res = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(1);
  });

  test('telemetry: emits structured boot-quiet log line per cache outcome', async () => {
    // CS53-23 telemetry gate (INSTRUCTIONS.md § 4a): the route must emit a
    // Pino line with gate="boot-quiet" + cacheOutcome on every request, so
    // the documented KQL query (docs/observability.md § B.7) can observe
    // contract behavior in App Insights via ContainerAppConsoleLogs_CL.
    const { unreadCountCache } = require('../server/services/unread-count-cache');
    const logger = require('../server/logger');
    unreadCountCache.clear();

    const infoSpy = vi.spyOn(logger, 'info');

    // 1. MISS-NO-ACTIVITY (cold cache, no header, non-system caller)
    await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`);
    // 2. HIT (seed cache then re-read without header)
    unreadCountCache.set(userId, 4);
    await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`);

    const calls = infoSpy.mock.calls.filter(c => c[0] && c[0].gate === 'boot-quiet');
    expect(calls.length).toBeGreaterThanOrEqual(2);

    const outcomes = calls.map(c => c[0].cacheOutcome);
    expect(outcomes).toContain('MISS-NO-ACTIVITY');
    expect(outcomes).toContain('HIT');

    // Each line must carry the fields the KQL query in observability.md uses.
    for (const c of calls) {
      expect(c[0]).toMatchObject({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        userId: expect.any(Number),
        userActivity: expect.any(Boolean),
        isSystem: expect.any(Boolean),
      });
      expect(typeof c[0].cacheOutcome).toBe('string');
    }
  });

  test('boot-quiet: no X-User-Activity + cache miss → returns 0 and does NOT touch DB', async () => {
    // Scope: this test asserts the route-level guarantee — once the request
    // reaches the handler (DB already initialized, requireAuth passed),
    // header-less /count traffic does not call db.get/all/run. The pre-route
    // cold-start init gate at server/app.js:258-280 is NOT exercised here;
    // gating that path on X-User-Activity is CS53-19.D's scope, with a
    // dedicated cold-start test once that lands.
    const { unreadCountCache } = require('../server/services/unread-count-cache');
    const { getDbAdapter } = require('../server/db');
    unreadCountCache.clear();

    const db = await getDbAdapter();
    // Spy on every read/write entrypoint so a future regression that switches
    // the route to db.all / db.run can't slip past silently.
    const getSpy = vi.spyOn(db, 'get');
    const allSpy = vi.spyOn(db, 'all');
    const runSpy = vi.spyOn(db, 'run');

    const res = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(0);
    expect(res.headers['x-cache']).toBe('MISS-NO-ACTIVITY');
    expect(getSpy).not.toHaveBeenCalled();
    expect(allSpy).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  });

  test('boot-quiet: no X-User-Activity + cache hit → returns cached value, no DB', async () => {
    const { unreadCountCache } = require('../server/services/unread-count-cache');
    const { getDbAdapter } = require('../server/db');
    unreadCountCache.clear();
    unreadCountCache.set(userId, 7);

    const db = await getDbAdapter();
    const getSpy = vi.spyOn(db, 'get');
    const allSpy = vi.spyOn(db, 'all');
    const runSpy = vi.spyOn(db, 'run');

    const res = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(7);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(getSpy).not.toHaveBeenCalled();
    expect(allSpy).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();
  
  });

  test('boot-quiet bypass: system-key auth + cache miss → DB read allowed (no header needed)', async () => {
    // INSTRUCTIONS.md § Database & Data: the boot-quiet contract does NOT
    // apply to operator/system-key requests. CS53-23 R4 finding.
    const { unreadCountCache } = require('../server/services/unread-count-cache');
    const { getDbAdapter } = require('../server/db');
    unreadCountCache.clear();

    const db = await getDbAdapter();
    const getSpy = vi.spyOn(db, 'get');

    const res = await getAgent()
      .get('/api/notifications/count')
      .set('X-API-Key', SYSTEM_KEY); // no X-User-Activity header
    expect(res.status).toBe(200);
    // System user (id=0) has no notifications in the seed, so count is 0,
    // but the key assertion is that we DID hit the DB on cache miss.
    expect(res.headers['x-cache']).toBe('MISS');
    expect(getSpy).toHaveBeenCalled();
    expect(typeof res.body.unread_count).toBe('number');
  });

  test('with X-User-Activity: 1 + cache miss → exactly one DB query and seeds cache', async () => {
    const { unreadCountCache } = require('../server/services/unread-count-cache');
    const { getDbAdapter } = require('../server/db');
    unreadCountCache.clear();

    // Make sure there is one unread to count (note: review path also uses db.get internally)
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');

    unreadCountCache.invalidate(userId);
    const db = await getDbAdapter();
    const spy = vi.spyOn(db, 'get');
    spy.mockClear();

    const r1 = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(r1.status).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');
    expect(r1.body.unread_count).toBeGreaterThanOrEqual(1);
    // The /count endpoint issues exactly one db.get for the COUNT(*) query.
    const countCalls = spy.mock.calls.filter(args => /COUNT\(\*\)\s+AS\s+count\s+FROM\s+notifications/i.test(args[0])).length;
    expect(countCalls).toBe(1);

    // Second call: served from cache, no DB.
    spy.mockClear();
    const r2 = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(r2.headers['x-cache']).toBe('HIT');
    expect(spy).not.toHaveBeenCalled();
  });

  test('caches result so repeated user-activity polls do not hit DB', async () => {
    const { unreadCountCache } = require('../server/services/unread-count-cache');
    unreadCountCache.clear();

    // Mark all as read so count is deterministic
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');

    // Create one notification → invalidates cache
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');

    const before = unreadCountCache.snapshot();

    // First call: cache miss → DB hit (header present allows it)
    const r1 = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(r1.status).toBe(200);
    expect(r1.headers['x-cache']).toBe('MISS');
    expect(r1.body.unread_count).toBe(1);

    // 5 more calls: all cache hits → no DB
    for (let i = 0; i < 5; i++) {
      const r = await getAgent()
        .get('/api/notifications/count')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-User-Activity', '1');
      expect(r.status).toBe(200);
      expect(r.headers['x-cache']).toBe('HIT');
      expect(r.body.unread_count).toBe(1);
    }

    const after = unreadCountCache.snapshot();
    expect(after.misses - before.misses).toBe(1);
    expect(after.hits - before.hits).toBe(5);
  });

  test('write paths invalidate cache (mark-read, mark-all-read, new notification)', async () => {
    const { unreadCountCache } = require('../server/services/unread-count-cache');

    // Seed cache by hitting count
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');

    // New notification should invalidate
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');
    const r1 = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(r1.headers['x-cache']).toBe('MISS');
    expect(r1.body.unread_count).toBeGreaterThanOrEqual(1);

    // Cache is now warm; mark-all-read INVALIDATES (not set-0) to avoid
    // overwriting a concurrent invalidate from createReviewNotification.
    // The next user-activity read recomputes from DB.
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    const r2 = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(r2.headers['x-cache']).toBe('MISS');
    expect(r2.body.unread_count).toBe(0);

    // mark-single-read: create + read one, expect cache invalidated
    const subId2 = await createSubmission(userToken);
    await reviewSubmission(subId2, 'approved');
    const list = await getAgent()
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    const id = list.body.notifications[0].id;
    // Warm cache before mark-read
    await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    await getAgent()
      .put(`/api/notifications/${id}/read`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    const r3 = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-User-Activity', '1');
    expect(r3.headers['x-cache']).toBe('MISS');
    unreadCountCache.clear();
  });
});

describe('Review → Notification creation', () => {
  test('approve creates submission_approved notification', async () => {
    // Mark all as read first
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);

    const subId = await createSubmission(userToken);
    const reviewRes = await reviewSubmission(subId, 'approved');
    expect(reviewRes.status).toBe(200);

    const notifRes = await getAgent()
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${userToken}`);
    const notif = notifRes.body.notifications.find(n => n.data?.submissionId === subId);
    expect(notif).toBeDefined();
    expect(notif.type).toBe('submission_approved');
    expect(notif.message).toContain('approved');
    expect(notif.message).toContain('Community Gallery');
  });

  test('reject creates submission_rejected notification with reviewer notes', async () => {
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);

    const subId = await createSubmission(userToken);
    const reviewRes = await reviewSubmission(subId, 'rejected', 'Not creative enough');
    expect(reviewRes.status).toBe(200);

    const notifRes = await getAgent()
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${userToken}`);
    const notif = notifRes.body.notifications.find(n => n.data?.submissionId === subId);
    expect(notif).toBeDefined();
    expect(notif.type).toBe('submission_rejected');
    expect(notif.message).toContain('not approved');
    expect(notif.message).toContain('Not creative enough');
  });

  test('bulk review creates one notification per submission', async () => {
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);

    const id1 = await createSubmission(userToken);
    const id2 = await createSubmission(userToken);

    const bulkRes = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ ids: [id1, id2], status: 'approved' });
    expect(bulkRes.status).toBe(200);

    const notifRes = await getAgent()
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${userToken}`);

    const notifs = notifRes.body.notifications.filter(
      n => n.data && (n.data.submissionId === id1 || n.data.submissionId === id2)
    );
    expect(notifs.length).toBe(2);
  });

  test('review endpoint succeeds and creates notification', async () => {
    const subId = await createSubmission(userToken);
    const reviewRes = await reviewSubmission(subId, 'approved');
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe('approved');

    // Verify notification was also created
    const notifRes = await getAgent()
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    const notif = notifRes.body.notifications.find(n => n.data?.submissionId === subId);
    expect(notif).toBeDefined();
    expect(notif.type).toBe('submission_approved');
  });
});
