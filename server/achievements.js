/**
 * Achievement definitions and unlock logic.
 */

const { getDbAdapter } = require('./db');

/** All achievement definitions. */
const ACHIEVEMENTS = [
  {
    id: 'first-game',
    name: 'First Steps',
    icon: '🎮',
    category: 'general',
    requirement: JSON.stringify({ type: 'games_played', threshold: 1 }),
  },
  {
    id: 'score-500',
    name: 'Rising Star',
    icon: '⭐',
    category: 'scoring',
    requirement: JSON.stringify({ type: 'score', threshold: 500 }),
  },
  {
    id: 'score-1000',
    name: 'High Achiever',
    icon: '🌟',
    category: 'scoring',
    requirement: JSON.stringify({ type: 'score', threshold: 1000 }),
  },
  {
    id: 'perfect-game',
    name: 'Perfectionist',
    icon: '💎',
    category: 'scoring',
    requirement: JSON.stringify({ type: 'perfect_game' }),
  },
  {
    id: 'streak-5',
    name: 'On Fire',
    icon: '🔥',
    category: 'streaks',
    requirement: JSON.stringify({ type: 'streak', threshold: 5 }),
  },
  {
    id: 'streak-10',
    name: 'Unstoppable',
    icon: '⚡',
    category: 'streaks',
    requirement: JSON.stringify({ type: 'streak', threshold: 10 }),
  },
  {
    id: 'daily-3',
    name: 'Dedicated',
    icon: '📅',
    category: 'daily',
    requirement: JSON.stringify({ type: 'daily_count', threshold: 3 }),
  },
  {
    id: 'daily-7',
    name: 'Weekly Warrior',
    icon: '🗓️',
    category: 'daily',
    requirement: JSON.stringify({ type: 'daily_count', threshold: 7 }),
  },
  {
    id: 'mp-first-win',
    name: 'Victor',
    icon: '🏆',
    category: 'multiplayer',
    requirement: JSON.stringify({ type: 'mp_wins', threshold: 1 }),
  },
  {
    id: 'mp-5-wins',
    name: 'Champion',
    icon: '👑',
    category: 'multiplayer',
    requirement: JSON.stringify({ type: 'mp_wins', threshold: 5 }),
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    icon: '⚡',
    category: 'speed',
    requirement: JSON.stringify({ type: 'fast_answer', threshold: 2000 }),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: '🗺️',
    category: 'general',
    requirement: JSON.stringify({ type: 'categories_played', threshold: 5 }),
  },
];

/**
 * Seed achievements into the database if the table is empty.
 */
async function seedAchievements() {
  const db = await getDbAdapter();
  const row = await db.get('SELECT COUNT(*) as c FROM achievements');
  if (row.c > 0) return;

  const descriptions = {
    'first-game': 'Play your first game',
    'score-500': 'Score 500+ in a single game',
    'score-1000': 'Score 1000+ in a single game',
    'perfect-game': 'Get all answers correct in a game',
    'streak-5': 'Get a 5-answer streak',
    'streak-10': 'Get a 10-answer streak',
    'daily-3': 'Complete 3 daily challenges',
    'daily-7': 'Complete 7 daily challenges',
    'mp-first-win': 'Win your first multiplayer match',
    'mp-5-wins': 'Win 5 multiplayer matches',
    'speed-demon': 'Answer correctly within 2 seconds',
    'explorer': 'Play puzzles from 5 different categories',
  };

  await db.transaction(async (tx) => {
    for (const a of ACHIEVEMENTS) {
      await tx.run(
        'INSERT INTO achievements (id, name, description, icon, category, requirement) VALUES (?, ?, ?, ?, ?, ?)',
        [a.id, a.name, descriptions[a.id], a.icon, a.category, a.requirement]
      );
    }
  });
  console.log('🏅 Achievements seeded');
}

/**
 * Check and unlock achievements for a user based on the given context.
 *
 * @param {number} userId
 * @param {object} context - { score, correctCount, totalRounds, bestStreak, mode, isWin, fastestAnswerMs }
 * @returns {Promise<Array>} Newly unlocked achievements
 */
async function checkAndUnlockAchievements(userId, context) {
  const db = await getDbAdapter();

  // Get achievements not yet unlocked by this user
  const locked = await db.all(`
    SELECT a.* FROM achievements a
    WHERE a.id NOT IN (
      SELECT achievement_id FROM user_achievements WHERE user_id = ?
    )
  `, [userId]);

  if (locked.length === 0) return [];

  const newlyUnlocked = [];

  for (const achievement of locked) {
    const req = JSON.parse(achievement.requirement);
    let met = false;

    switch (req.type) {
      case 'games_played': {
        const row = await db.get('SELECT COUNT(*) as c FROM scores WHERE user_id = ?', [userId]);
        met = row.c >= req.threshold;
        break;
      }
      case 'score': {
        met = (context.score || 0) >= req.threshold;
        break;
      }
      case 'perfect_game': {
        met = context.totalRounds > 0 && context.correctCount === context.totalRounds;
        break;
      }
      case 'streak': {
        met = (context.bestStreak || 0) >= req.threshold;
        break;
      }
      case 'daily_count': {
        const row = await db.get(
          "SELECT COUNT(*) as c FROM scores WHERE user_id = ? AND mode = 'daily'",
          [userId]
        );
        met = row.c >= req.threshold;
        break;
      }
      case 'mp_wins': {
        const row = await db.get(`
          SELECT COUNT(*) as c FROM match_players mp
          JOIN matches m ON mp.match_id = m.id
          WHERE mp.user_id = ? AND m.status = 'finished'
            AND mp.score = (SELECT MAX(mp2.score) FROM match_players mp2 WHERE mp2.match_id = mp.match_id)
        `, [userId]);
        met = row.c >= req.threshold;
        break;
      }
      case 'fast_answer': {
        met = context.fastestAnswerMs != null && context.fastestAnswerMs > 0 && context.fastestAnswerMs <= req.threshold;
        break;
      }
      case 'categories_played': {
        const row = await db.get('SELECT COUNT(*) as c FROM scores WHERE user_id = ?', [userId]);
        met = row.c >= req.threshold;
        break;
      }
      default:
        break;
    }

    if (met) {
      newlyUnlocked.push(achievement);
    }
  }

  // Insert newly unlocked achievements
  if (newlyUnlocked.length > 0) {
    await db.transaction(async (tx) => {
      for (const a of newlyUnlocked) {
        await tx.run(
          'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
          [userId, a.id]
        );
      }
    });
  }

  return newlyUnlocked.map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    category: a.category,
  }));
}

module.exports = { ACHIEVEMENTS, seedAchievements, checkAndUnlockAchievements };
