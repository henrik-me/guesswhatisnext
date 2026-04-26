'use strict';

/**
 * Reserved username prefixes — used by registration to reject reservations
 * and by public-listing endpoints (leaderboards, community puzzles, etc.)
 * to filter out internal accounts (e.g. the deploy-time smoke probe bot).
 *
 * The prefix is checked case-insensitively at registration. The matching SQL
 * filter `LIKE '<prefix>%'` is case-insensitive on both SQLite (default ASCII
 * LIKE behavior) and Azure SQL (default `_CI_` collation), so a literal
 * lowercase pattern works for both backends.
 */

const RESERVED_USERNAME_PREFIXES = Object.freeze([
  'gwn-smoke-',
]);

/** Returns true if `username` begins with any reserved prefix (case-insensitive). */
function isReservedUsername(username) {
  if (typeof username !== 'string') return false;
  const lower = username.toLowerCase();
  return RESERVED_USERNAME_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * SQL `LIKE` patterns that match every reserved prefix. Used by public-listing
 * endpoints to exclude reserved-prefix usernames from results.
 */
const RESERVED_USERNAME_LIKE_PATTERNS = Object.freeze(
  RESERVED_USERNAME_PREFIXES.map((p) => `${p}%`)
);

module.exports = {
  RESERVED_USERNAME_PREFIXES,
  RESERVED_USERNAME_LIKE_PATTERNS,
  isReservedUsername,
};
