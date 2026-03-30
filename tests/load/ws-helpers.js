'use strict';

/**
 * Artillery helper functions for WebSocket load test scenarios.
 * Handles user registration and match creation via HTTP before WS connection.
 */

const { httpRequest, getBaseUrl, loadUserPool } = require('./helpers');

let counter = 0;
let cachedPool = null;

/**
 * Register or reuse a user for WS testing.
 * Tries the shared user pool first, falls back to direct registration.
 */
async function registerAndGetToken(context, _events, done) {
  try {
    const baseUrl = getBaseUrl(context);

    // Try to pick from existing user pool first
    if (!cachedPool) {
      cachedPool = loadUserPool();
    }
    if (cachedPool.length > 0) {
      counter++;
      const user = cachedPool[counter % cachedPool.length];
      context.vars.token = user.token;
      context.vars.username = user.username;
      context.vars.wsTarget = baseUrl.replace(/^http/, 'ws');
      return done();
    }

    // Fall back to direct registration
    counter++;
    const id = `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
    const username = `wsload_${id}`;
    const password = 'LoadTest123!';

    const res = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
      username,
      password,
    });

    if (res.statusCode === 201 && res.body.token) {
      context.vars.token = res.body.token;
      context.vars.username = username;
      context.vars.wsTarget = baseUrl.replace(/^http/, 'ws');
    } else {
      console.error(`Registration failed: ${res.statusCode}`, res.body);
    }
  } catch (err) {
    console.error('registerAndGetToken error:', err.message);
  }
  return done();
}

/**
 * Create a match room via the HTTP API (requires auth token).
 */
async function createMatchRoom(context, _events, done) {
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
      context.vars.roomCode = 'NONE';
    }
  } catch (err) {
    console.error('createMatchRoom error:', err.message);
    context.vars.roomCode = 'NONE';
  }
  return done();
}

module.exports = { registerAndGetToken, createMatchRoom };
