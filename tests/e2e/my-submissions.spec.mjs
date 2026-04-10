// @ts-check
import { test, expect } from '@playwright/test';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Generate a unique IP to avoid rate-limit collisions across tests. */
let ipCounter = 0;
function uniqueIP() {
  ipCounter++;
  return `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
}

/** Register a new user and return to home screen. Uses unique IP per call to avoid rate limits. */
async function registerAndGoHome(page, username, password, url = '/') {
  const ip = uniqueIP();
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });
  await page.goto(url);
  await page.click('[data-action="start-multiplayer"]');
  await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await page.click('[data-action="auth-register"]');
  await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, { timeout: 5000 });
  await page.click('#screen-multiplayer [data-action="go-home"]');
  await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
}

test.describe('My Submissions Dashboard', () => {
  test('my submissions button is hidden when logged out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-bind="my-submissions-btn"]')).toBeHidden();
  });

  test('my submissions button is visible when logged in', async ({ page }) => {
    const username = uniqueUser();
    await registerAndGoHome(page, username, 'testpass123');
    await expect(page.locator('[data-bind="my-submissions-btn"]')).toBeVisible();
  });

  test('navigate to my submissions, see empty state, and return home with back button', async ({ page }) => {
    const username = uniqueUser();
    await registerAndGoHome(page, username, 'testpass123');

    await page.click('[data-bind="my-submissions-btn"]');
    await expect(page.locator('[data-screen="my-submissions"]')).toHaveClass(/active/, { timeout: 5000 });

    // Empty state visible
    await expect(page.locator('.my-submissions-empty')).toBeVisible();
    await expect(page.locator('.my-submissions-empty-text')).toContainText('No submissions yet');

    // CTA button links to create puzzle
    await expect(page.locator('.my-submissions-empty [data-action="create-puzzle"]')).toBeVisible();

    // Back button returns to home
    await page.click('#screen-my-submissions [data-action="go-home"]');
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
  });

  test('submit a puzzle and see it in my submissions with pending status', async ({ page }) => {
    const username = uniqueUser();
    await registerAndGoHome(page, username, 'testpass123', '/?ff_submit_puzzle=true');

    // Navigate to submit puzzle screen (flag enabled via URL on initial load)
    await page.click('[data-action="show-submit-puzzle"]');
    await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });

    // Fill in the form
    await page.selectOption('#sp-category', 'Nature');
    await page.selectOption('#sp-difficulty', '2');
    await page.fill('#sp-sequence', '🌑, 🌒, 🌓, 🌔');
    await page.fill('#sp-answer', '🌕');
    await page.fill('#sp-explanation', 'Moon phases in order');

    // Submit
    await page.click('#submit-puzzle-form button[type="submit"]');

    // Wait for success message with "View My Submissions" link
    await expect(page.locator('[data-bind="submit-puzzle-status"]')).toContainText('submitted for review', { timeout: 5000 });
    await expect(page.locator('[data-bind="submit-puzzle-status"] .btn-link')).toContainText('View My Submissions');

    // Click the post-submit link to go to my submissions
    await page.click('[data-bind="submit-puzzle-status"] [data-action="show-my-submissions"]');
    await expect(page.locator('[data-screen="my-submissions"]')).toHaveClass(/active/, { timeout: 5000 });

    // Should see the submission card with pending status
    await expect(page.locator('.submission-card')).toHaveCount(1);
    await expect(page.locator('.submission-status-badge')).toContainText('Pending');
    await expect(page.locator('.submission-sequence-preview')).toContainText('🌑');
    await expect(page.locator('.submission-category-badge')).toContainText('Nature');
    await expect(page.locator('.submission-difficulty')).toContainText('★★☆');
    await expect(page.locator('.submission-card-dates')).toContainText(/just now|\d+\s+minute(?:s)?\s+ago/);
  });

  test('view my submissions link on submit screen navigates correctly', async ({ page }) => {
    const username = uniqueUser();
    await registerAndGoHome(page, username, 'testpass123', '/?ff_submit_puzzle=true');

    // Navigate to submit puzzle screen
    await page.click('[data-action="show-submit-puzzle"]');
    await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });

    // Click "View My Submissions" link below form
    await page.click('.submit-puzzle-links [data-action="show-my-submissions"]');
    await expect(page.locator('[data-screen="my-submissions"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('.my-submissions-empty')).toBeVisible();
  });
});
