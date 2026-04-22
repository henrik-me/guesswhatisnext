/**
 * Unit tests for sw-register.js — specifically the controllerchange
 * one-shot reload guard that prevents reload loops.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load sw-register.js in an isolated scope with injectable globals.
 * Returns the controllerchange handler and the mocks for assertions.
 */
function loadSwRegister({ sessionStoreInit = {}, hasExistingController = true, throwOnStorage = false } = {}) {
  const store = { ...sessionStoreInit };
  const mockSessionStorage = {
    getItem: vi.fn((key) => {
      if (throwOnStorage) throw new DOMException('Storage disabled');
      return store[key] ?? null;
    }),
    setItem: vi.fn((key, val) => {
      if (throwOnStorage) throw new DOMException('Storage disabled');
      store[key] = String(val);
    }),
  };

  const mockReload = vi.fn();
  const listeners = {};
  const mockNavigator = {
    serviceWorker: {
      controller: hasExistingController ? { scriptURL: '/sw.js' } : null,
      register: vi.fn().mockResolvedValue({}),
      addEventListener: vi.fn((event, handler) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      }),
    },
  };

  const mockWindow = { location: { reload: mockReload } };

  const source = readFileSync(join(__dirname, '..', 'public', 'js', 'sw-register.js'), 'utf-8');
  const fn = new Function('navigator', 'sessionStorage', 'window', source);
  fn(mockNavigator, mockSessionStorage, mockWindow);

  return {
    controllerChangeHandler: listeners['controllerchange']?.[0],
    mockReload,
    mockSessionStorage,
  };
}

describe('sw-register controllerchange reload guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads once on the first controllerchange event', () => {
    const { controllerChangeHandler, mockReload, mockSessionStorage } = loadSwRegister();
    expect(controllerChangeHandler).toBeDefined();

    controllerChangeHandler();

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('gwn-sw-reloaded', '1');
  });

  it('does NOT reload on the second controllerchange event', () => {
    const { controllerChangeHandler, mockReload } = loadSwRegister();

    controllerChangeHandler();
    expect(mockReload).toHaveBeenCalledTimes(1);

    // Fire a second controllerchange — reload should NOT fire again
    controllerChangeHandler();
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('does not reload if sessionStorage flag was already set', () => {
    const { controllerChangeHandler, mockReload } = loadSwRegister({
      sessionStoreInit: { 'gwn-sw-reloaded': '1' },
    });

    controllerChangeHandler();

    expect(mockReload).not.toHaveBeenCalled();
  });

  it('does not reload on initial SW install (no prior controller)', () => {
    const { controllerChangeHandler, mockReload } = loadSwRegister({
      hasExistingController: false,
    });

    controllerChangeHandler();

    expect(mockReload).not.toHaveBeenCalled();
  });

  it('still reloads once when sessionStorage throws (in-memory fallback)', () => {
    const { controllerChangeHandler, mockReload } = loadSwRegister({
      throwOnStorage: true,
    });

    controllerChangeHandler();
    expect(mockReload).toHaveBeenCalledTimes(1);

    // Second call should not reload — in-memory flag prevents loops
    controllerChangeHandler();
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
