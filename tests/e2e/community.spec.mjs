// @ts-check
import { test, expect } from '@playwright/test';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Community Discovery & Onboarding', () => {
  test('community section is visible on home screen when logged out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#community-section')).toBeVisible();
    await expect(page.locator('[data-action="browse-community"]')).toBeVisible();
    await expect(page.locator('[data-action="create-puzzle"]')).toBeVisible();
  });

  test('clicking create puzzle while logged out redirects to auth', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="create-puzzle"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
  });

  test('browse community button shows placeholder toast', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="browse-community"]');
    await expect(page.locator('.share-toast')).toContainText('coming soon');
  });

  test('create puzzle redirects to submit after login, onboarding shows and can be dismissed', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    // Navigate with feature flag, click create puzzle → redirected to auth
    await page.goto('/?ff_submit_puzzle=true');
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

    // Navigate away and come back — should stay hidden (persisted)
    await page.click('[data-screen="submit-puzzle"] [data-action="go-home"]');
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
    await expect(page.locator('#community-section')).toBeVisible();

    await page.click('[data-action="show-submit-puzzle"]');
    await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#submit-onboarding')).toBeHidden();
  });
});
