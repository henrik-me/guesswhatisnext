/**
 * Migration 001 — Initial schema.
 *
 * SQLite: executes schema.sql (CREATE TABLE IF NOT EXISTS).
 * MSSQL:  executes equivalent T-SQL with IF OBJECT_ID guards.
 */

const fs = require('fs');
const path = require('path');

const MSSQL_SCHEMA = `
IF OBJECT_ID('users', 'U') IS NULL
CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username NVARCHAR(255) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'system', 'admin')),
  created_at DATETIME DEFAULT GETDATE()
);

IF OBJECT_ID('scores', 'U') IS NULL
CREATE TABLE scores (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  mode NVARCHAR(50) NOT NULL CHECK(mode IN ('freeplay', 'daily')),
  score INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  total_rounds INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  played_at DATETIME DEFAULT GETDATE(),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

IF OBJECT_ID('matches', 'U') IS NULL
CREATE TABLE matches (
  id NVARCHAR(255) PRIMARY KEY,
  room_code NVARCHAR(255) NOT NULL UNIQUE,
  status NVARCHAR(50) NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'finished', 'cancelled')),
  total_rounds INT NOT NULL DEFAULT 5,
  max_players INT NOT NULL DEFAULT 2,
  created_by INT NOT NULL,
  host_user_id INT,
  created_at DATETIME DEFAULT GETDATE(),
  finished_at DATETIME,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (host_user_id) REFERENCES users(id)
);

IF OBJECT_ID('match_players', 'U') IS NULL
CREATE TABLE match_players (
  match_id NVARCHAR(255) NOT NULL,
  user_id INT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  finished_at DATETIME,
  PRIMARY KEY (match_id, user_id),
  FOREIGN KEY (match_id) REFERENCES matches(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

IF OBJECT_ID('match_rounds', 'U') IS NULL
CREATE TABLE match_rounds (
  match_id NVARCHAR(255) NOT NULL,
  round_num INT NOT NULL,
  puzzle_id NVARCHAR(255) NOT NULL,
  started_at DATETIME DEFAULT GETDATE(),
  PRIMARY KEY (match_id, round_num),
  FOREIGN KEY (match_id) REFERENCES matches(id)
);

IF OBJECT_ID('achievements', 'U') IS NULL
CREATE TABLE achievements (
  id NVARCHAR(255) PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX) NOT NULL,
  icon NVARCHAR(50) NOT NULL,
  category NVARCHAR(255) NOT NULL DEFAULT 'general',
  requirement NVARCHAR(MAX) NOT NULL
);

IF OBJECT_ID('user_achievements', 'U') IS NULL
CREATE TABLE user_achievements (
  user_id INT NOT NULL,
  achievement_id NVARCHAR(255) NOT NULL,
  unlocked_at DATETIME DEFAULT GETDATE(),
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (achievement_id) REFERENCES achievements(id)
);

IF OBJECT_ID('puzzles', 'U') IS NULL
CREATE TABLE puzzles (
  id NVARCHAR(255) PRIMARY KEY,
  category NVARCHAR(255) NOT NULL,
  difficulty INT NOT NULL DEFAULT 2 CHECK(difficulty BETWEEN 1 AND 3),
  type NVARCHAR(50) NOT NULL DEFAULT 'emoji' CHECK(type IN ('emoji', 'text', 'image')),
  sequence NVARCHAR(MAX) NOT NULL,
  answer NVARCHAR(MAX) NOT NULL,
  options NVARCHAR(MAX) NOT NULL,
  explanation NVARCHAR(MAX) NOT NULL,
  active INT NOT NULL DEFAULT 1,
  submitted_by NVARCHAR(255),
  created_at DATETIME DEFAULT GETDATE()
);

IF OBJECT_ID('puzzle_submissions', 'U') IS NULL
CREATE TABLE puzzle_submissions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL,
  sequence NVARCHAR(MAX) NOT NULL,
  answer NVARCHAR(MAX) NOT NULL,
  explanation NVARCHAR(MAX) NOT NULL,
  difficulty INT NOT NULL CHECK(difficulty BETWEEN 1 AND 3),
  category NVARCHAR(255) NOT NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewer_notes NVARCHAR(MAX),
  created_at DATETIME DEFAULT GETDATE(),
  reviewed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_scores_user')
  CREATE INDEX idx_scores_user ON scores(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_scores_mode_date')
  CREATE INDEX idx_scores_mode_date ON scores(mode, played_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_scores_leaderboard')
  CREATE INDEX idx_scores_leaderboard ON scores(mode, score DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_matches_room')
  CREATE INDEX idx_matches_room ON matches(room_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_matches_status')
  CREATE INDEX idx_matches_status ON matches(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_user_achievements_user')
  CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_puzzles_category')
  CREATE INDEX idx_puzzles_category ON puzzles(category);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_puzzles_difficulty')
  CREATE INDEX idx_puzzles_difficulty ON puzzles(difficulty);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_puzzles_active')
  CREATE INDEX idx_puzzles_active ON puzzles(active);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_puzzle_submissions_user')
  CREATE INDEX idx_puzzle_submissions_user ON puzzle_submissions(user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_puzzle_submissions_status')
  CREATE INDEX idx_puzzle_submissions_status ON puzzle_submissions(status);
`;

module.exports = {
  version: 1,
  name: 'initial-schema',
  async up(db) {
    if (db.dialect === 'mssql') {
      await db.exec(MSSQL_SCHEMA);
    } else {
      const schemaPath = path.join(__dirname, '..', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await db.exec(schema);
    }
  },
};
