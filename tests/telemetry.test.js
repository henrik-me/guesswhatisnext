/**
 * Telemetry endpoint tests — POST /api/telemetry/errors
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

let requestIpCounter = 0;

function postTelemetry() {
  requestIpCounter += 1;
  return getAgent()
    .post('/api/telemetry/errors')
    .set('X-Forwarded-For', `198.51.100.${requestIpCounter}`);
}

describe('POST /api/telemetry/errors', () => {
  test('returns 204 for valid error report', async () => {
    const res = await postTelemetry()
      .send({ message: 'Test error', type: 'error', source: 'test.js', lineno: 1, colno: 5 });

    expect(res.status).toBe(204);
  });

  test('returns 400 when message is missing', async () => {
    const res = await postTelemetry()
      .send({ type: 'error' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  test('returns 400 when message is not a string', async () => {
    const res = await postTelemetry()
      .send({ message: 123 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  test('returns 400 for non-JSON request bodies instead of throwing', async () => {
    const res = await postTelemetry()
      .set('Content-Type', 'text/plain')
      .send('plain text error body');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('message is required');
  });

  test('returns 400 for malformed JSON bodies', async () => {
    const res = await postTelemetry()
      .set('Content-Type', 'application/json')
      .send('{"message"');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });

  test('rate limits malformed JSON bodies after 10 requests per minute per IP', async () => {
    const agent = getAgent();
    const responses = [];
    const rateLimitedIp = '198.51.100.43';

    for (let i = 0; i < 11; i++) {
      const res = await agent
        .post('/api/telemetry/errors')
        .set('Content-Type', 'application/json')
        .set('X-Forwarded-For', rateLimitedIp)
        .send('{"message"');
      responses.push(res);
    }

    expect(responses.slice(0, 10).map((res) => res.status)).toEqual(new Array(10).fill(400));
    expect(responses.slice(0, 10).every((res) => res.body.error === 'Malformed JSON body')).toBe(true);
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.error).toBe('Too many telemetry requests, try again later');
  });

  test('accepts error with stack trace', async () => {
    const res = await postTelemetry()
      .send({
        message: 'TypeError: x is not a function',
        stack: 'TypeError: x is not a function\n    at app.js:10:5',
        type: 'error',
      });

    expect(res.status).toBe(204);
  });

  test('accepts error with unhandledrejection type', async () => {
    const res = await postTelemetry()
      .send({ message: 'Promise rejected', type: 'unhandledrejection' });

    expect(res.status).toBe(204);
  });

  test('attaches userId when authenticated (returns 204)', async () => {
    const { token } = await registerUser('telemetry-user', 'pass12345');

    const res = await postTelemetry()
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Auth error test' });

    expect(res.status).toBe(204);
  });

  test('works without authentication', async () => {
    const res = await postTelemetry()
      .send({ message: 'Anonymous error' });

    expect(res.status).toBe(204);
  });

  test('accepts and processes long messages without error', async () => {
    const longMsg = 'x'.repeat(1000);
    const res = await postTelemetry()
      .send({ message: longMsg, type: 'error' });

    expect(res.status).toBe(204);
  });

  test('sanitizes non-string source and type fields', async () => {
    const res = await postTelemetry()
      .send({ message: 'valid message', source: 12345, type: { xss: true }, lineno: 'not-a-number' });

    expect(res.status).toBe(204);
  });

  test('accepts and processes long stack traces without error', async () => {
    const longStack = 'Error: boom\n' + '    at file.js:1:1\n'.repeat(500);
    const res = await postTelemetry()
      .send({ message: 'stack overflow', stack: longStack });

    expect(res.status).toBe(204);
  });

  test('rate limits after 10 requests per minute per IP', async () => {
    const agent = getAgent();
    const responses = [];
    const rateLimitedIp = '198.51.100.42';

    for (let i = 0; i < 11; i++) {
      const res = await agent
        .post('/api/telemetry/errors')
        .set('X-Forwarded-For', rateLimitedIp)
        .send({ message: `Rate limit test ${i}` });
      responses.push(res);
    }

    expect(responses.slice(0, 10).map((res) => res.status)).toEqual(new Array(10).fill(204));
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.error).toBe('Too many telemetry requests, try again later');
  });
});
