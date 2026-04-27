/**
 * CS52-followup-2 — Personal Bests renderer unit tests.
 *
 * Covers the renderPersonalBestsHTML() helper extracted into
 * public/js/personal-bests.js. Stats arrive grouped by (mode, source)
 * so each combination renders as its own block — keeping Practice
 * averages from contaminating Ranked averages and letting users
 * compare game types like-with-like.
 */
import { describe, it, expect } from 'vitest';
import { renderPersonalBestsHTML, EMPTY_HTML } from '../public/js/personal-bests.js';

describe('CS52-followup-2 personal bests renderer', () => {
  describe('empty / fallback paths', () => {
    it('returns the empty-state HTML for null', () => {
      expect(renderPersonalBestsHTML(null)).toBe(EMPTY_HTML);
    });

    it('returns the empty-state HTML for an empty array', () => {
      expect(renderPersonalBestsHTML([])).toBe(EMPTY_HTML);
    });

    it('empty-state HTML contains the friendly play-some-games copy', () => {
      expect(EMPTY_HTML).toContain('Play some games to see your stats here');
    });
  });

  describe('per-(mode, source) blocks', () => {
    it('renders Ranked Free Play with the trophy icon', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'freeplay', source: 'ranked', games_played: 3, high_score: 1234, avg_score: 800, best_streak: 5 },
      ]);
      expect(html).toContain('🏆 Ranked Free Play');
      expect(html).toContain('1,234'); // high_score formatted
      expect(html).toContain('800');   // avg_score formatted
      expect(html).toContain('🔥 5 streak');
      expect(html).toContain('data-mode="freeplay"');
      expect(html).toContain('data-source="ranked"');
    });

    it('renders Practice Free Play with the practice (gamepad) icon', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'freeplay', source: 'offline', games_played: 5, high_score: 600, avg_score: 400, best_streak: 2 },
      ]);
      expect(html).toContain('🎮 Practice Free Play');
      expect(html).toContain('data-source="offline"');
    });

    it('renders Ranked Daily and Practice Daily separately', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'daily', source: 'ranked',  games_played: 1, high_score: 900, avg_score: 900, best_streak: 5 },
        { mode: 'daily', source: 'offline', games_played: 4, high_score: 500, avg_score: 350, best_streak: 3 },
      ]);
      expect(html).toContain('🏆 Ranked Daily');
      expect(html).toContain('📅 Practice Daily');
      // Both blocks present
      expect(html.match(/personal-bests-stat/g).length).toBe(2);
    });

    it('renders Multiplayer with no streak detail (best_streak intentionally suppressed)', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'multiplayer', source: 'ranked', games_played: 7, high_score: 1500, avg_score: 1100, best_streak: 0 },
      ]);
      expect(html).toContain('⚔️ Multiplayer');
      expect(html).toContain('1,500');
      expect(html).not.toContain('streak');
    });

    it('renders Legacy Free Play / Daily with the scroll icon', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'freeplay', source: 'legacy', games_played: 2, high_score: 9999, avg_score: 5000, best_streak: 7 },
        { mode: 'daily',    source: 'legacy', games_played: 1, high_score: 8888, avg_score: 8888, best_streak: 4 },
      ]);
      expect(html).toContain('📜 Legacy Free Play');
      expect(html).toContain('📜 Legacy Daily');
    });

    it('renders unknown (mode, source) combos with a generic fallback label rather than dropping them', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'experimental', source: 'beta', games_played: 1, high_score: 100, avg_score: 100, best_streak: 0 },
      ]);
      expect(html).toContain('experimental (beta)');
      expect(html).toContain('🎯');
    });

    it('handles missing source as "unknown"', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'freeplay', games_played: 1, high_score: 50, avg_score: 50, best_streak: 0 },
      ]);
      expect(html).toContain('freeplay (unknown)');
      expect(html).toContain('data-source="unknown"');
    });
  });

  describe('block ordering', () => {
    it('renders blocks in the documented priority order regardless of input order', () => {
      // Input deliberately scrambled.
      const html = renderPersonalBestsHTML([
        { mode: 'daily',       source: 'legacy',  games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
        { mode: 'multiplayer', source: 'ranked',  games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
        { mode: 'freeplay',    source: 'offline', games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
        { mode: 'daily',       source: 'ranked',  games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
        { mode: 'freeplay',    source: 'ranked',  games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
        { mode: 'freeplay',    source: 'legacy',  games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
        { mode: 'daily',       source: 'offline', games_played: 1, high_score: 1, avg_score: 1, best_streak: 0 },
      ]);
      // The ordered labels should appear in the rendered HTML in this sequence.
      const expectedOrder = [
        '🏆 Ranked Free Play',
        '🏆 Ranked Daily',
        '🎮 Practice Free Play',
        '📅 Practice Daily',
        '⚔️ Multiplayer',
        '📜 Legacy Free Play',
        '📜 Legacy Daily',
      ];
      let lastIdx = -1;
      for (const label of expectedOrder) {
        const idx = html.indexOf(label);
        expect(idx, `expected to find "${label}" at idx > ${lastIdx}`).toBeGreaterThan(lastIdx);
        lastIdx = idx;
      }
    });
  });

  describe('integrity: averages are NOT mixed across (mode, source) combos', () => {
    // This is the user's core complaint with the prior renderer: it
    // averaged Practice + Ranked together, producing a meaningless
    // composite. The renderer never mixes — each input row is a
    // distinct block.
    it('renders one block per input row (no cross-source aggregation in the renderer)', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'freeplay', source: 'ranked',  games_played: 1, high_score: 1000, avg_score: 1000, best_streak: 5 },
        { mode: 'freeplay', source: 'offline', games_played: 5, high_score: 500,  avg_score: 300,  best_streak: 3 },
      ]);
      // Two blocks for the same mode (`freeplay`) but different sources.
      expect(html.match(/personal-bests-stat/g).length).toBe(2);
      // Each block carries its own avg.
      expect(html).toContain('1,000');
      expect(html).toContain('300');
      // Crucially, no contaminated avg like the old (1000+300)/2=650 number.
      expect(html).not.toContain('650');
    });
  });

  describe('output safety', () => {
    it('numeric fields are coerced via Number(...) (defends against string inputs from JSON)', () => {
      const html = renderPersonalBestsHTML([
        { mode: 'freeplay', source: 'ranked', games_played: '7', high_score: '1234', avg_score: '800', best_streak: '4' },
      ]);
      expect(html).toContain('1,234');
      expect(html).toContain('7 games');
      expect(html).toContain('🔥 4 streak');
    });
  });
});
