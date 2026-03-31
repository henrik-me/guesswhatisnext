'use strict';

/**
 * Artillery helper functions for WebSocket load test scenarios.
 * Loads pre-seeded users from the pool and creates matches via HTTP before
 * WS connection.
 *
 * Artillery's WS engine calls getWsInstance() which only reads the `connect`
 * config from the FIRST step in the flow. It opens the WebSocket BEFORE
 * running any subsequent steps. To perform setup (load token from pool) before
 * the connection, we use `connect.function` handlers that receive `wsArgs`
 * and can set `wsArgs.target` to the authenticated WS URL.
 */

const { httpRequest, getBaseUrl, loadUserPool, setupUsers, cleanupUserPool } = require('./helpers');

let counter = 0;
let cachedPool = null;

/**
 * Obtain a token from the pre-seeded user pool (round-robin).
 * The pool is populated by the `setupUsers` before-hook via direct DB seeding.
 * Returns { token, username } or throws if the pool is empty.
 */
function acquireToken() {
  if (!cachedPool) {
    cachedPool = loadUserPool();
  }
  if (cachedPool.length === 0) {
    throw new Error(
      '[ws] No users in pool — ensure setupUsers ran successfully and .user-pool.json exists',
    );
  }
  const user = cachedPool[counter % cachedPool.length];
  counter++;
  return { token: user.token, username: user.username };
}

/**
 * Build the authenticated WebSocket URL for the given base HTTP URL and token.
 */
function buildWsUrl(baseUrl, token) {
  const wsBase = baseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${wsBase}/ws?token=${token}`;
}

/**
 * connect.function handler: load user from pool, then set wsArgs.target to
 * the authenticated WS URL. Called by Artillery BEFORE opening the socket.
 * Signature: (wsArgs, context, done)
 */
function connectWithToken(wsArgs, context, done) {
  try {
    const baseUrl = getBaseUrl(context);
    const { token, username } = acquireToken();
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
 * connect.function handler: load user from pool, create a match room, then
 * set wsArgs.target. Used by the "room join" scenario.
 * Signature: (wsArgs, context, done)
 */
async function connectWithTokenAndRoom(wsArgs, context, done) {
  try {
    const baseUrl = getBaseUrl(context);
    const { token, username } = acquireToken();
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
