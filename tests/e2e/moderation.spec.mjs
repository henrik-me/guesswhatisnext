// @ts-check
import { test, expect } from '@playwright/test';

const SYSTEM_KEY = 'test-system-api-key';

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
  if (!res.ok()) throw new Error(`createSubmission failed: ${res.status()} ${JSON.stringify(body)}`);
  if (!body.id) throw new Error('createSubmission: missing id in response');
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
    if (!res.ok()) throw new Error(`Registration failed: ${res.status()} ${JSON.stringify(body)}`);
    if (!body.token) throw new Error('Registration: missing token in response');
    userToken = body.token;
  });

  test('preview renders in moderation queue', async ({ page, request }) => {
    // Create a submission and capture its ID
    const submissionId = await createSubmission(request, userToken);

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
    // Navigate to community screen, then click moderation
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="show-moderation"]');
    await expect(page.locator('[data-screen="moderation"]')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for the specific submission card to load
    const card = page.locator(`[data-submission-id="${submissionId}"]`);
    await expect(card).toBeVisible({ timeout: 10000 });

    // Click preview toggle on the specific card
    await card.locator('[data-mod-toggle-preview]').click();

    // Preview should be visible with sequence items
    const preview = card.locator('.mod-card-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.preview-sequence-item').first()).toBeVisible();
    await expect(preview.locator('.preview-question')).toContainText('What comes next?');
  });

  test('bulk approve flow works', async ({ page, request }) => {
    // Create multiple submissions and capture their IDs
    const id1 = await createSubmission(request, userToken);
    const id2 = await createSubmission(request, userToken);

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
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="show-moderation"]');
    await expect(page.locator('[data-screen="moderation"]')).toHaveClass(/active/, { timeout: 5000 });

    // Wait for the specific submission cards to load
    const card1 = page.locator(`[data-submission-id="${id1}"]`);
    const card2 = page.locator(`[data-submission-id="${id2}"]`);
    await expect(card1).toBeVisible({ timeout: 10000 });
    await expect(card2).toBeVisible({ timeout: 10000 });

    // Select both submissions using their specific checkboxes
    await card1.locator('.mod-card-checkbox').check();
    await card2.locator('.mod-card-checkbox').check();

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
