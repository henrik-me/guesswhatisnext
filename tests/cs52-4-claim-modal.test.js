/**
 * CS52-4 — Claim prompt modal unit tests.
 *
 * Drives the production showClaimPromptModal() helper from
 * public/js/claim-modal.js against an ad-hoc DOM stand-in (vitest in this
 * project runs in node mode without jsdom; the helper only uses the small
 * subset of DOM that we implement here). Re-using the same export app.js
 * imports means these tests can't drift from production.
 *
 * Covers:
 *   1. Focus is trapped on Tab/Shift+Tab between Decline and Accept.
 *   2. Escape resolves the promise with 'decline'.
 *   3. Enter resolves with 'accept' regardless of focused button.
 *   4. Backdrop click resolves with 'decline'.
 *   5. claim_prompt_{shown,accepted,declined} telemetry fires once each.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- Tiny DOM stand-in ---------------------------------------------------
// We build only what showClaimPromptModal touches: createElement, append/
// remove, addEventListener/removeEventListener, focus tracking, and a
// document.body / document.activeElement stub.

let infoSpy;

function makeEl(tagName) {
  const listeners = new Map(); // event -> Set<handler>
  const children = [];
  const attrs = new Map();
  const el = {
    tagName: String(tagName).toUpperCase(),
    nodeType: 1,
    children,
    parentNode: null,
    className: '',
    id: '',
    type: '',
    textContent: '',
    style: {},
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    remove() {
      if (el.parentNode) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx >= 0) el.parentNode.children.splice(idx, 1);
        el.parentNode = null;
      }
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },
    dispatchEvent(evt) {
      const set = listeners.get(evt.type);
      if (!set) return;
      for (const fn of Array.from(set)) fn(evt);
    },
    focus() { document.activeElement = el; },
    // Minimal click() so .click() === dispatch a 'click' event with target=self.
    click() {
      el.dispatchEvent({ type: 'click', target: el, preventDefault() {} });
    },
  };
  return el;
}

function installDom() {
  const body = makeEl('body');
  global.document = {
    body,
    activeElement: null,
    createElement: (tag) => makeEl(tag),
  };
}

function findByAction(root, action) {
  if (root.getAttribute && root.getAttribute('data-action') === action) return root;
  for (const c of root.children || []) {
    const found = findByAction(c, action);
    if (found) return found;
  }
  return null;
}

// Send a keydown directly to the backdrop element (the modal listens there).
function keydown(backdrop, key, opts = {}) {
  const evt = {
    type: 'keydown',
    key,
    shiftKey: !!opts.shiftKey,
    target: opts.target || backdrop,
    preventDefault: vi.fn(),
  };
  backdrop.dispatchEvent(evt);
  return evt;
}

let showClaimPromptModal;

beforeEach(async () => {
  installDom();
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  // Re-import after global.document is set so any module-level references
  // see the stand-in. (claim-modal.js doesn't capture document at import
  // time, but be defensive about cache-state across tests.)
  vi.resetModules();
  ({ showClaimPromptModal } = await import('../public/js/claim-modal.js'));
});

afterEach(() => {
  infoSpy.mockRestore();
});

describe('showClaimPromptModal', () => {
  it('emits claim_prompt_shown exactly once when opened', async () => {
    showClaimPromptModal({ total: 3, unattachedCount: 2, mismatchedCount: 1 });
    const shownCalls = infoSpy.mock.calls.filter(c => c[0] === '[client] claim_prompt_shown');
    expect(shownCalls).toHaveLength(1);
    expect(shownCalls[0][1]).toEqual({ unattachedCount: 2, mismatchedCount: 1 });
  });

  it('focuses the Accept button by default so Enter accepts', async () => {
    showClaimPromptModal({ total: 1, unattachedCount: 1, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    const accept = findByAction(backdrop, 'claim-accept');
    expect(document.activeElement).toBe(accept);
  });

  it('traps focus on Tab/Shift+Tab between Decline and Accept', async () => {
    showClaimPromptModal({ total: 2, unattachedCount: 2, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    const accept = findByAction(backdrop, 'claim-accept');
    const decline = findByAction(backdrop, 'claim-decline');

    // Initial focus: Accept.
    expect(document.activeElement).toBe(accept);
    // Tab → wraps to Decline (idx 0).
    keydown(backdrop, 'Tab');
    expect(document.activeElement).toBe(decline);
    // Tab → back to Accept.
    keydown(backdrop, 'Tab');
    expect(document.activeElement).toBe(accept);
    // Shift+Tab → Decline.
    keydown(backdrop, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(decline);
  });

  it('Escape resolves to decline and emits claim_prompt_declined once', async () => {
    const promise = showClaimPromptModal({ total: 1, unattachedCount: 1, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    keydown(backdrop, 'Escape');
    await expect(promise).resolves.toBe('decline');
    const declined = infoSpy.mock.calls.filter(c => c[0] === '[client] claim_prompt_declined');
    expect(declined).toHaveLength(1);
    // Modal removed from DOM.
    expect(document.body.children).toHaveLength(0);
  });

  it('Enter resolves to accept regardless of which button is focused', async () => {
    const promise = showClaimPromptModal({ total: 1, unattachedCount: 1, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    const decline = findByAction(backdrop, 'claim-decline');
    // Force focus to Decline; Enter must still accept.
    decline.focus();
    expect(document.activeElement).toBe(decline);
    keydown(backdrop, 'Enter');
    await expect(promise).resolves.toBe('accept');
    const accepted = infoSpy.mock.calls.filter(c => c[0] === '[client] claim_prompt_accepted');
    expect(accepted).toHaveLength(1);
  });

  it('backdrop click resolves to decline', async () => {
    const promise = showClaimPromptModal({ total: 1, unattachedCount: 1, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    backdrop.dispatchEvent({ type: 'click', target: backdrop, preventDefault() {} });
    await expect(promise).resolves.toBe('decline');
  });

  it('clicking inside the modal (not on backdrop) does not dismiss', async () => {
    const promise = showClaimPromptModal({ total: 1, unattachedCount: 1, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    const modal = backdrop.children[0];
    // target === modal (a child), not backdrop → no dismiss.
    backdrop.dispatchEvent({ type: 'click', target: modal, preventDefault() {} });
    let resolved = false;
    promise.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Clean up so the test doesn't leak the unresolved promise.
    keydown(backdrop, 'Escape');
    await promise;
  });

  it('Tab respects current activeElement (click-then-Tab cycles correctly)', async () => {
    showClaimPromptModal({ total: 1, unattachedCount: 1, mismatchedCount: 0 });
    const backdrop = document.body.children[0];
    const accept = findByAction(backdrop, 'claim-accept');
    const decline = findByAction(backdrop, 'claim-decline');

    // User clicks (or AT focuses) Decline directly — focusIdx is now stale.
    decline.focus();
    expect(document.activeElement).toBe(decline);
    // Tab must move to Accept (Decline → Accept), not stay on Decline.
    keydown(backdrop, 'Tab');
    expect(document.activeElement).toBe(accept);
    // And Tab again wraps back to Decline.
    keydown(backdrop, 'Tab');
    expect(document.activeElement).toBe(decline);
  });

  it('invokes onAccept callback when Accept is clicked', async () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const promise = showClaimPromptModal({
      total: 5,
      unattachedCount: 5,
      mismatchedCount: 0,
      onAccept,
      onDecline,
    });
    const backdrop = document.body.children[0];
    const accept = findByAction(backdrop, 'claim-accept');
    accept.click();
    await expect(promise).resolves.toBe('accept');
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
  });
});
