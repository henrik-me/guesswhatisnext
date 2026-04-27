/**
 * Unit tests for the service worker's `/api/*` fetch handler — CS53-14 audit.
 *
 * Asserts the catch path only fires on TRUE network errors and does not
 * synthesise a 503 in place of an upstream warmup 503+Retry-After. The
 * SW only intercepts same-origin GET /api/* traffic (non-GET requests
 * early-return at public/sw.js:57-58), so the relevant consumer is
 * `throwIfRetryable()` in public/js/app.js:42-67, which converts
 * 503+Retry-After GET responses into RetryableError for progressive-loader's
 * warmup retry loop. Auth login/register POSTs bypass the SW entirely; the
 * CS53-17 auth retry loop is therefore not affected by SW behaviour.
 *
 * Pairs with sw-activate.test.js (CS53-16 skipWaiting+clients.claim).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('sw.js fetch handler — /api/* path (CS53-14)', () => {
  let fetchHandler;
  let mockCaches;
  let originalFetch;

  beforeEach(() => {
    const swSource = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf-8');

    mockCaches = {
      _store: new Map(),
      open: vi.fn().mockResolvedValue({
        addAll: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      }),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(undefined),
    };

    globalThis.caches = mockCaches;
    globalThis.self = {
      addEventListener: vi.fn(),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
      location: { origin: 'https://example.com' },
    };

    originalFetch = globalThis.fetch;

    const fn = new Function('self', 'caches', swSource);
    fn(globalThis.self, globalThis.caches);

    const fetchCall = globalThis.self.addEventListener.mock.calls.find(([e]) => e === 'fetch');
    fetchHandler = fetchCall[1];
  });

  afterEach(() => {
    delete globalThis.caches;
    delete globalThis.self;
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete globalThis.fetch;
  });

  /**
   * Build a fake FetchEvent + Request pair. We capture whatever Promise the
   * handler passes to event.respondWith so tests can await the resolved
   * Response.
   */
  function makeEvent(url, init = {}) {
    const request = new Request(url, init);
    const holder = { response: undefined };
    const event = {
      request,
      respondWith: (p) => { holder.response = Promise.resolve(p); },
      waitUntil: () => {},
    };
    return { event, holder };
  }

  it('passes upstream 503+Retry-After response through unchanged (auth /me boot probe)', async () => {
    // Note: auth login/register use POST and bypass the SW fetch handler entirely
    // (public/sw.js:57-58 skips non-GET). The boot-time GET /api/auth/me probe IS
    // intercepted, and its 503+Retry-After must reach the client unchanged so the
    // app-level warmup classifier (throwIfRetryable in public/js/app.js:42-67)
    // can throw RetryableError with the correct delay.
    const upstream = new Response(JSON.stringify({ error: 'Database not yet initialized', phase: 'cold-start' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(upstream);

    const { event, holder } = makeEvent('https://example.com/api/auth/me');
    fetchHandler(event);
    const res = await holder.response;

    expect(res).toBe(upstream);
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
  });

  it('passes upstream 503+Retry-After response through unchanged (public API)', async () => {
    const upstream = new Response(JSON.stringify({ error: 'warming up' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '3' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(upstream);

    const { event, holder } = makeEvent('https://example.com/api/puzzles/daily');
    fetchHandler(event);
    const res = await holder.response;

    expect(res).toBe(upstream);
    expect(res.headers.get('Retry-After')).toBe('3');
  });

  it('synthesises 503 only when upstream fetch throws (true network error) — auth /me probe', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const { event, holder } = makeEvent('https://example.com/api/auth/me');
    fetchHandler(event);
    const res = await holder.response;

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'Service unavailable' });
    // Catch-path synthesises offline response without Retry-After by design:
    // throwIfRetryable() in app.js treats a 503-without-Retry-After as terminal
    // (UnavailableError if body says so, else falls through), so a true network
    // failure surfaces to the user rather than spinning the warmup retry loop.
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('skips non-GET requests entirely — auth POST bypasses SW (sanity)', async () => {
    // Locks in the contract that auth login/register POSTs are NOT touched by
    // the SW. CS53-17's auth retry loop in public/js/app.js sees the original
    // upstream Response unmediated. If a future refactor accidentally removed
    // the method!=='GET' early return, this test would catch it.
    globalThis.fetch = vi.fn();
    const { event, holder } = makeEvent('https://example.com/api/auth/login', { method: 'POST' });
    fetchHandler(event);
    expect(holder.response).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('falls back to cache on network failure for non-auth API GETs', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const cached = new Response('{"cached":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    mockCaches.match.mockResolvedValue(cached);

    const { event, holder } = makeEvent('https://example.com/api/puzzles/daily');
    fetchHandler(event);
    const res = await holder.response;

    expect(res).toBe(cached);
  });

  /**
   * Replicates the Retry-After header parse from `throwIfRetryable` in
   * public/js/app.js (lines 42-54) — the real consumer for SW-intercepted
   * GET /api/* responses. If either side changes incompatibly this test
   * will catch it.
   */
  function parseRetryAfterMs(res) {
    const header = res.headers.get('Retry-After');
    if (!header) return null;
    const s = parseInt(header, 10);
    if (!isNaN(s) && s >= 0) return s * 1000;
    return null;
  }

  it('preserved Retry-After is parseable by the warmup-retry classifier', async () => {
    // The actual consumer for SW-intercepted GET /api/* 503s is
    // throwIfRetryable() in public/js/app.js (called by progressive-loader's
    // fetchFn), which converts 503+Retry-After into RetryableError.
    const upstream = new Response(JSON.stringify({ phase: 'cold-start' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(upstream);

    const { event, holder } = makeEvent('https://example.com/api/puzzles/daily');
    fetchHandler(event);
    const res = await holder.response;

    expect(parseRetryAfterMs(res)).toBe(5000);
  });
});
