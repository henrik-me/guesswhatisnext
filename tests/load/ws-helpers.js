'use strict';

/**
 * Artillery helper functions for WebSocket load test scenarios.
 * Handles user registration and match creation via HTTP before WS connection.
 *
 * Artillery's WS engine calls getWsInstance() which only reads the `connect`
 * config from the FIRST step in the flow. It opens the WebSocket BEFORE
 * running any subsequent steps. To perform setup (register, get token) before
 * the connection, we use `connect.function` handlers that receive `wsArgs`
 * and can set `wsArgs.target` to the authenticated WS URL.
 */

const { httpRequest, getBaseUrl, loadUserPool, setupUsers, cleanupUserPool, makeUsername } = require('./helpers');

let counter = 0;
let cachedPool = null;

/**
 * Obtain a token from the user pool or by registering a new user.
 * Returns { token, username } or throws on failure.
 */
async function acquireToken(baseUrl) {
  if (!cachedPool) {
    cachedPool = loadUserPool();
  }
  if (cachedPool.length > 0) {
    const user = cachedPool[counter % cachedPool.length];
    counter++;
    return { token: user.token, username: user.username };
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const username = makeUsername('w');
    const password = 'LoadTest123!';

    const res = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
      username,
      password,
    });

    if (res.statusCode === 201 && res.body.token) {
      return { token: res.body.token, username };
    }

    if (res.statusCode === 429) {
      const retryAfter = 61000;
      console.error(`[ws] Rate limited, waiting ${retryAfter / 1000}s (retry ${attempt + 1}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, retryAfter));
      continue;
    }

    console.error(`[ws] Registration failed: ${res.statusCode}`, res.body);
  }

  throw new Error('Failed to register user for WS test after retries');
}

/**
 * Build the authenticated WebSocket URL for the given base HTTP URL and token.
 */
function buildWsUrl(baseUrl, token) {
  const wsBase = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${wsBase}/ws?token=${token}`;
}

/**
 * connect.function handler: register/load user, then set wsArgs.target to
 * the authenticated WS URL. Called by Artillery BEFORE opening the socket.
 * Signature: (wsArgs, context, done)
 */
async function connectWithToken(wsArgs, context, done) {
  try {
    const baseUrl = getBaseUrl(context);
    const { token, username } = await acquireToken(baseUrl);
    context.vars.token = token;
    context.vars.username = username;
    wsArgs.target = buildWsUrl(baseUrl, token);
    return done();
  } catch (err) {
    console.error('connectWithToken error:', err.message);
    return done(err);
  }
}

/**
 * connect.function handler: register/load user, create a match room, then
 * set wsArgs.target. Used by the "room join" scenario.
 * Signature: (wsArgs, context, done)
 */
async function connectWithTokenAndRoom(wsArgs, context, done) {
  try {
    const baseUrl = getBaseUrl(context);
    const { token, username } = await acquireToken(baseUrl);
    context.vars.token = token;
    context.vars.username = username;

    const result = await httpRequest(
      baseUrl,
      'POST',
      '/api/matches',
      { totalRounds: 3, maxPlayers: 2 },
      { Authorization: `Bearer ${token}` },
    );

    if (result.statusCode === 201 && result.body.roomCode) {
      context.vars.roomCode = result.body.roomCode;
    } else {
      console.error(`Match creation failed: ${result.statusCode}`, result.body);
      return done(new Error(`Match creation failed: ${result.statusCode}`));
    }

    wsArgs.target = buildWsUrl(baseUrl, token);
    return done();
  } catch (err) {
    console.error('connectWithTokenAndRoom error:', err.message);
    return done(err);
  }
}

module.exports = { connectWithToken, connectWithTokenAndRoom, setupUsers, cleanupUserPool };
