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
    const { config } = require('../server/config');
    const res = await getAgent()
      .put('/api/submissions/999999/review')
      .set('X-API-Key', config.SYSTEM_API_KEY)
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

/**
 * Unit-style tests for error handler edge cases that are hard to trigger
 * through integration routes (5xx masking, headers-already-sent delegation).
 * Uses the same error handler pattern as server/app.js (lines 279–298).
 */
describe('Error handler — 5xx and edge cases', () => {
  const express = require('express');
  const supertest = require('supertest');

  /** Build a minimal app with a triggering route and the production error handler. */
  function buildTestApp(routeSetup) {
    const app = express();
    routeSetup(app);
    // Replicate server/app.js centralized error handler
    app.use((err, req, res, next) => {
      const status = err.status || err.statusCode || 500;
      if (res.headersSent) return next(err);
      res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
    });
    return app;
  }

  test('returns generic message for 5xx errors (no detail leakage)', async () => {
    const app = buildTestApp((a) => {
      a.get('/boom', (_req, _res, next) => {
        next(new Error('Sensitive: DB password is hunter2'));
      });
    });

    const res = await supertest(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('Sensitive');
  });

  test('preserves error message for 4xx errors', async () => {
    const app = buildTestApp((a) => {
      a.get('/bad', (_req, _res, next) => {
        const err = new Error('Username is required');
        err.status = 400;
        next(err);
      });
    });

    const res = await supertest(app).get('/bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Username is required');
  });

  test('delegates to Express default handler when headers already sent', async () => {
    const app = buildTestApp((a) => {
      a.get('/partial', (req, res, next) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('partial');
        next(new Error('late failure'));
      });
    });

    // Express default error handler destroys the socket when headers are
    // already sent, so supertest receives an aborted/reset connection.
    // The key assertion: the middleware does NOT crash or try to send JSON.
    await expect(supertest(app).get('/partial')).rejects.toThrow();
  });

  test('uses status from err.statusCode when err.status is absent', async () => {
    const app = buildTestApp((a) => {
      a.get('/code', (_req, _res, next) => {
        const err = new Error('Not Found');
        err.statusCode = 404;
        next(err);
      });
    });

    const res = await supertest(app).get('/code');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });

  test('defaults to 500 when error has no status', async () => {
    const app = buildTestApp((a) => {
      a.get('/plain', (_req, _res, next) => {
        next(new Error('something broke'));
      });
    });

    const res = await supertest(app).get('/plain');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
