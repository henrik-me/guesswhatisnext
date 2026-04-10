// @ts-check
import { test, expect } from '@playwright/test';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Authentication', () => {
  test('clicking multiplayer without login redirects to auth screen', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-multiplayer"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
  });

  test('register new user and verify logged in', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    await page.goto('/');
    await page.click('[data-action="start-multiplayer"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);

    // Fill registration form
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');

    // After registration, app navigates to multiplayer screen
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Go home and verify username is displayed
    await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
    await expect(page.locator('[data-bind="home-user-label"]')).toContainText(username);
  });

  test('create puzzle button is hidden on community screen by default after registration', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    await page.goto('/');
    await page.click('[data-action="start-multiplayer"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
    await expect(page.locator('[data-bind="home-user-label"]')).toContainText(username);

    // Navigate to community screen — create puzzle should be hidden (feature flag off)
    await page.click('[data-action="show-community"]');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await expect(page.locator('[data-bind="community-create-btn"]')).toBeHidden();
  });

  test('session persists after reload (token in localStorage)', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    await page.goto('/');
    await page.click('[data-action="start-multiplayer"]');
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Reload the page
    await page.reload();
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/, { timeout: 5000 });

    // Username should still be visible (token persisted)
    await expect(page.locator('[data-bind="home-user-label"]')).toContainText(username);
  });

  test('logout clears user display', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    await page.goto('/');
    await page.click('[data-action="start-multiplayer"]');
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Go home to see logged-in state
    await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
    await expect(page.locator('[data-bind="home-user-label"]')).toContainText(username);

    // Logout
    await page.click('[data-action="logout"]');

    // Username label should be hidden or empty
    await expect(page.locator('[data-bind="home-user-label"]')).toBeHidden();
  });
});
