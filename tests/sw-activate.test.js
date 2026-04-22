/**
 * Unit tests for the service worker activate handler's cache purge logic.
 * Mocks the caches API to verify old gwn-* caches are deleted and the
 * current CACHE_NAME is preserved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('sw.js activate handler', () => {
  let activateHandler;
  let mockCaches;
  let CURRENT_CACHE;

  beforeEach(() => {
    // Extract the current CACHE_NAME from the generated sw.js
    const swSource = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf-8');
    const cacheMatch = swSource.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    if (!cacheMatch) {
      throw new Error('Unable to parse CACHE_NAME from public/sw.js');
    }
    CURRENT_CACHE = cacheMatch[1];

    // Build a mock caches API
    mockCaches = {
      _stores: new Map(),
      keys: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      open: vi.fn().mockResolvedValue({ addAll: vi.fn().mockResolvedValue(undefined) }),
    };

    // Stub the ServiceWorkerGlobalScope globals
    globalThis.caches = mockCaches;
    globalThis.self = {
      addEventListener: vi.fn(),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
      location: { origin: 'https://example.com' },
    };

    // Load sw.js as a script (not a module) by evaluating it
    const fn = new Function('self', 'caches', swSource);
    fn(globalThis.self, globalThis.caches);

    // Extract the activate handler
    const calls = globalThis.self.addEventListener.mock.calls;
    const activateCall = calls.find(([event]) => event === 'activate');
    activateHandler = activateCall[1];
  });

  afterEach(() => {
    delete globalThis.caches;
    delete globalThis.self;
  });

  it('deletes old gwn-* caches and preserves the current CACHE_NAME', async () => {
    mockCaches.keys.mockResolvedValue(['gwn-v1', 'gwn-v2', CURRENT_CACHE, 'other-cache']);

    let waitUntilPromise;
    const event = {
      waitUntil: (p) => { waitUntilPromise = p; },
    };

    activateHandler(event);
    await waitUntilPromise;

    // Old gwn-* caches should be deleted
    expect(mockCaches.delete).toHaveBeenCalledWith('gwn-v1');
    expect(mockCaches.delete).toHaveBeenCalledWith('gwn-v2');

    // Current cache must NOT be deleted
    const deletedKeys = mockCaches.delete.mock.calls.map((c) => c[0]);
    expect(deletedKeys).not.toContain(CURRENT_CACHE);

    // Non-gwn caches must NOT be deleted
    expect(deletedKeys).not.toContain('other-cache');

    // clients.claim() should have been called
    expect(globalThis.self.clients.claim).toHaveBeenCalled();
  });

  it('does nothing when no old gwn-* caches exist', async () => {
    mockCaches.keys.mockResolvedValue([CURRENT_CACHE, 'unrelated-cache']);

    let waitUntilPromise;
    const event = {
      waitUntil: (p) => { waitUntilPromise = p; },
    };

    activateHandler(event);
    await waitUntilPromise;

    expect(mockCaches.delete).not.toHaveBeenCalled();
    expect(globalThis.self.clients.claim).toHaveBeenCalled();
  });

  it('deletes all old gwn-* caches when many exist', async () => {
    mockCaches.keys.mockResolvedValue(['gwn-v1', 'gwn-v2', 'gwn-abc123', CURRENT_CACHE]);

    let waitUntilPromise;
    const event = {
      waitUntil: (p) => { waitUntilPromise = p; },
    };

    activateHandler(event);
    await waitUntilPromise;

    expect(mockCaches.delete).toHaveBeenCalledTimes(3);
    expect(mockCaches.delete).toHaveBeenCalledWith('gwn-v1');
    expect(mockCaches.delete).toHaveBeenCalledWith('gwn-v2');
    expect(mockCaches.delete).toHaveBeenCalledWith('gwn-abc123');
  });
});
