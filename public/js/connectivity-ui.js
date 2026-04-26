/**
 * CS52-4 — Connectivity-banner + Ranked-entry-gate UI primitives.
 *
 * Pure DOM helpers shared between the production module (public/js/app.js)
 * and the unit tests (tests/cs52-4-connectivity-ui.test.js). Extracted so a
 * test can exercise the *real* implementation rather than a copy that can
 * silently drift.
 *
 * The CONNECTIVITY_BANNER_COPY map is the single source of truth for the
 * canonical banner strings from the CS52 design contract § Connectivity
 * state machine. Changing a string here changes both production rendering
 * and test assertions atomically.
 */

export const CONNECTIVITY_BANNER_COPY = {
  ok: null,
  'network-down': { text: 'Offline — your games still count', showSignIn: false },
  'auth-expired': { text: 'Signed out — sign in to save your games', showSignIn: true },
  'db-unavailable': { text: 'Online scoring paused — your games are queued', showSignIn: false },
};

/**
 * Render the connectivity banner inside `root` (a Document or Element with
 * #connectivity-banner). For state 'ok' the banner is hidden; otherwise the
 * banner becomes visible with the matching copy and Sign-in CTA.
 */
export function renderConnectivityBanner(root, stateName) {
  const el = root.getElementById
    ? root.getElementById('connectivity-banner')
    : root.querySelector('#connectivity-banner');
  if (!el) return;
  const copy = CONNECTIVITY_BANNER_COPY[stateName];
  if (!copy) {
    el.style.display = 'none';
    el.dataset.state = 'ok';
    return;
  }
  el.dataset.state = stateName;
  el.style.display = '';
  const textEl = el.querySelector('[data-bind="connectivity-banner-text"]');
  if (textEl) textEl.textContent = copy.text;
  const signInBtn = el.querySelector('[data-action="connectivity-sign-in"]');
  if (signInBtn) signInBtn.style.display = copy.showSignIn ? '' : 'none';
}

/**
 * Toggle the disabled state of every `[data-bind="ranked-entry"]` element
 * under `root`. When enabling, also clears `data-disabled-state` so stale
 * state can't leak into later UI logic or telemetry.
 */
export function applyRankedEntryGate(root, canRank, stateName) {
  const buttons = root.querySelectorAll('[data-bind="ranked-entry"]');
  buttons.forEach(btn => {
    if (canRank) {
      btn.removeAttribute('disabled');
      btn.classList.remove('ranked-disabled');
      btn.removeAttribute('aria-disabled');
      delete btn.dataset.disabledState;
    } else {
      btn.setAttribute('disabled', 'disabled');
      btn.classList.add('ranked-disabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.dataset.disabledState = stateName;
    }
  });
}
