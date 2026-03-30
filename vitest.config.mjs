import { defineConfig } from 'vitest/config';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 10000,
    // Each test file runs in its own forked process for DB isolation
    isolate: true,
    // Exclude Playwright E2E tests from vitest while keeping defaults
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
