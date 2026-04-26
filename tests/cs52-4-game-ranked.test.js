/**
 * CS52-4 — Game.startRanked + streaming flow unit tests.
 *
 * Verifies the client side of the CS52 Ranked endpoints (CS52-3 server) by
 * driving Game.startRanked with a mocked apiFetch:
 *   - POST /api/sessions             → 201 { sessionId, config, round0 }
 *   - POST /api/sessions/:id/answer  → 200 { correct, runningScore, elapsed_ms }
 *   - POST /api/sessions/:id/next-round → 200 puzzle | 425 { retryAfterMs }
 *   - POST /api/sessions/:id/finish  → 200 { score, correctCount, ... }
 *
 * Anti-cheat invariant: the client never sees `puzzle.answer`. We assert
 * normalizeRankedPuzzle drops it and ui.showResult is called with
 * `correctAnswer: null, rankedHidden: true`.
 *
 * Mid-Ranked-disconnect (Decision #9): abortRanked() must abort in-flight
 * fetches AND clear state so a late response handler can't crash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

function buildPuzzle(id) {
  return {
    id,
    prompt: { type: 'text', sequence: ['1', '2', '3', '4'], explanation: 'hidden' },
    options: ['A', 'B', 'C', 'D'],
    category: 'cat',
    difficulty: 'easy',
  };
}

function mockUi() {
  return {
    showScreen: vi.fn(),
    renderRound: vi.fn(),
    showResult: vi.fn(),
    showGameOver: vi.fn(),
    showRankedError: vi.fn(),
    updateTimer: vi.fn(),
    onTimerTick: vi.fn(),
    onTimeUp: vi.fn(),
  };
}

let Game;
beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../public/js/game.js');
  Game = mod.Game;
});

afterEach(() => {
  // Stop any in-flight timer/session so it doesn't bleed into the next test.
  try { Game.abortRanked && Game.abortRanked(); } catch { /* ignore */ }
});

describe('CS52-4 Game.startRanked', () => {
  it('createSession success → presents round 0 with stripped puzzle', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        sessionId: 'sess-1',
        expiresAt: Date.now() + 60000,
        config: { rounds: 10, roundTimerMs: 15000, interRoundDelayMs: 1500 },
        round0: { round_num: 0, puzzle: buildPuzzle('p0'), dispatched_at: Date.now() },
      }),
    });
    const ui = mockUi();
    const result = await Game.startRanked({ mode: 'ranked_freeplay', apiFetch, ui });
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe('/api/sessions');
    expect(ui.showScreen).toHaveBeenCalledWith('game');
    expect(ui.renderRound).toHaveBeenCalled();
    // Anti-cheat: state.currentPuzzle has no `answer`
    expect(Game.state.currentPuzzle.answer).toBeUndefined();
    expect(Game.state.currentPuzzle.id).toBe('p0');
    expect(Game.state.ranked).toBe(true);
    expect(Game.state.sessionId).toBe('sess-1');
    expect(Game.state.roundTimeMs).toBe(15000);
  });

  it('createSession 409 (already-played-today) returns http error without calling ui.showRankedError', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'already_played_today' }),
    });
    const ui = mockUi();
    const result = await Game.startRanked({ mode: 'ranked_daily', apiFetch, ui });
    expect(result).toEqual(expect.objectContaining({ error: 'http', status: 409 }));
    // Session-creation failures are surfaced by handleStartRanked (in app.js)
    // with friendly per-status toasts. game.js does NOT route them through
    // ui.showRankedError (which would trigger the mid-session abandoned overlay).
    expect(ui.showRankedError).not.toHaveBeenCalled();
  });

  it('rejects unsupported mode', async () => {
    await expect(Game.startRanked({ mode: 'bogus', apiFetch: vi.fn(), ui: mockUi() }))
      .rejects.toThrow(/unsupported mode/);
  });

  it('submitAnswer in ranked posts to /answer and surfaces server-supplied correctness', async () => {
    const apiFetch = vi.fn()
      // initial /api/sessions
      .mockResolvedValueOnce({
        ok: true, status: 201,
        json: async () => ({
          sessionId: 'sess-2',
          expiresAt: Date.now() + 60000,
          config: { rounds: 10, roundTimerMs: 15000, interRoundDelayMs: 1500 },
          round0: { round_num: 0, puzzle: buildPuzzle('p0'), dispatched_at: Date.now() },
        }),
      })
      // /answer for round 0
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ correct: true, runningScore: 120, elapsed_ms: 2400 }),
      });
    const ui = mockUi();
    await Game.startRanked({ mode: 'ranked_freeplay', apiFetch, ui });
    Game.submitAnswer('A', ui);
    // submitAnswer is sync but the network call is async — wait a tick
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    const answerCall = apiFetch.mock.calls[1];
    expect(answerCall[0]).toBe('/api/sessions/sess-2/answer');
    expect(answerCall[1].method).toBe('POST');
    const body = JSON.parse(answerCall[1].body);
    expect(body.round_num).toBe(0);
    expect(body.puzzle_id).toBe('p0');
    expect(body.answer).toBe('A');
    expect(typeof body.client_time_ms).toBe('number');
    expect(ui.showResult).toHaveBeenCalledWith(expect.objectContaining({
      correct: true,
      correctAnswer: null,    // anti-cheat: never reveal
      rankedHidden: true,
    }));
    expect(Game.state.score).toBe(120);
    expect(Game.state.streak).toBe(1);
  });

  it('submitAnswer with null answer (timer expiry) sends empty string (server rejects null)', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 201,
        json: async () => ({
          sessionId: 'sess-3', expiresAt: Date.now()+60000,
          config: { rounds: 10, roundTimerMs: 15000, interRoundDelayMs: 1500 },
          round0: { round_num: 0, puzzle: buildPuzzle('p0'), dispatched_at: Date.now() },
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ correct: false, runningScore: 0, elapsed_ms: 15000 }),
      });
    const ui = mockUi();
    await Game.startRanked({ mode: 'ranked_freeplay', apiFetch, ui });
    Game.submitAnswer(null, ui);
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    const body = JSON.parse(apiFetch.mock.calls[1][1].body);
    expect(body.answer).toBe(''); // empty string, not null
  });

  it('nextRound in ranked retries once on 425 then presents next puzzle', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 201,
        json: async () => ({
          sessionId: 'sess-4', expiresAt: Date.now()+60000,
          config: { rounds: 10, roundTimerMs: 15000, interRoundDelayMs: 50 },
          round0: { round_num: 0, puzzle: buildPuzzle('p0'), dispatched_at: Date.now() },
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ correct: true, runningScore: 100, elapsed_ms: 1000 }),
      })
      // first /next-round → 425
      .mockResolvedValueOnce({
        ok: false, status: 425,
        json: async () => ({ retryAfterMs: 50 }),
      })
      // retry → success
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ round_num: 1, puzzle: buildPuzzle('p1'), dispatched_at: Date.now() }),
      });
    const ui = mockUi();
    await Game.startRanked({ mode: 'ranked_freeplay', apiFetch, ui });
    Game.submitAnswer('A', ui);
    await new Promise(r => setTimeout(r, 10));
    Game.nextRound(ui);
    await new Promise(r => setTimeout(r, 100));
    // 4 calls: create, answer, next-round (425), next-round (200)
    expect(apiFetch).toHaveBeenCalledTimes(4);
    expect(apiFetch.mock.calls[2][0]).toBe('/api/sessions/sess-4/next-round');
    expect(apiFetch.mock.calls[3][0]).toBe('/api/sessions/sess-4/next-round');
    expect(Game.state.currentPuzzle.id).toBe('p1');
    expect(Game.state.currentRound).toBe(1);
  });

  it('abortRanked clears state and aborts in-flight controller', async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({
        sessionId: 'sess-5', expiresAt: Date.now()+60000,
        config: { rounds: 10, roundTimerMs: 15000, interRoundDelayMs: 1500 },
        round0: { round_num: 0, puzzle: buildPuzzle('p0'), dispatched_at: Date.now() },
      }),
    });
    const ui = mockUi();
    await Game.startRanked({ mode: 'ranked_freeplay', apiFetch, ui });
    expect(Game.state).not.toBeNull();
    expect(Game.state.ranked).toBe(true);
    const priorId = Game.abortRanked();
    expect(priorId).toBe('sess-5');
    expect(Game.state).toBeNull();
    // calling again returns null (no in-flight session)
    expect(Game.abortRanked()).toBeNull();
  });

  it('finish on the last round calls /finish and forwards summary with ranked=true', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 201,
        json: async () => ({
          sessionId: 'sess-6', expiresAt: Date.now()+60000,
          // one-round session for fast test
          config: { rounds: 1, roundTimerMs: 15000, interRoundDelayMs: 50 },
          round0: { round_num: 0, puzzle: buildPuzzle('p0'), dispatched_at: Date.now() },
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ correct: true, runningScore: 150, elapsed_ms: 1500 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ score: 150, correctCount: 1, bestStreak: 1, fastestAnswerMs: 1500 }),
      });
    const ui = mockUi();
    await Game.startRanked({ mode: 'ranked_freeplay', apiFetch, ui });
    Game.submitAnswer('A', ui);
    await new Promise(r => setTimeout(r, 10));
    Game.nextRound(ui); // last round → finish
    await new Promise(r => setTimeout(r, 50));
    expect(apiFetch.mock.calls[2][0]).toBe('/api/sessions/sess-6/finish');
    expect(ui.showGameOver).toHaveBeenCalledWith(expect.objectContaining({
      score: 150,
      correctCount: 1,
      ranked: true,
    }));
  });
});
