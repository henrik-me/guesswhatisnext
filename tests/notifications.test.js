/**
 * Notification API tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';
const ENABLED_SUBMISSIONS_PATH = '/api/submissions?ff_submit_puzzle=1';

let userToken;
let user2Token;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('notifuser1');
  userToken = token;
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
      .set('Authorization', `Bearer ${userToken}`);
    expect(countBefore.body.unread_count).toBeGreaterThan(0);

    const res = await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBeGreaterThanOrEqual(0);

    const countAfter = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`);
    expect(countAfter.body.unread_count).toBe(0);
  });
});

describe('GET /api/notifications/count', () => {
  test('returns 401 without auth', async () => {
    const res = await getAgent().get('/api/notifications/count');
    expect(res.status).toBe(401);
  });

  test('returns correct unread count', async () => {
    // Mark all as read first
    await getAgent()
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userToken}`);

    // Create new notification
    const subId = await createSubmission(userToken);
    await reviewSubmission(subId, 'approved');

    const res = await getAgent()
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(1);
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
