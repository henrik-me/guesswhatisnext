// @ts-check
import { test, expect } from '@playwright/test';

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

/** Create a unique test username. */
function uniqueUser() {
  return `mod${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Create a submission via the API and return its ID. */
async function createSubmission(request, token) {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const res = await request.post('/api/submissions?ff_submit_puzzle=1', {
    data: {
      sequence: ['🔵', '🟢', '🟡'],
      answer: '🔴',
      explanation: 'Color test sequence.',
      difficulty: 1,
      category: 'Colors & Patterns',
      options: ['🔴', '🟠', '🟣', '⚫'],
    },
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
    },
  });
  const body = await res.json();
  return body.id;
}

test.describe('Admin Moderation Improvements', () => {
  let userToken;

  test.beforeAll(async ({ request }) => {
    const username = uniqueUser();
    const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const res = await request.post('/api/auth/register', {
      data: { username, password: 'testpass123' },
      headers: { 'X-Forwarded-For': ip },
    });
    const body = await res.json();
    userToken = body.token;
  });

  test('preview renders in moderation queue', async ({ page, request }) => {
    // Create a submission
    await createSubmission(request, userToken);

    // Inject system auth (admin role) to access moderation
    await page.addInitScript(() => {
      localStorage.setItem('gwn_auth_token', 'system');
      localStorage.setItem('gwn_auth_username', 'system');
      localStorage.setItem('gwn_auth_role', 'system');
    });

    // Override apiFetch to include system API key
    await page.addInitScript((key) => {
      const origFetch = window.fetch;
      window.fetch = function (url, options = {}) {
        options.headers = options.headers || {};
        if (typeof options.headers === 'object' && !Array.isArray(options.headers)) {
          options.headers['X-API-Key'] = key;
        }
        return origFetch.call(this, url, options);
      };
    }, SYSTEM_KEY);

    await page.goto('/');
    // Click moderation button
    await page.click('[data-action="show-moderation"]');
    await expect(page.locator('[data-screen="moderation"]')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for submissions to load
    await expect(page.locator('.moderation-card').first()).toBeVisible({ timeout: 10000 });

    // Click preview toggle
    const firstPreviewBtn = page.locator('[data-mod-toggle-preview]').first();
    await firstPreviewBtn.click();

    // Preview should be visible with sequence items
    const preview = page.locator('.mod-card-preview').first();
    await expect(preview).toBeVisible();
    await expect(preview.locator('.preview-sequence-item').first()).toBeVisible();
    await expect(preview.locator('.preview-question')).toContainText('What comes next?');
  });

  test('bulk approve flow works', async ({ page, request }) => {
    // Create multiple submissions so the queue has items to select
    await createSubmission(request, userToken);
    await createSubmission(request, userToken);

    // Inject system auth
    await page.addInitScript(() => {
      localStorage.setItem('gwn_auth_token', 'system');
      localStorage.setItem('gwn_auth_username', 'system');
      localStorage.setItem('gwn_auth_role', 'system');
    });

    await page.addInitScript((key) => {
      const origFetch = window.fetch;
      window.fetch = function (url, options = {}) {
        options.headers = options.headers || {};
        if (typeof options.headers === 'object' && !Array.isArray(options.headers)) {
          options.headers['X-API-Key'] = key;
        }
        return origFetch.call(this, url, options);
      };
    }, SYSTEM_KEY);

    await page.goto('/');
    await page.click('[data-action="show-moderation"]');
    await expect(page.locator('[data-screen="moderation"]')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for cards to load
    await expect(page.locator('.moderation-card').first()).toBeVisible({ timeout: 10000 });

    // Select first two submissions using checkboxes
    const checkboxes = page.locator('.mod-card-checkbox');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Bulk action bar should be visible
    const bulkBar = page.locator('[data-bind="mod-bulk-actions"]');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.locator('[data-bind="mod-bulk-count"]')).toContainText('2 selected');

    // Auto-confirm dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click bulk approve
    await bulkBar.locator('[data-action="bulk-approve"]').click();

    // Status message should appear
    await expect(page.locator('[data-bind="moderation-status"]')).toContainText(/approved/, { timeout: 10000 });
  });
});
