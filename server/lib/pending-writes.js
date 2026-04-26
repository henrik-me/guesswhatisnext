'use strict';

/**
 * CS52-7e — `pending_writes` durable queue.
 *
 * On-disk layout: `<DATA_DIR>/pending-writes/<request_id>.json`. Three
 * discriminated-union variants keyed by `endpoint` (see CS52 design
 * contract § Schema migration sketch § pending_writes durable queue):
 *
 *   - "POST /api/sessions/:id/finish"          (Variant A)
 *   - "POST /api/sync"                         (Variant B)
 *   - "INTERNAL multiplayer-match-completion"  (Variant C)
 *
 * Drain is request-bound only — never timer-driven (per
 * [INSTRUCTIONS.md § Database & Data]). Triggers:
 *   1. Post-response hook on any successful API request (from app.js).
 *   2. The non-null → null transition of the DB-unavailability state
 *      (via `onUnavailabilityCleared` listener registered in app.js).
 *
 * Files survive container restart by living under the persistent data
 * volume root (`GWN_DATA_DIR` env, falling back to the directory of the
 * SQLite DB when running on the file-backed adapter).
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../logger');

let _dataDirCache = null;

/**
 * Resolve the on-disk root for the pending-writes queue.
 *
 * Precedence:
 *   1. `GWN_DATA_DIR` env var (explicit operator override; the persistent
 *      volume mount point in production).
 *   2. The directory containing `GWN_DB_PATH` (mirrors where the SQLite
 *      DB file lives, so the queue is on the same persistent volume by
 *      default — including the Azure App Service `/tmp/game.db` setup).
 *   3. `<repo>/data/` as the dev/test fallback.
 */
function getDataDir() {
  if (_dataDirCache) return _dataDirCache;
  const explicit = process.env.GWN_DATA_DIR;
  if (explicit) {
    _dataDirCache = explicit;
    return _dataDirCache;
  }
  const dbPath = process.env.GWN_DB_PATH;
  if (dbPath) {
    _dataDirCache = path.dirname(dbPath);
    return _dataDirCache;
  }
  _dataDirCache = path.join(__dirname, '..', '..', 'data');
  return _dataDirCache;
}

function pendingDir() {
  return path.join(getDataDir(), 'pending-writes');
}

function deadDir() {
  return path.join(pendingDir(), 'dead');
}

function ensureDirs() {
  fs.mkdirSync(pendingDir(), { recursive: true });
  fs.mkdirSync(deadDir(), { recursive: true });
}

/**
 * Test-only: drop the cached data-dir resolution so a subsequent call
 * picks up a freshly assigned `GWN_DATA_DIR`/`GWN_DB_PATH`.
 */
function __resetForTests() {
  _dataDirCache = null;
}

/**
 * Persist a queue entry as `<pending-writes>/<request_id>.json`.
 *
 * Writes via temp-file + rename + best-effort fsync so a power-loss /
 * SIGKILL between bytes does not surface as a half-written JSON file
 * the drain would dead-letter on.
 *
 * @param {object} record - Variant A | B | C; `request_id` is generated
 *   if absent. `queued_at` is filled in if absent.
 * @returns {Promise<{ request_id: string, file_path: string }>}
 */
async function enqueue(record) {
  ensureDirs();
  const requestId = record.request_id || crypto.randomUUID();
  const queuedAt = record.queued_at || new Date().toISOString();
  const final = {
    schema_version: 1,
    ...record,
    request_id: requestId,
    queued_at: queuedAt,
  };
  const filePath = path.join(pendingDir(), `${requestId}.json`);
  const tmpPath = `${filePath}.tmp`;
  const data = JSON.stringify(final, null, 2);
  await fsp.writeFile(tmpPath, data, 'utf8');
  try {
    const fh = await fsp.open(tmpPath, 'r+');
    try { await fh.sync(); } finally { await fh.close(); }
  } catch { /* fsync may not be supported on every fs; rename atomicity is enough */ }
  await fsp.rename(tmpPath, filePath);
  // Best-effort fsync of the parent directory so the rename is durable on
  // POSIX even after a power-loss / SIGKILL between rename and the next
  // dirty-buffer flush. Windows does not support directory fsync (open()
  // on a directory rejects with EISDIR / EPERM); the catch covers that.
  try {
    const dh = await fsp.open(pendingDir(), 'r');
    try { await dh.sync(); } finally { await dh.close(); }
  } catch { /* not supported (Windows) or not needed — best-effort */ }
  logger.info(
    {
      event: 'pending-writes-enqueued',
      request_id: requestId,
      endpoint: final.endpoint,
      user_id: final.user_id == null ? null : final.user_id,
      queued_at: queuedAt,
      file_path: filePath,
    },
    'pending-writes: enqueued'
  );
  return { request_id: requestId, file_path: filePath };
}

/**
 * Read every `*.json` file in the pending dir, parse it, and return the
 * list sorted by `queued_at` ascending. Unreadable / unparseable files
 * are moved to `dead/` (with a `pending-writes-dead-letter` log line)
 * because retrying the same corrupt JSON forever would keep the queue
 * permanently non-empty and skew observability.
 */
async function listPendingFiles() {
  ensureDirs();
  let names;
  try {
    names = await fsp.readdir(pendingDir());
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const items = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(pendingDir(), name);
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch (err) {
      logger.warn({ err, file: name }, 'pending-writes: skip-stat-failed');
      continue;
    }
    if (!stat.isFile()) continue;
    let text;
    try {
      text = await fsp.readFile(filePath, 'utf8');
    } catch (err) {
      // Transient I/O error — leave the file in place; it will be retried
      // on the next drain. Don't dead-letter on a read failure since the
      // payload may still be intact.
      logger.warn({ err, file: name }, 'pending-writes: skip-read-failed');
      continue;
    }
    try {
      const record = JSON.parse(text);
      items.push({ filePath, record });
    } catch (err) {
      // Truly corrupt JSON — dead-letter so the queue can drain to empty.
      logger.error(
        {
          err,
          event: 'pending-writes-dead-letter',
          request_id: name.replace(/\.json$/, ''),
          endpoint: null,
          error_class: 'CorruptJson',
        },
        'pending-writes: dead-letter (unparseable JSON)'
      );
      await moveToDead(filePath);
    }
  }
  items.sort((a, b) =>
    String(a.record.queued_at || '').localeCompare(String(b.record.queued_at || ''))
  );
  return items;
}

let _draining = false;
let _drainAgain = false;

/**
 * Replay every queued file via the supplied per-endpoint handler map.
 * Successful replays delete the file; non-retryable failures move it
 * to the `dead/` sibling directory; a transient failure (handler
 * throws an Error with `err.transient === true`) aborts the drain and
 * leaves the remaining files in place to be re-attempted on the next
 * trigger.
 *
 * Re-entrancy is guarded — concurrent drainOnce() calls are coalesced.
 *
 * @param {{ replayHandlers: Record<string, (record: object) => Promise<void>> }} opts
 */
async function drainOnce({ replayHandlers }) {
  // Re-entrancy guard with a "drain again" flag. If a second caller arrives
  // while a drain is already in flight (e.g. another request finishes and
  // its post-response hook fires before the first drain returns), we set a
  // flag so the in-flight drain runs one more pass after it completes
  // — otherwise files enqueued *after* the in-flight pass's directory
  // snapshot would sit until some unrelated future request happened to
  // re-trigger the drain.
  if (_draining) {
    _drainAgain = true;
    return { drained: 0, dead: 0, skipped: 'already-draining' };
  }
  _draining = true;
  let totalDrained = 0;
  let totalDead = 0;
  try {
    do {
      _drainAgain = false;
      const items = await listPendingFiles();
      if (items.length === 0) {
        if (totalDrained === 0 && totalDead === 0) {
          return { drained: 0, dead: 0 };
        }
        break;
      }
      logger.info(
        { event: 'pending-writes-drain-started', file_count: items.length },
        'pending-writes: drain started'
      );
      let aborted = false;
      for (const item of items) {
        const start = Date.now();
        const handler = replayHandlers[item.record.endpoint];
        if (!handler) {
          await moveToDead(item.filePath);
          totalDead++;
          logger.error(
            {
              event: 'pending-writes-dead-letter',
              request_id: item.record.request_id,
              endpoint: item.record.endpoint,
              error_class: 'NoReplayHandler',
            },
            'pending-writes: dead-letter'
          );
          continue;
        }
        try {
          await handler(item.record);
          await fsp.unlink(item.filePath).catch(() => {});
          totalDrained++;
          logger.info(
            {
              event: 'pending-writes-replayed',
              request_id: item.record.request_id,
              endpoint: item.record.endpoint,
              replay_duration_ms: Date.now() - start,
            },
            'pending-writes: replayed'
          );
        } catch (err) {
          if (err && err.transient) {
            logger.warn(
              { err, request_id: item.record.request_id, endpoint: item.record.endpoint },
              'pending-writes: replay aborted (transient) — will retry on next trigger'
            );
            aborted = true;
            break;
          }
          await moveToDead(item.filePath);
          totalDead++;
          logger.error(
            {
              err,
              event: 'pending-writes-dead-letter',
              request_id: item.record.request_id,
              endpoint: item.record.endpoint,
              error_class: (err && err.name) || 'Error',
            },
            'pending-writes: dead-letter'
          );
        }
      }
      if (aborted) {
        // Don't loop again on transient — the next external trigger will
        // re-run the drain; looping here would just pile up retries while
        // the DB is still down.
        _drainAgain = false;
        break;
      }
    } while (_drainAgain);
    return { drained: totalDrained, dead: totalDead };
  } finally {
    _draining = false;
    _drainAgain = false;
  }
}

async function moveToDead(filePath) {
  try {
    ensureDirs();
    const target = path.join(deadDir(), path.basename(filePath));
    await fsp.rename(filePath, target);
  } catch (err) {
    logger.error({ err, filePath }, 'pending-writes: failed to move file to dead/');
  }
}

module.exports = {
  enqueue,
  drainOnce,
  listPendingFiles,
  getDataDir,
  pendingDir,
  deadDir,
  __resetForTests,
};
