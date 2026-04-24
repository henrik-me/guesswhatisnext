/**
 * Boot-time auth helpers — extracted from app.js so the cold-start contract
 * for the stored-token validation path is unit-testable.
 *
 * CS53-4 + CS53 Policy 1: stored-token validation runs at boot before any UI
 * is mounted, so there is no progressive-loader container to render warmup
 * messages into. If the server is warming up (RetryableError) or permanently
 * unavailable (UnavailableError), we silently *defer* — auth state stays
 * whatever it was loaded from localStorage. We do NOT retry, do NOT poll
 * (Policy 1 — no DB-waking background work), and do NOT block boot. The
 * eventual user action (e.g., opening profile) will surface the warming /
 * unavailable banner via the next real `apiFetch` call through the central
 * error handler.
 */

import { RetryableError, UnavailableError } from './progressive-loader.js';

/**
 * Validate a stored auth token at boot.
 *
 * @param {Object} deps
 * @param {Function} deps.apiFetch - shared apiFetch wrapper (auth header + 401 handling)
 * @param {Function} deps.throwIfRetryable - inspects the response and throws
 *        RetryableError / UnavailableError when the server signals warmup or
 *        permanent unavailability via the standard 503 contract.
 * @param {Function} deps.onUnauthorized - invoked when the server explicitly
 *        rejects the token with 401/403 (token is stale/invalid).
 * @param {Function} deps.onValidated - invoked with the parsed JSON body on 200.
 * @param {Function} [deps.onDeferred] - invoked when validation cannot complete
 *        right now (RetryableError, UnavailableError, network error, parse
 *        error). Auth state must be left intact so a subsequent real request
 *        can validate the token.
 * @returns {Promise<void>}
 */
export async function validateStoredAuthToken({
  apiFetch,
  throwIfRetryable,
  onUnauthorized,
  onValidated,
  onDeferred,
}) {
  // Defensively wrap onDeferred so a throwing callback cannot re-introduce
  // a boot-time unhandledrejection in fire-and-forget callers.
  const safeOnDeferred = (err) => {
    if (!onDeferred) return;
    try { onDeferred(err); } catch { /* swallow — boot must not reject */ }
  };

  let res;
  try {
    res = await apiFetch('/api/auth/me');
  } catch (err) {
    // Network error before a response was received — defer.
    safeOnDeferred(err);
    return;
  }

  try {
    // throwIfRetryable converts a 503 + Retry-After into RetryableError and
    // a 503 + {unavailable:true} into UnavailableError. CS53-4 treats both
    // as "auth deferred" — no retry, no poll, boot continues.
    await throwIfRetryable(res);
  } catch (err) {
    if (err instanceof RetryableError || err instanceof UnavailableError) {
      safeOnDeferred(err);
      return;
    }
    // Unexpected error from throwIfRetryable (e.g., body parse) — also defer.
    safeOnDeferred(err);
    return;
  }

  if (res.status === 401 || res.status === 403) {
    try {
      onUnauthorized();
    } catch (err) {
      safeOnDeferred(err);
    }
    return;
  }

  if (res.ok) {
    let data;
    try {
      data = await res.json();
    } catch (err) {
      safeOnDeferred(err);
      return;
    }
    try {
      onValidated(data);
    } catch (err) {
      // A callback failure (e.g., localStorage quota exceeded) must not
      // surface as an unhandledrejection at boot. Treat as deferred so
      // the next real user action re-validates.
      safeOnDeferred(err);
    }
    return;
  }

  // Any other status (e.g., 500 not classified transient) — defer silently.
  safeOnDeferred(new Error(`Unexpected status ${res.status}`));
}
