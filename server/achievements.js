/**
 * Achievement definitions and unlock logic.
 */

const { getDbAdapter } = require('./db');
const logger = require('./logger');

/** All achievement definitions. */
const ACHIEVEMENTS = [
  {
    id: 'first-game',
    name: 'First Steps',
    description: 'Play your first game',
    icon: '🎮',
    category: 'general',
    requirement: JSON.stringify({ type: 'games_played', threshold: 1 }),
  },
  {
    id: 'score-500',
    name: 'Rising Star',
    description: 'Score 500+ in a single game',
    icon: '⭐',
    category: 'scoring',
    requirement: JSON.stringify({ type: 'score', threshold: 500 }),
  },
  {
    id: 'score-1000',
    name: 'High Achiever',
    description: 'Score 1000+ in a single game',
    icon: '🌟',
    category: 'scoring',
    requirement: JSON.stringify({ type: 'score', threshold: 1000 }),
  },
  {
    id: 'perfect-game',
    name: 'Perfectionist',
    description: 'Get all answers correct in a game',
    icon: '💎',
    category: 'scoring',
    requirement: JSON.stringify({ type: 'perfect_game' }),
  },
  {
    id: 'streak-5',
    name: 'On Fire',
    description: 'Get a 5-answer streak',
    icon: '🔥',
    category: 'streaks',
    requirement: JSON.stringify({ type: 'streak', threshold: 5 }),
  },
  {
    id: 'streak-10',
    name: 'Unstoppable',
    description: 'Get a 10-answer streak',
    icon: '⚡',
    category: 'streaks',
    requirement: JSON.stringify({ type: 'streak', threshold: 10 }),
  },
  {
    id: 'daily-3',
    name: 'Dedicated',
    description: 'Complete 3 daily challenges',
    icon: '📅',
    category: 'daily',
    requirement: JSON.stringify({ type: 'daily_count', threshold: 3 }),
  },
  {
    id: 'daily-7',
    name: 'Weekly Warrior',
    description: 'Complete 7 daily challenges',
    icon: '🗓️',
    category: 'daily',
    requirement: JSON.stringify({ type: 'daily_count', threshold: 7 }),
  },
  {
    id: 'mp-first-win',
    name: 'Victor',
    description: 'Win your first multiplayer match',
    icon: '🏆',
    category: 'multiplayer',
    requirement: JSON.stringify({ type: 'mp_wins', threshold: 1 }),
  },
  {
    id: 'mp-5-wins',
    name: 'Champion',
    description: 'Win 5 multiplayer matches',
    icon: '👑',
    category: 'multiplayer',
    requirement: JSON.stringify({ type: 'mp_wins', threshold: 5 }),
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Answer correctly within 2 seconds',
    icon: '⚡',
    category: 'speed',
    requirement: JSON.stringify({ type: 'fast_answer', threshold: 2000 }),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Play puzzles from 5 different categories',
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

  await db.transaction(async (tx) => {
    for (const a of ACHIEVEMENTS) {
      await tx.run(
        'INSERT INTO achievements (id, name, description, icon, category, requirement) VALUES (?, ?, ?, ?, ?, ?)',
        [a.id, a.name, a.description, a.icon, a.category, a.requirement]
      );
    }
  });
  logger.info('Achievements seeded');
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
