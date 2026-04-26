/**
 * CS52-4 — Connectivity banner + Ranked entry gate UI tests.
 *
 * app.js is a large IIFE-style module not directly exporting these helpers,
 * so we re-implement the small string-map + DOM helpers here under test.
 * The PURE functions exercised here MUST stay byte-identical to the ones in
 * app.js (CONNECTIVITY_BANNER_COPY, renderConnectivityBanner shape, and the
 * `[data-bind="ranked-entry"]` disabled toggle). If you change one, change
 * both. (We could lift them into a shared module later.)
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Tiny DOM stand-in — vitest's default env lacks jsdom in this project.
// Just enough surface to drive the helpers: getElementById, querySelector,
// querySelectorAll, classList, dataset, attributes, style.
function createEl(tag, attrs = {}) {
  const attributes = new Map();
  const classes = new Set();
  const dataset = {};
  const style = {};
  const children = [];
  let textContent = '';
  const el = {
    tagName: tag.toUpperCase(),
    children,
    style,
    dataset,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => { attributes.set(k, String(v)); if (k === 'disabled') attributes.set(k, ''); },
    removeAttribute: (k) => { attributes.delete(k); },
    getAttribute: (k) => (attributes.has(k) ? attributes.get(k) : null),
    hasAttribute: (k) => attributes.has(k),
    appendChild: (child) => { children.push(child); child.parentNode = el; return child; },
    get textContent() { return textContent; },
    set textContent(v) { textContent = String(v); },
    querySelector(sel) {
      return findFirst(this, sel);
    },
    querySelectorAll(sel) {
      return findAll(this, sel);
    },
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') v.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    else if (k === 'id') { el.id = v; attributes.set('id', v); }
    else if (k.startsWith('data-')) { dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v; attributes.set(k, v); }
    else attributes.set(k, v);
  }
  return el;
}

function matches(el, sel) {
  // very small selector matcher: #id | [attr="val"] | .class
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  const m = sel.match(/^\[([a-zA-Z-]+)="([^"]+)"\]$/);
  if (m) {
    const [, k, v] = m;
    if (k.startsWith('data-')) {
      return el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === v;
    }
    return el.getAttribute(k) === v;
  }
  return false;
}
function walk(el, cb) {
  cb(el);
  for (const c of el.children) walk(c, cb);
}
function findFirst(root, sel) {
  let found = null;
  walk(root, (n) => { if (!found && n !== root && matches(n, sel)) found = n; });
  return found;
}
function findAll(root, sel) {
  const out = [];
  walk(root, (n) => { if (n !== root && matches(n, sel)) out.push(n); });
  return out;
}

const CONNECTIVITY_BANNER_COPY = {
  ok: null,
  'network-down': { text: 'Offline — your games still count', showSignIn: false },
  'auth-expired': { text: 'Signed out — sign in to save your games', showSignIn: true },
  'db-unavailable': { text: 'Online scoring paused — your games are queued', showSignIn: false },
};

function renderConnectivityBanner(root, stateName) {
  const el = findFirst(root, '#connectivity-banner');
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

function applyRankedEntryGate(root, canRank, stateName) {
  const buttons = findAll(root, '[data-bind="ranked-entry"]');
  buttons.forEach(btn => {
    if (canRank) {
      btn.removeAttribute('disabled');
      btn.classList.remove('ranked-disabled');
      btn.removeAttribute('aria-disabled');
    } else {
      btn.setAttribute('disabled', 'disabled');
      btn.classList.add('ranked-disabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.dataset.disabledState = stateName;
    }
  });
}

let root;
beforeEach(() => {
  root = createEl('body');
  const banner = createEl('div', { id: 'connectivity-banner', 'data-state': 'ok' });
  banner.style.display = 'none';
  const text = createEl('span', { 'data-bind': 'connectivity-banner-text' });
  const signIn = createEl('button', { 'data-action': 'connectivity-sign-in' });
  signIn.style.display = 'none';
  banner.appendChild(text);
  banner.appendChild(signIn);
  root.appendChild(banner);
  const rfp = createEl('button', { 'data-action': 'start-ranked-freeplay', 'data-bind': 'ranked-entry' });
  const rd = createEl('button', { 'data-action': 'start-ranked-daily', 'data-bind': 'ranked-entry' });
  root.appendChild(rfp);
  root.appendChild(rd);
});

describe('CS52-4 connectivity banner copy', () => {
  it('ok hides banner', () => {
    renderConnectivityBanner(root, 'ok');
    expect(findFirst(root, '#connectivity-banner').style.display).toBe('none');
  });

  it('network-down shows offline copy without sign-in button', () => {
    renderConnectivityBanner(root, 'network-down');
    const el = findFirst(root, '#connectivity-banner');
    expect(el.style.display).toBe('');
    expect(el.dataset.state).toBe('network-down');
    expect(el.querySelector('[data-bind="connectivity-banner-text"]').textContent)
      .toBe('Offline — your games still count');
    expect(el.querySelector('[data-action="connectivity-sign-in"]').style.display).toBe('none');
  });

  it('auth-expired shows sign-in copy WITH sign-in button visible', () => {
    renderConnectivityBanner(root, 'auth-expired');
    const el = findFirst(root, '#connectivity-banner');
    expect(el.dataset.state).toBe('auth-expired');
    expect(el.querySelector('[data-bind="connectivity-banner-text"]').textContent)
      .toBe('Signed out — sign in to save your games');
    expect(el.querySelector('[data-action="connectivity-sign-in"]').style.display).toBe('');
  });

  it('db-unavailable shows queued copy', () => {
    renderConnectivityBanner(root, 'db-unavailable');
    const el = findFirst(root, '#connectivity-banner');
    expect(el.dataset.state).toBe('db-unavailable');
    expect(el.querySelector('[data-bind="connectivity-banner-text"]').textContent)
      .toBe('Online scoring paused — your games are queued');
    expect(el.querySelector('[data-action="connectivity-sign-in"]').style.display).toBe('none');
  });
});

describe('CS52-4 ranked entry gate', () => {
  it('canRank=true: buttons enabled, no ranked-disabled class', () => {
    applyRankedEntryGate(root, true, 'ok');
    const buttons = findAll(root, '[data-bind="ranked-entry"]');
    expect(buttons.length).toBe(2);
    buttons.forEach(b => {
      expect(b.hasAttribute('disabled')).toBe(false);
      expect(b.classList.contains('ranked-disabled')).toBe(false);
      expect(b.hasAttribute('aria-disabled')).toBe(false);
    });
  });

  it('canRank=false: all ranked-entry buttons disabled with state class + ARIA', () => {
    applyRankedEntryGate(root, false, 'network-down');
    const buttons = findAll(root, '[data-bind="ranked-entry"]');
    buttons.forEach(b => {
      expect(b.hasAttribute('disabled')).toBe(true);
      expect(b.classList.contains('ranked-disabled')).toBe(true);
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.dataset.disabledState).toBe('network-down');
    });
  });

  it('toggle false → true clears the disabled state cleanly', () => {
    applyRankedEntryGate(root, false, 'auth-expired');
    applyRankedEntryGate(root, true, 'ok');
    const buttons = findAll(root, '[data-bind="ranked-entry"]');
    buttons.forEach(b => {
      expect(b.hasAttribute('disabled')).toBe(false);
      expect(b.classList.contains('ranked-disabled')).toBe(false);
    });
  });
});
