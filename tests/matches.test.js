/**
 * Matches API smoke tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('matchuser');
  userToken = token;
});

afterAll(teardown);

describe('POST /api/matches', () => {
  test('creates a match room with server-authoritative config', async () => {
    const res = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.roomCode).toBeDefined();
    expect(res.body.roomCode.length).toBe(6);
    // CS52-7b: server fills in totalRounds from game_configs (default 5).
    expect(res.body.totalRounds).toBe(5);
  });

  test('creates a room with maxPlayers', async () => {
    const res = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ maxPlayers: 5 });

    expect(res.status).toBe(201);
    expect(res.body.roomCode).toBeDefined();
  });

  test('rejects without auth', async () => {
    const res = await getAgent()
      .post('/api/matches')
      .send({});

    expect(res.status).toBe(401);
  });

  test('rejects maxPlayers out of range', async () => {
    const res = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ maxPlayers: 15 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/matches/join', () => {
  test('rejects invalid room code', async () => {
    const res = await getAgent()
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomCode: 'XXXXXX' });

    expect(res.status).toBe(404);
  });

  test('rejects without auth', async () => {
    const res = await getAgent()
      .post('/api/matches/join')
      .send({ roomCode: 'ABCDEF' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/matches/:id', () => {
  test('returns match status and player info', async () => {
    // Create a room to get a match ID
    const createRes = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(createRes.status).toBe(201);
    const matchId = createRes.body.matchId;

    const res = await getAgent()
      .get(`/api/matches/${matchId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(matchId);
    expect(res.body.status).toBeDefined();
    expect(Array.isArray(res.body.players)).toBe(true);
  });

  test('returns 404 for non-existent match ID', async () => {
    const res = await getAgent()
      .get('/api/matches/999999')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('GET /api/matches/history', () => {
  test('returns match history', async () => {
    const res = await getAgent()
      .get('/api/matches/history')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});
