'use strict';

/**
 * Submission routes — community puzzle proposals.
 * Authenticated users can submit puzzles; system/admin can review them.
 */

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth, requireSystem } = require('../middleware/auth');
const { VALID_CATEGORIES } = require('../categories');

const router = express.Router();

/** Validate a submission payload. Returns an error string or null. */
function validateSubmission(body) {
  const { sequence, answer, explanation, difficulty, category } = body;

  if (!Array.isArray(sequence) || sequence.length < 3) {
    return 'sequence must be an array of at least 3 elements';
  }
  if (answer === undefined || answer === null) {
    return 'answer is required';
  }
  const trimmedAnswer = typeof answer === 'string' ? answer.trim() : String(answer);
  if (trimmedAnswer.length === 0) {
    return 'answer is required';
  }
  if (typeof explanation !== 'string' || explanation.trim().length === 0) {
    return 'explanation is required';
  }
  const diff = Number(difficulty);
  if (!Number.isInteger(diff) || diff < 1 || diff > 3) {
    return 'difficulty must be 1, 2, or 3';
  }
  if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
    return `category must be one of: ${VALID_CATEGORIES.join(', ')}`;
  }
  return null;
}

/** POST /api/submissions — submit a puzzle proposal (requires auth). */
router.post('/', requireAuth, (req, res) => {
  const error = validateSubmission(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { sequence, answer, explanation, difficulty, category } = req.body;
  const db = getDb();

  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.user.id);
  if (!userExists) {
    return res.status(401).json({ error: 'User not found — please log in again' });
  }

  const result = db.prepare(
    `INSERT INTO puzzle_submissions (user_id, sequence, answer, explanation, difficulty, category)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id,
    JSON.stringify(sequence),
    String(answer),
    explanation.trim(),
    Number(difficulty),
    category
  );

  res.status(201).json({
    id: result.lastInsertRowid,
    status: 'pending',
    message: 'Puzzle submitted for review',
  });
});

/** GET /api/submissions — get current user's submissions (requires auth). */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, sequence, answer, explanation, difficulty, category, status, reviewer_notes, created_at, reviewed_at
     FROM puzzle_submissions
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).all(req.user.id);

  const submissions = rows.map((row) => ({
    ...row,
    sequence: JSON.parse(row.sequence),
  }));

  res.json({ submissions });
});

/** GET /api/submissions/pending — moderation queue (system/admin only). */
router.get('/pending', requireSystem, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT ps.id, ps.sequence, ps.answer, ps.explanation, ps.difficulty, ps.category,
            ps.status, ps.created_at, u.username AS submitted_by
     FROM puzzle_submissions ps
     JOIN users u ON ps.user_id = u.id
     WHERE ps.status = 'pending'
     ORDER BY ps.created_at ASC`
  ).all();

  const submissions = rows.map((row) => ({
    ...row,
    sequence: JSON.parse(row.sequence),
  }));

  res.json({ submissions });
});

/** PUT /api/submissions/:id/review — approve or reject (system/admin only). */
router.put('/:id/review', requireSystem, (req, res) => {
  const { status, reviewerNotes } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  const db = getDb();
  const submission = db.prepare('SELECT * FROM puzzle_submissions WHERE id = ?').get(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  if (submission.status !== 'pending') {
    return res.status(409).json({ error: 'Submission has already been reviewed' });
  }

  const result = db.prepare(
    `UPDATE puzzle_submissions
     SET status = ?, reviewer_notes = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`
  ).run(status, reviewerNotes || null, req.params.id);

  if (result.changes === 0) {
    return res.status(409).json({ error: 'Submission has already been reviewed' });
  }

  res.json({ id: Number(req.params.id), status, message: `Submission ${status}` });
});

module.exports = router;
