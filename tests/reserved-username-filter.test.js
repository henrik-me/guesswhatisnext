/**
 * Reserved-username-prefix integration tests (CS41-0).
 *
 * Verifies that the `gwn-smoke-` prefix is filtered from every public
 * username-exposing surface even when a row exists in the underlying table
 * (since the registration endpoint refuses to create such a user, we insert
 * directly via the DB adapter).
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');
const bcrypt = require('bcryptjs');

let regularUserId;
let smokeUserId;

async function insertSmokeUser(username = 'gwn-smoke-bot') {
  const db = require('../server/db');
  const adapter = await db.getDbAdapter();
  const hash = bcrypt.hashSync('smokepass123', 10);
  const result = await adapter.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, hash]
  );
  return result.lastId;
}

async function insertScore(userId, score, mode = 'freeplay') {
  const db = require('../server/db');
  const adapter = await db.getDbAdapter();
  await adapter.run(
    `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, mode, score, 10, 10, 5]
  );
}

async function insertCommunityPuzzle(submittedBy, idSuffix) {
  const db = require('../server/db');
  const adapter = await db.getDbAdapter();
  const id = `community-cs41-${idSuffix}`;
  await adapter.run(
    `INSERT INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, submitted_by, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id, 'Nature', 1, 'emoji',
      JSON.stringify(['🌑', '🌒', '🌓']),
      '🌔',
      JSON.stringify(['🌔', '🌕', '🌖', '🌗']),
      'Moon phases',
      submittedBy,
    ]
  );
  return id;
}

beforeAll(async () => {
  await setup();
  const reg = await registerUser('regular-cs41', 'password123');
  regularUserId = reg.user.id;
  smokeUserId = await insertSmokeUser('gwn-smoke-bot');

  // Smoke bot wins every leaderboard; regular user has a smaller score.
  await insertScore(smokeUserId, 9999, 'freeplay');
  await insertScore(regularUserId, 100, 'freeplay');

  // Community puzzles: one from a regular user, one from the smoke bot.
  await insertCommunityPuzzle('regular-author', 'visible');
  await insertCommunityPuzzle('gwn-smoke-bot', 'hidden');
});

afterAll(teardown);

describe("CS41-0: 'gwn-smoke-*' prefix filtered from public surfaces", () => {
  test("POST /api/auth/register rejects 'gwn-smoke-' prefix (case-insensitive)", async () => {
    const lower = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'gwn-smoke-test1', password: 'password123' });
    expect(lower.status).toBe(400);
    expect(lower.body.error).toBe("Username prefix 'gwn-smoke-' is reserved");

    const mixed = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'GWN-Smoke-Test2', password: 'password123' });
    expect(mixed.status).toBe(400);
    expect(mixed.body.error).toBe("Username prefix 'gwn-smoke-' is reserved");
  });

  test('GET /api/scores/leaderboard hides smoke-bot, shows regular user', async () => {
    const res = await getAgent().get('/api/scores/leaderboard?mode=freeplay&period=alltime');
    expect(res.status).toBe(200);
    const usernames = res.body.leaderboard.map((r) => r.username);
    expect(usernames).toContain('regular-cs41');
    expect(usernames).not.toContain('gwn-smoke-bot');
  });

  test('GET /api/scores/leaderboard/multiplayer hides smoke-bot', async () => {
    // Inject a finished match for both users so they show up.
    const db = require('../server/db');
    const adapter = await db.getDbAdapter();
    await adapter.run(
      `INSERT INTO matches (id, room_code, status, total_rounds, max_players, created_by, finished_at)
       VALUES (?, ?, 'finished', 5, 2, ?, CURRENT_TIMESTAMP)`,
      ['match-cs41-1', 'CS410A', regularUserId]
    );
    await adapter.run(
      `INSERT INTO match_players (match_id, user_id, score, finished_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP), (?, ?, ?, CURRENT_TIMESTAMP)`,
      ['match-cs41-1', regularUserId, 50, 'match-cs41-1', smokeUserId, 200]
    );

    const res = await getAgent().get('/api/scores/leaderboard/multiplayer');
    expect(res.status).toBe(200);
    const usernames = res.body.leaderboard.map((r) => r.username);
    expect(usernames).toContain('regular-cs41');
    expect(usernames).not.toContain('gwn-smoke-bot');
  });

  test('GET /api/puzzles/community hides smoke-bot-authored puzzles', async () => {
    const res = await getAgent().get('/api/puzzles/community');
    expect(res.status).toBe(200);
    const ids = res.body.puzzles.map((p) => p.id);
    expect(ids).toContain('community-cs41-visible');
    expect(ids).not.toContain('community-cs41-hidden');
    for (const p of res.body.puzzles) {
      expect(p.submitted_by).not.toMatch(/^gwn-smoke-/i);
    }
  });

  test('GET /api/matches/history hides smoke-bot opponent + GET /api/matches/:id hides smoke-bot players', async () => {
    // Reuse the match injected by the multiplayer-leaderboard test above
    // (regular vs smoke-bot, smoke-bot wins). Get a token for the regular user.
    const login = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'regular-cs41', password: 'password123' });
    const token = login.body.token;
    expect(token).toBeTruthy();

    const history = await getAgent()
      .get('/api/matches/history')
      .set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    // The smoke-bot match must NOT appear in the regular user's history
    // (filtered by `opp_u.username NOT LIKE 'gwn-smoke-%'`).
    const opponents = history.body.history.map((h) => h.opponent);
    expect(opponents).not.toContain('gwn-smoke-bot');

    const detail = await getAgent()
      .get('/api/matches/match-cs41-1')
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    const playerNames = detail.body.players.map((p) => p.username);
    expect(playerNames).toContain('regular-cs41');
    expect(playerNames).not.toContain('gwn-smoke-bot');
  });
});
