/**
 * Integration tests for the centralized Express error-handling middleware.
 */

const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('Centralized error handler', () => {
  test('returns JSON error with status for malformed JSON body (4xx)', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"invalid json');

    // Express JSON parser yields a 400 SyntaxError; our handler catches it
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    // 4xx errors expose the error message (not "Internal server error")
    expect(res.body.error).toBeTruthy();
    // Should not leak stack traces
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });

  test('returns JSON error for missing required fields', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns structured JSON error for non-existent resource', async () => {
    const res = await getAgent()
      .put('/api/submissions/999999/review')
      .set('X-API-Key', 'gwn-dev-system-key')
      .send({ status: 'approved' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    // Internal details (stack traces, module paths) should never leak
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });

  test('does not leak stack traces in error responses', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('not json at all {{{');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    // No stack frames should leak into the response
    expect(JSON.stringify(res.body)).not.toMatch(/at .+\(.+:\d+:\d+\)/);
  });
});
