// @ts-check
import { test, expect } from '@playwright/test';
import { uniqueIP } from './helpers.mjs';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Register a new user via the top-bar → auth screen flow. */
async function registerUser(page, username, password) {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
  await page.click('[data-action="show-auth-login"]');
  await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
  await page.click('[data-action="auth-toggle-mode"]');
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await page.click('[data-action="auth-submit"]');
  // After registration, navigates to multiplayer (default) — go home
  await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, { timeout: 5000 });
  await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
  await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
}

test.describe('Authentication — Top Bar', () => {
  test('top bar shows login and register when not logged in', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-bind="auth-bar-logged-out"]')).toBeVisible();
    await expect(page.locator('[data-bind="auth-bar-logged-in"]')).toBeHidden();
  });

  test('clicking login in top bar shows auth screen', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-auth-login"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
  });

  test('register new user and verify top bar shows username', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');

    // Top bar should show logged-in state with username
    await expect(page.locator('[data-bind="auth-bar-logged-in"]')).toBeVisible();
    await expect(page.locator('[data-bind="auth-bar-username-text"]')).toContainText(username);
    await expect(page.locator('[data-bind="auth-bar-logged-out"]')).toBeHidden();
  });

  test('logout from top bar clears auth state', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');

    // Click logout in top bar
    await page.locator('[data-bind="auth-bar-logged-in"] [data-action="logout"]').click();

    // Should revert to logged-out state
    await expect(page.locator('[data-bind="auth-bar-logged-out"]')).toBeVisible();
    await expect(page.locator('[data-bind="auth-bar-logged-in"]')).toBeHidden();
  });

  test('session persists after reload (token in localStorage)', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');

    await page.reload();
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/, { timeout: 5000 });

    // Username should still be visible in top bar
    await expect(page.locator('[data-bind="auth-bar-username-text"]')).toContainText(username);
  });

  test('username in top bar navigates to profile', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');

    await page.click('[data-action="show-profile"]');
    await expect(page.locator('[data-screen="profile"]')).toHaveClass(/active/);
  });
});

test.describe('Authentication — Multiplayer Gating', () => {
  test('multiplayer button is hidden when not logged in', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="start-multiplayer"]')).toBeHidden();
  });

  test('multiplayer button is visible after login', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');
    await expect(page.locator('[data-action="start-multiplayer"]')).toBeVisible();
  });
});

test.describe('Authentication — Leaderboard Anonymous Access', () => {
  test('leaderboard loads without login', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    // Should not show the old "log in to view" error
    await expect(page.locator('.leaderboard-error')).toBeHidden({ timeout: 5000 });
  });
});

test.describe('Authentication — Profile Logout', () => {
  test('profile screen has logout button', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');

    await page.click('[data-action="show-profile"]');
    await expect(page.locator('[data-screen="profile"]')).toHaveClass(/active/);

    // Logout button should exist on profile page
    const logoutBtn = page.locator('[data-screen="profile"] [data-action="logout"]');
    await expect(logoutBtn).toBeVisible();

    await logoutBtn.click();
    // Should return to home, logged out
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
    await expect(page.locator('[data-bind="auth-bar-logged-out"]')).toBeVisible();
  });
});

test.describe('Authentication — Sign-in Banner', () => {
  test('sign-in banner appears when starting free play without login', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('.sign-in-banner')).toBeVisible();
  });

  test('sign-in banner can be dismissed', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('.sign-in-banner')).toBeVisible();

    await page.click('.sign-in-banner-dismiss');
    await expect(page.locator('.sign-in-banner')).toBeHidden();
  });
});

test.describe('Authentication — Community', () => {
  test('create puzzle button is hidden on community screen by default after registration', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await registerUser(page, username, 'testpass123');

    // Community button is hidden via display:none when flag is off (cs32),
    // dispatch click event directly
    await page.locator('[data-action="show-community"]').dispatchEvent('click');
    await expect(page.locator('[data-screen="community"]')).toHaveClass(/active/);
    await expect(page.locator('[data-bind="community-create-btn"]')).toBeHidden();
  });
});

test.describe('Authentication — Cold Start Progressive Feedback', () => {
  test('submit button shows progressive messages during slow login', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');

    // Navigate to auth screen and fill form
    await page.click('[data-action="show-auth-login"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.fill('#auth-username', 'slowuser');
    await page.fill('#auth-password', 'testpass123');

    // Intercept login request and delay it by 6 seconds
    let resolveLogin;
    const loginPromise = new Promise((r) => { resolveLogin = r; });
    await page.route('**/api/auth/login', async (route) => {
      await loginPromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'fake-token', user: { username: 'slowuser', role: 'user' } }),
      });
    });

    // Click submit
    await page.click('[data-action="auth-submit"]');

    // Immediately: button should say "Signing in…"
    const submitBtn = page.locator('[data-bind="auth-submit-btn"]');
    await expect(submitBtn).toContainText('Signing in');

    // Button and inputs should be disabled
    await expect(submitBtn).toBeDisabled();
    await expect(page.locator('#auth-username')).toBeDisabled();
    await expect(page.locator('#auth-password')).toBeDisabled();

    // Auth screen should have submitting class
    await expect(page.locator('#screen-auth')).toHaveClass(/auth-submitting/);

    // Wait for the second message at 4s
    await page.waitForTimeout(4200);
    await expect(submitBtn).toContainText('Still working on it');

    // Resolve the login request
    resolveLogin();

    // After success, button text should be restored and elements re-enabled
    await expect(page.locator('#screen-auth')).not.toHaveClass(/auth-submitting/, { timeout: 5000 });
  });

  test('submit button shows register messages during slow registration', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');

    await page.click('[data-action="show-auth-login"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.click('[data-action="auth-toggle-mode"]');
    await page.fill('#auth-username', uniqueUser());
    await page.fill('#auth-password', 'testpass123');

    let resolveRegister;
    const registerPromise = new Promise((r) => { resolveRegister = r; });
    await page.route('**/api/auth/register', async (route) => {
      await registerPromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'fake-token', user: { username: 'reguser', role: 'user' } }),
      });
    });

    await page.click('[data-action="auth-submit"]');

    const submitBtn = page.locator('[data-bind="auth-submit-btn"]');
    await expect(submitBtn).toContainText('Creating your account');
    await expect(submitBtn).toBeDisabled();

    // Resolve
    resolveRegister();
    await expect(page.locator('#screen-auth')).not.toHaveClass(/auth-submitting/, { timeout: 5000 });
  });

  test('form re-enables on auth error', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');

    await page.click('[data-action="show-auth-login"]');
    await page.fill('#auth-username', 'baduser');
    await page.fill('#auth-password', 'badpass');

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      });
    });

    await page.click('[data-action="auth-submit"]');

    // After error, form should be re-enabled
    const submitBtn = page.locator('[data-bind="auth-submit-btn"]');
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await expect(page.locator('#auth-username')).toBeEnabled();
    await expect(page.locator('#auth-password')).toBeEnabled();
    await expect(page.locator('#screen-auth')).not.toHaveClass(/auth-submitting/);

    // Error message should be shown
    await expect(page.locator('[data-bind="auth-error"]')).toContainText('Invalid credentials');
  });

  test('double-click on submit does not send duplicate requests', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');

    await page.click('[data-action="show-auth-login"]');
    await page.fill('#auth-username', 'dbluser');
    await page.fill('#auth-password', 'testpass123');

    let requestCount = 0;
    await page.route('**/api/auth/login', async (route) => {
      requestCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'fake-token', user: { username: 'dbluser', role: 'user' } }),
      });
    });

    // Rapidly click submit twice
    await page.click('[data-action="auth-submit"]');
    await page.click('[data-action="auth-submit"]');

    // Wait for navigation to complete
    await page.waitForTimeout(1000);

    expect(requestCount).toBe(1);
  });
});

