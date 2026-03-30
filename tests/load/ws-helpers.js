'use strict';

/**
 * Artillery helper functions for WebSocket load test scenarios.
 * Handles user registration and match creation via HTTP before WS connection.
 */

const { httpRequest, getBaseUrl, loadUserPool, setupUsers, cleanupUserPool, makeUsername } = require('./helpers');

let counter = 0;
let cachedPool = null;

/**
 * Register or reuse a user for WS testing.
 * Tries the shared user pool first, falls back to direct registration with retry.
 */
async function registerAndGetToken(context, _events, done) {
  try {
    const baseUrl = getBaseUrl(context);

    // Try to pick from existing user pool first
    if (!cachedPool) {
      cachedPool = loadUserPool();
    }
    if (cachedPool.length > 0) {
      const user = cachedPool[counter % cachedPool.length];
      counter++;
      context.vars.token = user.token;
      context.vars.username = user.username;
      context.vars.wsTarget = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
      return done();
    }

    // Fall back to direct registration with retry on 429
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const username = makeUsername('w');
      const password = 'LoadTest123!';

      const res = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
        username,
        password,
      });

      if (res.statusCode === 201 && res.body.token) {
        context.vars.token = res.body.token;
        context.vars.username = username;
        context.vars.wsTarget = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
        return done();
      }

      if (res.statusCode === 429) {
        // Rate limit window is 60s; wait long enough to clear it
        const retryAfter = 61000;
        console.error(`[ws] Rate limited, waiting ${retryAfter / 1000}s (retry ${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, retryAfter));
        continue;
      }

      console.error(`[ws] Registration failed: ${res.statusCode}`, res.body);
    }

    // All retries exhausted — signal failure
    return done(new Error('Failed to register user for WS test after retries'));
  } catch (err) {
    console.error('registerAndGetToken error:', err.message);
    return done(err);
  }
}

/**
 * Create a match room via the HTTP API (requires auth token).
 * Fails fast if no token is available.
 */
async function createMatchRoom(context, _events, done) {
  if (!context.vars.token) {
    return done(new Error('No auth token available — cannot create match room'));
  }

  try {
    const baseUrl = getBaseUrl(context);
    const result = await httpRequest(
      baseUrl,
      'POST',
      '/api/matches',
      { totalRounds: 3, maxPlayers: 2 },
      { Authorization: `Bearer ${context.vars.token}` }
    );

    if (result.statusCode === 201 && result.body.roomCode) {
      context.vars.roomCode = result.body.roomCode;
    } else {
      console.error(`Match creation failed: ${result.statusCode}`, result.body);
      return done(new Error(`Match creation failed: ${result.statusCode}`));
    }
  } catch (err) {
    console.error('createMatchRoom error:', err.message);
    return done(err);
  }
  return done();
}

module.exports = { registerAndGetToken, createMatchRoom, setupUsers, cleanupUserPool };
