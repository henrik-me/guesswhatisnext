// @ts-check
import { test, expect } from '@playwright/test';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Generate a unique IP to avoid rate-limit collisions across tests and spec files. */
const ipSeed = ((Date.now() & 0xffff) ^ Math.floor(Math.random() * 0xffff)) >>> 0;
const ipBaseSecondOctet = (ipSeed % 254) + 1;
const ipBaseThirdOctet = Math.floor(ipSeed / 256) % 256;
let ipCounter = 0;
function uniqueIP() {
  const offset = ipCounter++;
  const thirdOctet = (ipBaseThirdOctet + Math.floor(offset / 254)) % 256;
  const fourthOctet = (offset % 254) + 1;
  return `10.${ipBaseSecondOctet}.${thirdOctet}.${fourthOctet}`;
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

  test('edit a pending submission inline', async ({ page, request }) => {
    const username = uniqueUser();
    const password = 'testpass123';
    const ip = uniqueIP();

    // Register via API
    const regRes = await request.post('/api/auth/register', {
      data: { username, password },
      headers: { 'X-Forwarded-For': ip },
    });
    expect(regRes.ok()).toBeTruthy();
    const { token } = await regRes.json();

    // Create a submission via API
    const subRes = await request.post('/api/submissions?ff_submit_puzzle=1', {
      data: {
        sequence: ['🌑', '🌒', '🌓'],
        answer: '🌔',
        explanation: 'Moon phases in order',
        difficulty: 2,
        category: 'Nature',
      },
      headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip },
    });
    expect(subRes.ok()).toBeTruthy();

    // Inject auth and navigate to my-submissions
    await page.addInitScript(({ t, u }) => {
      localStorage.setItem('gwn_auth_token', t);
      localStorage.setItem('gwn_auth_username', u);
    }, { t: token, u: username });

    await page.goto('/?ff_submit_puzzle=true');
    await page.click('[data-bind="my-submissions-btn"]');
    await expect(page.locator('[data-screen="my-submissions"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('.submission-card')).toHaveCount(1, { timeout: 5000 });

    // Click edit button
    await page.click('[data-action="edit-submission"]');
    await expect(page.locator('.submission-edit-form')).toBeVisible({ timeout: 3000 });

    // Change category from Nature to Music (visible on card after save)
    await page.selectOption('.edit-category', 'Music');
    await page.click('[data-action="save-edit-submission"]');

    // After save, submissions list reloads with updated category
    await expect(page.locator('.submission-card')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.submission-edit-form')).toHaveCount(0);
    await expect(page.locator('.submission-category-badge')).toContainText('Music');
  });

  test('delete a submission with confirmation', async ({ page, request }) => {
    const username = uniqueUser();
    const password = 'testpass123';
    const ip = uniqueIP();

    // Register via API
    const regRes = await request.post('/api/auth/register', {
      data: { username, password },
      headers: { 'X-Forwarded-For': ip },
    });
    expect(regRes.ok()).toBeTruthy();
    const { token } = await regRes.json();

    // Create a submission via API
    const subRes = await request.post('/api/submissions?ff_submit_puzzle=1', {
      data: {
        sequence: ['🌱', '🌿', '🌳'],
        answer: '🌲',
        explanation: 'Plants growing',
        difficulty: 1,
        category: 'Nature',
      },
      headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip },
    });
    expect(subRes.ok()).toBeTruthy();

    // Inject auth and navigate to my-submissions
    await page.addInitScript(({ t, u }) => {
      localStorage.setItem('gwn_auth_token', t);
      localStorage.setItem('gwn_auth_username', u);
    }, { t: token, u: username });

    await page.goto('/');
    await page.click('[data-bind="my-submissions-btn"]');
    await expect(page.locator('[data-screen="my-submissions"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('.submission-card')).toHaveCount(1, { timeout: 5000 });

    // Click delete button — confirmation should appear
    await page.click('[data-action="delete-submission"]');
    await expect(page.locator('.submission-delete-confirm')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.delete-confirm-text')).toContainText('cannot be undone');

    // Confirm deletion
    await page.click('[data-action="confirm-delete-submission"]');

    // Card should be removed
    await expect(page.locator('.submission-card')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.my-submissions-empty')).toBeVisible();
  });

  test('cancel delete does not remove the submission', async ({ page, request }) => {
    const username = uniqueUser();
    const password = 'testpass123';
    const ip = uniqueIP();

    // Register via API
    const regRes = await request.post('/api/auth/register', {
      data: { username, password },
      headers: { 'X-Forwarded-For': ip },
    });
    expect(regRes.ok()).toBeTruthy();
    const { token } = await regRes.json();

    // Create a submission via API
    const subRes = await request.post('/api/submissions?ff_submit_puzzle=1', {
      data: {
        sequence: ['🐕', '🐈', '🐟'],
        answer: '🐦',
        explanation: 'Common pets',
        difficulty: 1,
        category: 'Nature',
      },
      headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip },
    });
    expect(subRes.ok()).toBeTruthy();

    // Inject auth and navigate to my-submissions
    await page.addInitScript(({ t, u }) => {
      localStorage.setItem('gwn_auth_token', t);
      localStorage.setItem('gwn_auth_username', u);
    }, { t: token, u: username });

    await page.goto('/');
    await page.click('[data-bind="my-submissions-btn"]');
    await expect(page.locator('[data-screen="my-submissions"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('.submission-card')).toHaveCount(1, { timeout: 5000 });

    // Click delete, then cancel
    await page.click('[data-action="delete-submission"]');
    await expect(page.locator('.submission-delete-confirm')).toBeVisible({ timeout: 3000 });
    await page.click('[data-action="cancel-delete-submission"]');

    // Confirmation should be gone, card still there
    await expect(page.locator('.submission-delete-confirm')).toHaveCount(0);
    await expect(page.locator('.submission-card')).toHaveCount(1);
  });
});
