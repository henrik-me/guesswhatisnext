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
 *
 * Custom Metrics:
 * Artillery's WS engine connect.function handlers receive (wsArgs, context, done)
 * but do NOT receive an event emitter (ee) parameter. This means we cannot
 * directly emit histogram metrics (p50/p95/p99) from WS hooks.
 *
 * Workaround: We store timestamps in context.vars and emit timing metrics
 * from the `afterResponse` / `afterScenario` hooks where the event emitter
 * is available. For connect time, we measure the duration inside the
 * connect.function handler and store it in context.vars for later emission.
 *
 * For message round-trip time, Artillery's WS engine does not provide
 * per-message response hooks. The best available approach is to track
 * session-level timing (connect → disconnect) via before/after scenario hooks.
 */

const { httpRequest, getBaseUrl, loadUserPool, setupUsers, cleanupUserPool } = require('./helpers');

let counter = 0;
let cachedPool = null;

/**
 * Obtain a token from the pre-seeded user pool (round-robin).
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
 * the authenticated WS URL. Tracks connection start time for latency metrics.
 * Signature: (wsArgs, context, done)
 */
function connectWithToken(wsArgs, context, done) {
  try {
    context.vars._wsConnectStart = Date.now();
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
 * set wsArgs.target. Tracks connection start time for latency metrics.
 * Signature: (wsArgs, context, done)
 */
async function connectWithTokenAndRoom(wsArgs, context, done) {
  try {
    context.vars._wsConnectStart = Date.now();
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

/**
 * afterScenario hook: emit WebSocket timing metrics collected during the scenario.
 *
 * Emits:
 * - ws.session_duration: total scenario duration from start to completion (ms)
 * - ws.connect_time: time from pre-connect setup to post-connect handshake (ms)
 *
 * Note: Artillery's WS engine does not expose per-message response hooks,
 * so message round-trip timing cannot be measured directly. The session
 * duration metric serves as a proxy for overall WS interaction health.
 */
function emitWsMetrics(context, events, done) {
  const now = Date.now();

  if (context.vars._scenarioStart) {
    const sessionDuration = now - context.vars._scenarioStart;
    if (events && typeof events.emit === 'function') {
      events.emit('histogram', 'ws.session_duration', sessionDuration);
    }
  }

  // Emit connect time if tracked via markConnectComplete step after connect
  if (context.vars._wsConnectEnd && context.vars._wsConnectStart) {
    const connectLatency = context.vars._wsConnectEnd - context.vars._wsConnectStart;
    if (events && typeof events.emit === 'function') {
      events.emit('histogram', 'ws.connect_time', connectLatency);
    }
  }

  return done();
}

/**
 * beforeScenario hook: record scenario start time.
 */
function markScenarioStart(context, events, done) {
  context.vars._scenarioStart = Date.now();
  return done();
}

/**
 * Function step to record when the WS connection has been established.
 * Place this as a function step immediately after `connect` in the YAML flow
 * to measure handshake latency (connect_time = _wsConnectEnd - _wsConnectStart).
 */
function markConnectComplete(context, _events, done) {
  context.vars._wsConnectEnd = Date.now();
  return done();
}

module.exports = {
  connectWithToken,
  connectWithTokenAndRoom,
  emitWsMetrics,
  markScenarioStart,
  markConnectComplete,
  setupUsers,
  cleanupUserPool,
};
