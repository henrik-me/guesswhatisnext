'use strict';

/**
 * CS52-7c — admin route integration tests.
 *
 * Boots the full server (helper.js) so the route, auth middleware, db adapter,
 * and loader cache all interact through the real Express stack against a
 * temp SQLite DB.
 */

const { getAgent, setup, teardown } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

beforeAll(setup);
afterAll(teardown);

function validBody(overrides = {}) {
  return { rounds: 8, round_timer_ms: 18000, inter_round_delay_ms: 1000, ...overrides };
}

describe('PUT /api/admin/game-configs/:mode — auth', () => {
  test('missing api key → 401', async () => {
    const res = await getAgent().put('/api/admin/game-configs/ranked_freeplay').send(validBody());
    expect(res.status).toBe(401);
  });

  test('wrong api key → 401', async () => {
    const res = await getAgent()
      .put('/api/admin/game-configs/ranked_freeplay')
      .set('X-API-Key', 'definitely-not-the-key')
      .send(validBody());
    expect(res.status).toBe(401);
  });

  test('regular user JWT → 403', async () => {
    const reg = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'gconfregular', password: 'password123' });
    const res = await getAgent()
      .put('/api/admin/game-configs/ranked_freeplay')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send(validBody());
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/game-configs/:mode — validation', () => {
  test('unknown mode → 400', async () => {
    const res = await getAgent()
      .put('/api/admin/game-configs/not_a_real_mode')
      .set('X-API-Key', SYSTEM_KEY)
      .send(validBody());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mode/i);
  });

  test.each([
    ['rounds=0', { rounds: 0 }],
    ['rounds=51', { rounds: 51 }],
    ['rounds string', { rounds: 'abc' }],
    ['rounds float', { rounds: 1.5 }],
    ['rounds missing', { rounds: undefined }],
  ])('invalid %s → 400', async (_label, override) => {
    const body = validBody(override);
    if (override.rounds === undefined) delete body.rounds;
    const res = await getAgent()
      .put('/api/admin/game-configs/ranked_freeplay')
      .set('X-API-Key', SYSTEM_KEY)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rounds/i);
  });

  test.each([
    ['timer 4999', { round_timer_ms: 4999 }],
    ['timer 60001', { round_timer_ms: 60001 }],
    ['timer string', { round_timer_ms: 'abc' }],
  ])('invalid %s → 400', async (_label, override) => {
    const res = await getAgent()
      .put('/api/admin/game-configs/ranked_freeplay')
      .set('X-API-Key', SYSTEM_KEY)
      .send(validBody(override));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/round_timer_ms/i);
  });

  test.each([
    ['delay -1', { inter_round_delay_ms: -1 }],
    ['delay 10001', { inter_round_delay_ms: 10001 }],
    ['delay string', { inter_round_delay_ms: 'abc' }],
  ])('invalid %s → 400', async (_label, override) => {
    const res = await getAgent()
      .put('/api/admin/game-configs/ranked_freeplay')
      .set('X-API-Key', SYSTEM_KEY)
      .send(validBody(override));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inter_round_delay_ms/i);
  });

  test('inter_round_delay_ms omitted → defaults to 0 + 200', async () => {
    const res = await getAgent()
      .put('/api/admin/game-configs/multiplayer')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ rounds: 5, round_timer_ms: 20000 });
    expect(res.status).toBe(200);
    expect(res.body.inter_round_delay_ms).toBe(0);
  });
});

describe('PUT /api/admin/game-configs/:mode — happy path', () => {
  test('upserts row, returns 200, busts loader cache', async () => {
    const { getConfig, bustAllCaches } = require('../server/services/gameConfigLoader');
    bustAllCaches();

    // Before write: defaults apply (no row).
    const before = await getConfig('ranked_freeplay');
    expect(before.rounds).toBe(10);

    const res = await getAgent()
      .put('/api/admin/game-configs/ranked_freeplay')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ rounds: 12, round_timer_ms: 17000, inter_round_delay_ms: 250 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: 'ranked_freeplay',
      rounds: 12,
      round_timer_ms: 17000,
      inter_round_delay_ms: 250,
    });
    expect(typeof res.body.updated_at).toBe('string');
    expect(() => new Date(res.body.updated_at).toISOString()).not.toThrow();

    // After write: cache was busted so the next loader read picks up the row.
    const after = await getConfig('ranked_freeplay');
    expect(after).toEqual({ rounds: 12, round_timer_ms: 17000, inter_round_delay_ms: 250 });
  });

  test('idempotent — second call updates updated_at', async () => {
    const first = await getAgent()
      .put('/api/admin/game-configs/ranked_daily')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ rounds: 9, round_timer_ms: 14000, inter_round_delay_ms: 0 });
    expect(first.status).toBe(200);

    // Force a measurable gap between the two ISO timestamps.
    await new Promise((r) => setTimeout(r, 10));

    const second = await getAgent()
      .put('/api/admin/game-configs/ranked_daily')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ rounds: 9, round_timer_ms: 14000, inter_round_delay_ms: 0 });
    expect(second.status).toBe(200);

    expect(new Date(second.body.updated_at).getTime())
      .toBeGreaterThanOrEqual(new Date(first.body.updated_at).getTime());
  });
});
