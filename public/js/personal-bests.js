/**
 * CS52-followup-2 — Personal Bests renderer.
 *
 * Renders one card per (mode, source) combo so Practice averages
 * don't contaminate Ranked averages and users can compare game
 * types like-with-like. Multiplayer is server-validated only and
 * has no source split.
 *
 * Returns an HTML string (or empty-state HTML); the caller is
 * responsible for inserting it into the DOM. Unit-testable without
 * a DOM.
 */

const BLOCK_META = {
  'freeplay|ranked':    { icon: '🏆', label: 'Ranked Free Play',    order: 1 },
  'daily|ranked':       { icon: '🏆', label: 'Ranked Daily',        order: 2 },
  'freeplay|offline':   { icon: '🎮', label: 'Practice Free Play',  order: 3 },
  'daily|offline':      { icon: '📅', label: 'Practice Daily',      order: 4 },
  'multiplayer|ranked': { icon: '⚔️', label: 'Multiplayer',         order: 5 },
  'freeplay|legacy':    { icon: '📜', label: 'Legacy Free Play',    order: 6 },
  'daily|legacy':       { icon: '📜', label: 'Legacy Daily',        order: 7 },
};

export const EMPTY_HTML =
  '<div class="personal-bests-card"><p class="personal-bests-empty">Play some games to see your stats here! 🎮</p></div>';

/**
 * Build the HTML for the Personal Bests card.
 *
 * @param {Array<{mode:string, source:string, games_played:number,
 *                high_score:number, avg_score:number, best_streak:number}>} stats
 * @returns {string} HTML string
 */
export function renderPersonalBestsHTML(stats) {
  if (!stats || stats.length === 0) return EMPTY_HTML;

  const blocks = stats
    .map(s => {
      const key = `${s.mode}|${s.source || 'unknown'}`;
      const meta = BLOCK_META[key]
        || { icon: '🎯', label: `${s.mode} (${s.source || 'unknown'})`, order: 99 };
      return { ...s, _meta: meta };
    })
    .sort((a, b) => a._meta.order - b._meta.order);

  let html = '<div class="personal-bests-card"><h3 class="personal-bests-title">📊 My Personal Bests</h3><div class="personal-bests-grid">';
  for (const s of blocks) {
    const detailParts = [
      `${Number(s.games_played)} games`,
      `${Number(s.avg_score).toLocaleString()} avg`,
    ];
    // Multiplayer historically reports best_streak=0 (not tracked); skip.
    if (s.mode !== 'multiplayer' && Number(s.best_streak) > 0) {
      detailParts.push(`🔥 ${Number(s.best_streak)} streak`);
    }
    html += `<div class="personal-bests-stat" data-mode="${s.mode}" data-source="${s.source || 'unknown'}">
      <span class="personal-bests-label">${s._meta.icon} ${s._meta.label}</span>
      <span class="personal-bests-value">${Number(s.high_score).toLocaleString()}</span>
      <span class="personal-bests-detail">${detailParts.join(' · ')}</span>
    </div>`;
  }
  html += '</div></div>';
  return html;
}
