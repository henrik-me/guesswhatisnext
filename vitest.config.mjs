import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 10000,
    // Each test file runs in its own forked process for DB isolation
    isolate: true,
  },
});
