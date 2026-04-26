/**
 * E2E tests — Single Player flow.
 * Tests: register → get puzzles → simulate game → submit score → check leaderboard.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('sp_player', 'password123');
  userToken = token;
});

afterAll(teardown);

describe('Single Player E2E', () => {
  test('full free play flow: puzzles → score → leaderboard → achievements', async () => {
    const agent = getAgent();

    // 1. Fetch puzzles
    const puzzleRes = await agent
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);
    expect(puzzleRes.status).toBe(200);
    expect(puzzleRes.body.length).toBeGreaterThan(0);
    const puzzle = puzzleRes.body[0];
    expect(puzzle.sequence).toBeDefined();
    expect(puzzle.options).toBeDefined();
    expect(puzzle.answer).toBeDefined();

    // 2. Submit a game score
    const scoreRes = await agent
      .post('/api/scores')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'freeplay',
        score: 850,
        correctCount: 8,
        totalRounds: 10,
        bestStreak: 5,
      });
    expect(scoreRes.status).toBe(201);
    expect(scoreRes.body.id).toBeDefined();
    expect(Array.isArray(scoreRes.body.newAchievements)).toBe(true);
    // CS52-7: legacy /api/scores does NOT unlock achievements (offline path).
    expect(scoreRes.body.newAchievements.length).toBe(0);

    // 3. Check leaderboard — player should appear
    // CS52-6: POST /api/scores tags rows as `offline` (self-reported);
    // the public LB defaults to `ranked`, so explicitly filter for
    // offline to see this row.
    const lbRes = await agent
      .get('/api/scores/leaderboard?variant=freeplay&source=offline&period=all')
      .set('Authorization', `Bearer ${userToken}`);
    expect(lbRes.status).toBe(200);
    expect(lbRes.body.leaderboard.length).toBeGreaterThanOrEqual(1);
    const myEntry = lbRes.body.leaderboard.find(e => e.username === 'sp_player');
    expect(myEntry).toBeDefined();
    expect(myEntry.score).toBe(850);

    // 4. Check my scores
    const myScoresRes = await agent
      .get('/api/scores/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(myScoresRes.status).toBe(200);
    expect(myScoresRes.body.scores.length).toBe(1);
    expect(myScoresRes.body.stats.length).toBeGreaterThanOrEqual(1);

    // 5. Check achievements — CS52-7: none unlocked from offline path.
    const achRes = await agent
      .get('/api/achievements/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(achRes.status).toBe(200);
    expect(achRes.body.achievements.length).toBe(0);

    // 6. All-achievements listing still works; nothing is unlocked yet.
    const allAchRes = await agent
      .get('/api/achievements')
      .set('Authorization', `Bearer ${userToken}`);
    expect(allAchRes.status).toBe(200);
    const unlocked = allAchRes.body.achievements.filter(a => a.unlocked);
    expect(unlocked.length).toBe(0);
  });

  test('daily challenge score submission', async () => {
    const agent = getAgent();

    const res = await agent
      .post('/api/scores')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'daily',
        score: 500,
        correctCount: 5,
        totalRounds: 5,
        bestStreak: 3,
      });
    expect(res.status).toBe(201);

    // Verify it shows in my scores
    const myRes = await agent
      .get('/api/scores/me')
      .set('Authorization', `Bearer ${userToken}`);
    const dailyStats = myRes.body.stats.find(s => s.mode === 'daily');
    expect(dailyStats).toBeDefined();
    expect(dailyStats.games_played).toBe(1);
  });

  test('multiple scores update leaderboard correctly', async () => {
    const agent = getAgent();

    // Register a second player with a higher score
    const { token: token2 } = await registerUser('sp_player2', 'password123');
    await agent
      .post('/api/scores')
      .set('Authorization', `Bearer ${token2}`)
      .send({ mode: 'freeplay', score: 1200, correctCount: 10, totalRounds: 10, bestStreak: 10 });

    const lbRes = await agent
      .get('/api/scores/leaderboard?variant=freeplay&source=offline')
      .set('Authorization', `Bearer ${userToken}`);

    expect(lbRes.body.leaderboard[0].username).toBe('sp_player2');
    expect(lbRes.body.leaderboard[0].score).toBe(1200);
    expect(lbRes.body.leaderboard[0].rank).toBe(1);
  });

  test('stale token returns 401 on score submit', async () => {
    const agent = getAgent();
    // Use a fabricated token with a non-existent user ID
    const jwt = require('jsonwebtoken');
    const fakeToken = jwt.sign(
      { id: 99999, username: 'ghost', role: 'user' },
      process.env.JWT_SECRET || 'gwn-dev-secret-change-in-production',
      { expiresIn: '1h' }
    );

    const res = await agent
      .post('/api/scores')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({ mode: 'freeplay', score: 100 });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not found/i);
  });
});
