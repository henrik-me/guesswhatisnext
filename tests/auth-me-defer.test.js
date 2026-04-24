/**
 * Unit tests for the boot-time stored-token validator.
 *
 * CS53-4: when /api/auth/me returns a 503 warmup signal (RetryableError) or
 * a permanent-unavailable signal (UnavailableError), boot must NOT block,
 * NOT retry, and NOT poll. Auth state stays whatever localStorage gave us
 * and the next real user action will surface the warming/unavailable banner
 * via the central error handler.
 */
import { describe, it, expect, vi } from 'vitest';
import { RetryableError, UnavailableError } from '../public/js/progressive-loader.js';
import { validateStoredAuthToken } from '../public/js/auth-boot.js';

function makeDeps({ apiFetch, throwIfRetryable }) {
  return {
    apiFetch,
    throwIfRetryable,
    onUnauthorized: vi.fn(),
    onValidated: vi.fn(),
    onDeferred: vi.fn(),
  };
}

describe('validateStoredAuthToken — CS53-4 boot defer behavior', () => {
  it('on RetryableError: defers silently, no retry, no poll, boot proceeds', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ status: 503, ok: false });
    const throwIfRetryable = vi.fn(() => {
      throw new RetryableError('Server warming up', 5000);
    });
    const deps = makeDeps({ apiFetch, throwIfRetryable });

    await validateStoredAuthToken(deps);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/auth/me');
    expect(throwIfRetryable).toHaveBeenCalledTimes(1);
    expect(deps.onUnauthorized).not.toHaveBeenCalled();
    expect(deps.onValidated).not.toHaveBeenCalled();
    expect(deps.onDeferred).toHaveBeenCalledTimes(1);
    expect(deps.onDeferred.mock.calls[0][0]).toBeInstanceOf(RetryableError);
  });

  it('on UnavailableError: defers silently, no retry, no poll', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ status: 503, ok: false });
    const throwIfRetryable = vi.fn(() => {
      throw new UnavailableError('Paused for the remainder of the month', 'capacity_exhausted');
    });
    const deps = makeDeps({ apiFetch, throwIfRetryable });

    await validateStoredAuthToken(deps);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(deps.onUnauthorized).not.toHaveBeenCalled();
    expect(deps.onValidated).not.toHaveBeenCalled();
    expect(deps.onDeferred).toHaveBeenCalledTimes(1);
    expect(deps.onDeferred.mock.calls[0][0]).toBeInstanceOf(UnavailableError);
  });

  it('on RetryableError without onDeferred callback: still no throw, no retry', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ status: 503, ok: false });
    const throwIfRetryable = vi.fn(() => {
      throw new RetryableError('warming', 2000);
    });

    await expect(
      validateStoredAuthToken({
        apiFetch,
        throwIfRetryable,
        onUnauthorized: vi.fn(),
        onValidated: vi.fn(),
        // onDeferred intentionally omitted
      }),
    ).resolves.toBeUndefined();

    expect(apiFetch).toHaveBeenCalledTimes(1); // single attempt — no retry
  });

  it('on 200: parses body and calls onValidated', async () => {
    const data = { user: { username: 'alice', role: 'admin' } };
    const res = {
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(data),
    };
    const apiFetch = vi.fn().mockResolvedValue(res);
    const throwIfRetryable = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ apiFetch, throwIfRetryable });

    await validateStoredAuthToken(deps);

    expect(deps.onValidated).toHaveBeenCalledTimes(1);
    expect(deps.onValidated).toHaveBeenCalledWith(data);
    expect(deps.onUnauthorized).not.toHaveBeenCalled();
    expect(deps.onDeferred).not.toHaveBeenCalled();
  });

  it('on 401: calls onUnauthorized', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ status: 401, ok: false });
    const throwIfRetryable = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ apiFetch, throwIfRetryable });

    await validateStoredAuthToken(deps);

    expect(deps.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(deps.onValidated).not.toHaveBeenCalled();
    expect(deps.onDeferred).not.toHaveBeenCalled();
  });

  it('on 403: calls onUnauthorized', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ status: 403, ok: false });
    const throwIfRetryable = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ apiFetch, throwIfRetryable });

    await validateStoredAuthToken(deps);

    expect(deps.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(deps.onDeferred).not.toHaveBeenCalled();
  });

  it('on network error from apiFetch: defers silently', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('Network down'));
    const throwIfRetryable = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ apiFetch, throwIfRetryable });

    await validateStoredAuthToken(deps);

    expect(deps.onUnauthorized).not.toHaveBeenCalled();
    expect(deps.onValidated).not.toHaveBeenCalled();
    expect(deps.onDeferred).toHaveBeenCalledTimes(1);
  });
});

describe('CS53-4 audit guard: no raw fetch(\'/api ... callsites in public/js/', () => {
  it('public/js/ contains zero raw fetch(\'/api callsites', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../public/js');
    const entries = await fs.readdir(dir);
    const offenders = [];
    for (const name of entries) {
      if (!name.endsWith('.js')) continue;
      const content = await fs.readFile(path.join(dir, name), 'utf8');
      // Match raw fetch('/api... or fetch("/api... or fetch(`/api...
      // — i.e. any direct fetch() call to the API not routed through apiFetch.
      const re = /(^|[^.\w])fetch\(\s*['"`]\/api/g;
      const matches = content.match(re);
      if (matches) offenders.push({ file: name, count: matches.length });
    }
    expect(offenders).toEqual([]);
  });
});
