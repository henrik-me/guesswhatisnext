/**
 * Telemetry endpoint tests — POST /api/telemetry/errors
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('POST /api/telemetry/errors', () => {
  test('returns 204 for valid error report', async () => {
    const res = await getAgent()
      .post('/api/telemetry/errors')
      .send({ message: 'Test error', type: 'error', source: 'test.js', lineno: 1, colno: 5 });

    expect(res.status).toBe(204);
  });

  test('returns 400 when message is missing', async () => {
    const res = await getAgent()
      .post('/api/telemetry/errors')
      .send({ type: 'error' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  test('returns 400 when message is not a string', async () => {
    const res = await getAgent()
      .post('/api/telemetry/errors')
      .send({ message: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  test('accepts error with stack trace', async () => {
    const res = await getAgent()
      .post('/api/telemetry/errors')
      .send({
        message: 'TypeError: x is not a function',
        stack: 'TypeError: x is not a function\n    at app.js:10:5',
        type: 'error',
      });

    expect(res.status).toBe(204);
  });

  test('accepts error with unhandledrejection type', async () => {
    const res = await getAgent()
      .post('/api/telemetry/errors')
      .send({ message: 'Promise rejected', type: 'unhandledrejection' });

    expect(res.status).toBe(204);
  });

  test('attaches userId when authenticated', async () => {
    const { token } = await registerUser('telemetry-user', 'pass12345');

    const res = await getAgent()
      .post('/api/telemetry/errors')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Auth error test' });

    expect(res.status).toBe(204);
  });

  test('works without authentication', async () => {
    const res = await getAgent()
      .post('/api/telemetry/errors')
      .send({ message: 'Anonymous error' });

    expect(res.status).toBe(204);
  });

  test('rate limits after 10 requests', async () => {
    const agent = getAgent();
    const results = [];

    for (let i = 0; i < 11; i++) {
      const res = await agent
        .post('/api/telemetry/errors')
        .send({ message: `Rate limit test ${i}` });
      results.push(res.status);
    }

    // The 11th request should be rate-limited (429)
    expect(results[10]).toBe(429);
  });
});
