// @ts-check
import { test, expect } from '@playwright/test';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Community Discovery & Onboarding', () => {
  test.describe('Community section visibility', () => {
    test('community section is visible on home screen when logged out', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#community-section')).toBeVisible();
      await expect(page.locator('[data-action="browse-community"]')).toBeVisible();
      await expect(page.locator('[data-action="create-puzzle"]')).toBeVisible();
    });

    test('community section is visible on home screen when logged in', async ({ page }) => {
      const username = uniqueUser();
      const password = 'testpass123';

      await page.goto('/');
      await page.click('[data-action="start-multiplayer"]');
      await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
      await page.fill('#auth-username', username);
      await page.fill('#auth-password', password);
      await page.click('[data-action="auth-register"]');
      await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, { timeout: 5000 });

      await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
      await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
      await expect(page.locator('#community-section')).toBeVisible();
    });
  });

  test.describe('Create puzzle — logged out redirect', () => {
    test('clicking create puzzle while logged out redirects to auth', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-action="create-puzzle"]');
      await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    });

    test('after login, redirects to submit screen when flag is enabled', async ({ page }) => {
      const username = uniqueUser();
      const password = 'testpass123';

      // Enable submitPuzzle flag via query param
      await page.goto('/?ff_submitPuzzle=true');
      await page.click('[data-action="create-puzzle"]');
      await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);

      await page.fill('#auth-username', username);
      await page.fill('#auth-password', password);
      await page.click('[data-action="auth-register"]');
      await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });
    });
  });

  test.describe('Onboarding explainer', () => {
    test('onboarding shows on first visit to submit screen', async ({ page }) => {
      const username = uniqueUser();
      const password = 'testpass123';

      await page.goto('/?ff_submitPuzzle=true');
      await page.click('[data-action="create-puzzle"]');
      await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);

      await page.fill('#auth-username', username);
      await page.fill('#auth-password', password);
      await page.click('[data-action="auth-register"]');
      await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });

      await expect(page.locator('#submit-onboarding')).toBeVisible();
      await expect(page.locator('.onboarding-steps')).toBeVisible();
      await expect(page.locator('.onboarding-text')).toContainText('Submit a puzzle sequence');
    });

    test('onboarding hides after dismiss and stays hidden on revisit', async ({ page }) => {
      const username = uniqueUser();
      const password = 'testpass123';

      await page.goto('/?ff_submitPuzzle=true');
      await page.click('[data-action="create-puzzle"]');
      await page.fill('#auth-username', username);
      await page.fill('#auth-password', password);
      await page.click('[data-action="auth-register"]');
      await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });

      await expect(page.locator('#submit-onboarding')).toBeVisible();
      await page.click('[data-action="dismiss-onboarding"]');
      await expect(page.locator('#submit-onboarding')).toBeHidden();

      // Navigate away and come back
      await page.click('[data-screen="submit-puzzle"] [data-action="go-home"]');
      await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
      await page.click('[data-action="create-puzzle"]');
      await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });
      await expect(page.locator('#submit-onboarding')).toBeHidden();
    });

    test('onboarding can be collapsed and expanded via toggle', async ({ page }) => {
      const username = uniqueUser();
      const password = 'testpass123';

      await page.goto('/?ff_submitPuzzle=true');
      await page.click('[data-action="create-puzzle"]');
      await page.fill('#auth-username', username);
      await page.fill('#auth-password', password);
      await page.click('[data-action="auth-register"]');
      await expect(page.locator('[data-screen="submit-puzzle"]')).toHaveClass(/active/, { timeout: 5000 });

      await expect(page.locator('.onboarding-content')).toBeVisible();

      // Collapse
      await page.click('[data-action="toggle-onboarding"]');
      await expect(page.locator('#submit-onboarding')).toHaveClass(/collapsed/);
      await expect(page.locator('.onboarding-content')).toBeHidden();

      // Expand
      await page.click('[data-action="toggle-onboarding"]');
      await expect(page.locator('#submit-onboarding')).not.toHaveClass(/collapsed/);
      await expect(page.locator('.onboarding-content')).toBeVisible();
    });
  });

  test.describe('Browse community', () => {
    test('browse community button shows placeholder toast', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-action="browse-community"]');
      await expect(page.locator('.share-toast')).toContainText('coming soon');
    });
  });
});
