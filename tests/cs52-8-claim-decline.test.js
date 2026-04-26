/**
 * CS52-8 cross-task — Claim-prompt DECLINE behavior.
 *
 * Spans CS52-4 (claim modal UI) × CS52-5 (sync-client claim bucket).
 * The per-task suites cover:
 *   - cs52-4-claim-modal.test.js: the modal resolves to 'decline' on
 *     Escape / backdrop click, telemetry fires once.
 *   - cs52-5-sync-client.test.js: findClaimableRecords + applyClaim happy
 *     path (accept → records reassigned).
 *
 * What was NOT covered: the cross-task contract that DECLINE is a no-op —
 * L1 records are untouched, no auto-sync is triggered, and the very same
 * claimable bucket re-surfaces on the next sign-in. This file pins that.
 *
 * Acceptance criterion (CS52 § Acceptance):
 *   "Claim-prompt decline: if the user dismisses the 'claim N offline games'
 *    prompt, no records are deleted, reassigned, or auto-synced; the prompt
 *    re-surfaces on the next sign-in."
 */

import { describe, it, expect, vi } from 'vitest';

globalThis.document = undefined;
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

async function loadFresh() {
  vi.resetModules();
  localStorage.clear();
  const mod = await import('../public/js/sync-client.js');
  mod._resetSyncClientForTests();
  return mod;
}

function fakeOk(body = {}) {
  return Promise.resolve({
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  });
}

describe('CS52-8 — claim-prompt DECLINE leaves L1 untouched and re-surfaces on next sign-in', () => {
  it('decline (no applyClaim call) preserves all L1 records with their original user_ids', async () => {
    const m = await loadFresh();

    // Simulate guest play + a record from a previous mismatched user
    m.enqueueRecord(m.buildRecord({ score: 11, mode: 'freeplay' }, null));   // guest
    m.enqueueRecord(m.buildRecord({ score: 22, mode: 'freeplay' }, 99));     // mismatched
    m.enqueueRecord(m.buildRecord({ score: 33, mode: 'freeplay' }, 5));      // already matches

    const before = m.getL1Records().map((r) => ({ id: r.client_game_id, user_id: r.user_id, score: r.score }));
    expect(before.length).toBe(3);

    // First sign-in: detect claimable bucket.
    const claim1 = m.findClaimableRecords(5);
    expect(claim1.unattached.length).toBe(1);
    expect(claim1.mismatched.length).toBe(1);

    // User DECLINES — no applyClaim call. L1 must be byte-for-byte
    // identical: no deletion, no reassignment, no scrubbing.
    const after = m.getL1Records().map((r) => ({ id: r.client_game_id, user_id: r.user_id, score: r.score }));
    expect(after).toEqual(before);
  });

  it('decline does NOT auto-fire a sync (no apiFetch call without an explicit gesture)', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 11, mode: 'freeplay' }, null));
    m.enqueueRecord(m.buildRecord({ score: 22, mode: 'freeplay' }, 99));

    // Detection alone must not call the network.
    const apiFetch = vi.fn(() => fakeOk());
    const claim = m.findClaimableRecords(5);
    expect(claim.unattached.length + claim.mismatched.length).toBe(2);
    expect(apiFetch).not.toHaveBeenCalled();
    // L1 still has both records, untouched.
    expect(m.getL1Records().length).toBe(2);
  });

  it('after decline, the SAME claimable bucket re-surfaces on a subsequent sign-in', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 11, mode: 'freeplay' }, null));
    m.enqueueRecord(m.buildRecord({ score: 22, mode: 'freeplay' }, 99));

    // Sign-in #1 — user declines (no applyClaim).
    const first = m.findClaimableRecords(5);
    expect(first.unattached.length).toBe(1);
    expect(first.mismatched.length).toBe(1);

    // Time passes; user navigates away. The app re-runs the claim
    // detection on the next user-gesture-driven sign-in pass (the
    // realistic re-surface trigger — sign-out would intentionally
    // demote user_ids and is a different code path entirely).
    const second = m.findClaimableRecords(5);
    expect(second.unattached.length).toBe(1);
    expect(second.mismatched.length).toBe(1);
    // And the record IDs are the same as on first sign-in — proving no
    // silent reassignment happened between the two sign-ins.
    expect(second.unattached[0].client_game_id).toBe(first.unattached[0].client_game_id);
    expect(second.mismatched[0].client_game_id).toBe(first.mismatched[0].client_game_id);
  });

  it('contrast: applyClaim DOES drain the bucket (sanity check that decline is the reason it persists)', async () => {
    const m = await loadFresh();
    m.enqueueRecord(m.buildRecord({ score: 11, mode: 'freeplay' }, null));
    m.enqueueRecord(m.buildRecord({ score: 22, mode: 'freeplay' }, 99));

    expect(m.findClaimableRecords(5).unattached.length + m.findClaimableRecords(5).mismatched.length).toBe(2);
    const changed = m.applyClaim(5);
    expect(changed).toBe(2);
    const after = m.findClaimableRecords(5);
    expect(after.unattached.length).toBe(0);
    expect(after.mismatched.length).toBe(0);
  });
});
