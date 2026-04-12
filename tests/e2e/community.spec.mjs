// @ts-check
import { test, expect } from '@playwright/test';
import { uniqueIP } from './helpers.mjs';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Community Discovery & Onboarding', () => {
  test('community puzzles button is visible on home screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="show-community"]')).toBeVisible();
  });

  test('community screen shows browse button, create puzzle hidden by default', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await expect(page.locator('[data-action="browse-community"]')).toBeVisible();
    // Create button is hidden when feature flag is off (default)
    await expect(page.locator('[data-bind="community-create-btn"]')).toBeHidden();
  });

  test('clicking create puzzle while logged out redirects to auth', async ({ page }) => {
    await page.goto('/?ff_submit_puzzle=true');
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="create-puzzle"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
  });

  test('browse community button opens gallery screen', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="browse-community"]');
    await expect(page.locator('[data-screen="community-gallery"]')).toHaveClass(/active/);
    await expect(page.locator('[data-screen="community-gallery"] h2')).toContainText('Community Puzzles');
  });

  test('create puzzle redirects to submit after login, onboarding shows and can be dismissed', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    // Navigate with feature flag, go to community, click create puzzle → redirected to auth
    await page.goto('/?ff_submit_puzzle=true');
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="create-puzzle"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);

    // Register → should auto-redirect to submit-puzzle (return URL)
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');
    await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });

    // Onboarding should be visible on first visit
    await expect(page.locator('#submit-onboarding')).toBeVisible();
    await expect(page.locator('.onboarding-steps')).toBeVisible();
    await expect(page.locator('.onboarding-text')).toContainText('Submit a puzzle sequence');

    // Toggle collapse/expand
    await page.click('[data-action="toggle-onboarding"]');
    await expect(page.locator('#submit-onboarding')).toHaveClass(/collapsed/);
    await expect(page.locator('.onboarding-content')).toBeHidden();

    await page.click('[data-action="toggle-onboarding"]');
    await expect(page.locator('#submit-onboarding')).not.toHaveClass(/collapsed/);
    await expect(page.locator('.onboarding-content')).toBeVisible();

    // Dismiss onboarding
    await page.click('[data-action="dismiss-onboarding"]');
    await expect(page.locator('#submit-onboarding')).toBeHidden();

    // Navigate back to community, then home
    await page.click('[data-screen="submit-puzzle"] [data-action="go-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);

    // Navigate to create puzzle again from community
    await page.click('[data-action="create-puzzle"]');
    await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#submit-onboarding')).toBeHidden();
  });
});

test.describe('Enhanced Puzzle Authoring Form', () => {
  let username;
  const password = 'testpass123';

  test.beforeEach(async ({ page, request }) => {
    username = uniqueUser();
    // Register via API with a unique IP to avoid hitting the shared rate limiter
    const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const res = await request.post('/api/auth/register', {
      data: { username, password },
      headers: { 'X-Forwarded-For': ip },
    });
    expect(res.ok()).toBeTruthy();
    const { token } = await res.json();

    // Inject auth into localStorage before page scripts run
    await page.addInitScript(({ t, u }) => {
      localStorage.setItem('gwn_auth_token', t);
      localStorage.setItem('gwn_auth_username', u);
    }, { t: token, u: username });

    await page.goto('/?ff_submit_puzzle=true');
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="create-puzzle"]');
    await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('type selector defaults to emoji, can switch to text', async ({ page }) => {
    // Emoji is selected by default
    await expect(page.locator('.type-card[data-type="emoji"]')).toHaveClass(/active/);
    await expect(page.locator('.type-card[data-type="text"]')).not.toHaveClass(/active/);

    // Click text type
    await page.click('.type-card[data-type="text"]');
    await expect(page.locator('.type-card[data-type="text"]')).toHaveClass(/active/);
    await expect(page.locator('.type-card[data-type="emoji"]')).not.toHaveClass(/active/);
  });

  test('image type is enabled and toggles image uploaders', async ({ page }) => {
    const imageCard = page.locator('.type-card[data-type="image"]');
    await expect(imageCard).not.toHaveClass(/disabled/);
    await expect(imageCard.locator('input[type="radio"]')).toBeEnabled();

    // Click image type
    await page.click('.type-card[data-type="image"]');
    await expect(imageCard).toHaveClass(/active/);

    // Text sequence/answer fields should be hidden
    await expect(page.locator('#sp-sequence-group')).toBeHidden();
    await expect(page.locator('#sp-answer-group')).toBeHidden();

    // Image upload sections should be visible
    await expect(page.locator('#sp-image-sequence-group')).toBeVisible();
    await expect(page.locator('#sp-image-answer-group')).toBeVisible();
    await expect(page.locator('#sp-image-distractors-group')).toBeVisible();

    // Switch back to emoji — text fields reappear
    await page.click('.type-card[data-type="emoji"]');
    await expect(page.locator('#sp-sequence-group')).toBeVisible();
    await expect(page.locator('#sp-answer-group')).toBeVisible();
    await expect(page.locator('#sp-image-sequence-group')).toBeHidden();
  });

  test('options editor and preview update on input', async ({ page }) => {
    // Fill in sequence
    await page.fill('#sp-sequence', '1, 2, 3');
    await page.fill('#sp-answer', '4');

    // Preview should show sequence items (assertions auto-wait for debounced update)
    const preview = page.locator('#puzzle-preview');
    await expect(preview.locator('.preview-sequence-item').first()).toBeVisible();
    await expect(preview.locator('.preview-question')).toContainText('What comes next?');

    // First option should be auto-populated with answer
    const firstOption = page.locator('.option-input[data-option="0"]');
    await expect(firstOption).toHaveValue('4');

    // Fill remaining options
    await page.fill('.option-input[data-option="1"]', '5');
    await page.fill('.option-input[data-option="2"]', '6');
    await page.fill('.option-input[data-option="3"]', '7');

    // Preview options should appear (assertions auto-wait)
    await expect(preview.locator('.preview-option-btn')).toHaveCount(4);
    // The correct answer should be highlighted
    await expect(preview.locator('.preview-option-btn.correct')).toBeVisible();
  });

  test('submit with custom options stores correctly', async ({ page }) => {
    // Fill all fields
    await page.selectOption('#sp-category', 'Nature');
    await page.selectOption('#sp-difficulty', '1');
    await page.fill('#sp-sequence', '🌑, 🌒, 🌓');
    await page.fill('#sp-answer', '🌔');

    // Wait for answer auto-sync to first option
    await expect(page.locator('.option-input[data-option="0"]')).toHaveValue('🌔', { timeout: 2000 });

    await page.fill('.option-input[data-option="1"]', '🌕');
    await page.fill('.option-input[data-option="2"]', '🌖');
    await page.fill('.option-input[data-option="3"]', '🌗');
    await page.fill('#sp-explanation', 'Moon phases progress.');

    // Submit button should be enabled
    const submitBtn = page.locator('#sp-submit-btn');
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });

    // Submit the form
    await submitBtn.click();

    // Should show success message
    await expect(page.locator('[data-bind="submit-puzzle-status"]')).toContainText('submitted for review', { timeout: 10000 });
  });
});

test.describe('Community Gallery', () => {
  test('gallery screen shows empty state when no community puzzles', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await page.click('[data-action="browse-community"]');
    await expect(page.locator('[data-screen="community-gallery"]')).toHaveClass(/active/);

    // Should show empty state or loading (empty state because no community puzzles in fresh DB)
    await expect(page.locator('.gallery-empty, .gallery-grid .gallery-card')).toBeVisible({ timeout: 5000 });
  });

  test('gallery has filter controls', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-community"]');
    await page.click('[data-action="browse-community"]');
    await expect(page.locator('[data-screen="community-gallery"]')).toHaveClass(/active/);

    // Category filter dropdown
    await expect(page.locator('#gallery-category-filter')).toBeVisible();

    // Difficulty filter buttons
    await expect(page.locator('[data-gallery-difficulty="all"]')).toBeVisible();
    await expect(page.locator('[data-gallery-difficulty="1"]')).toBeVisible();
    await expect(page.locator('[data-gallery-difficulty="2"]')).toBeVisible();
    await expect(page.locator('[data-gallery-difficulty="3"]')).toBeVisible();
  });

  test('gallery back button returns to community screen', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-community"]');
    await page.click('[data-action="browse-community"]');
    await expect(page.locator('[data-screen="community-gallery"]')).toHaveClass(/active/);

    await page.click('#screen-community-gallery [data-action="go-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
  });

  test('gallery renders cards when community puzzles exist', async ({ page, request }) => {
    const username = uniqueUser();
    const password = 'testpass123';
    const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    // Register user
    const regRes = await request.post('/api/auth/register', {
      data: { username, password },
      headers: { 'X-Forwarded-For': ip },
    });
    expect(regRes.ok()).toBeTruthy();

    // Submit a puzzle via API with feature flag override
    const { token } = await regRes.json();
    const subRes = await request.post('/api/submissions?ff_submit_puzzle=1', {
      data: {
        sequence: ['🐱', '🐶', '🐭'],
        answer: '🐹',
        explanation: 'Small pets',
        difficulty: 1,
        category: 'Animals',
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(subRes.ok()).toBeTruthy();
    const { id: submissionId } = await subRes.json();

    // Approve the submission via system API
    const systemKey = 'test-system-api-key';
    const reviewRes = await request.put(`/api/submissions/${submissionId}/review`, {
      data: { status: 'approved' },
      headers: { 'X-API-Key': systemKey },
    });
    expect(reviewRes.ok()).toBeTruthy();

    // Now visit the gallery via community screen
    await page.goto('/');
    await page.click('[data-action="show-community"]');
    await page.click('[data-action="browse-community"]');
    await expect(page.locator('[data-screen="community-gallery"]')).toHaveClass(/active/);

    // Gallery cards should appear
    await expect(page.locator('.gallery-card').first()).toBeVisible({ timeout: 5000 });

    // Card should show author attribution
    await expect(page.locator('.gallery-card-author').first()).toContainText('By:');

    // Card should have a play button
    await expect(page.locator('.gallery-card-play').first()).toBeVisible();
  });
});
