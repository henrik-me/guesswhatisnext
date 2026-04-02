'use strict';

/**
 * Submission routes — community puzzle proposals.
 * Authenticated users can submit puzzles; system/admin can review them.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth, requireSystem } = require('../middleware/auth');
const { VALID_CATEGORIES } = require('../categories');
const logger = require('../logger');

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
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const error = validateSubmission(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { sequence, answer, explanation, difficulty, category } = req.body;
    const db = await getDbAdapter();

    const userExists = await db.get('SELECT 1 FROM users WHERE id = ?', [req.user.id]);
    if (!userExists) {
      return res.status(401).json({ error: 'User not found — please log in again' });
    }

    const trimmedAnswer = typeof answer === 'string' ? answer.trim() : String(answer);

    const result = await db.run(
      `INSERT INTO puzzle_submissions (user_id, sequence, answer, explanation, difficulty, category)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        JSON.stringify(sequence),
        trimmedAnswer,
        explanation.trim(),
        Number(difficulty),
        category,
      ]
    );

    res.status(201).json({
      id: result.lastId,
      status: 'pending',
      message: 'Puzzle submitted for review',
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/submissions — get current user's submissions (requires auth). */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const rows = await db.all(
      `SELECT id, sequence, answer, explanation, difficulty, category, status, reviewer_notes, created_at, reviewed_at
       FROM puzzle_submissions
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const submissions = rows.map((row) => ({
      ...row,
      sequence: JSON.parse(row.sequence),
    }));

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

/** GET /api/submissions/pending — moderation queue (system/admin only). */
router.get('/pending', requireSystem, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const rows = await db.all(
      `SELECT ps.id, ps.sequence, ps.answer, ps.explanation, ps.difficulty, ps.category,
              ps.status, ps.created_at, u.username AS submitted_by
       FROM puzzle_submissions ps
       JOIN users u ON ps.user_id = u.id
       WHERE ps.status = 'pending'
       ORDER BY ps.created_at ASC`
    );

    const submissions = rows.map((row) => ({
      ...row,
      sequence: JSON.parse(row.sequence),
    }));

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

/** Generate distractor options for a community puzzle from its sequence and answer. */
function generateOptions(sequence, answer) {
  const parsed = typeof sequence === 'string' ? JSON.parse(sequence) : sequence;
  const candidates = new Set();
  // Use sequence elements as distractor candidates
  for (const item of parsed) {
    const str = String(item);
    if (str !== String(answer)) candidates.add(str);
  }
  // Fill with generic placeholders if not enough unique distractors
  const fillers = ['❓', '⬜', '🔲', '▪️'];
  for (const f of fillers) {
    if (candidates.size >= 3) break;
    if (f !== String(answer)) candidates.add(f);
  }
  // Pick up to 3 distractors and combine with the answer
  const distractors = [...candidates].slice(0, 3);
  const options = [String(answer), ...distractors];
  // Shuffle using Fisher-Yates
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

/** PUT /api/submissions/:id/review — approve or reject (system/admin only). */
router.put('/:id/review', requireSystem, async (req, res, next) => {
  try {
    const { status, reviewerNotes } = req.body;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    if (reviewerNotes !== undefined && reviewerNotes !== null && typeof reviewerNotes !== 'string') {
      return res.status(400).json({ error: 'reviewerNotes must be a string' });
    }

    const notes = typeof reviewerNotes === 'string' && reviewerNotes.trim().length > 0
      ? reviewerNotes.trim()
      : null;

    const db = await getDbAdapter();
    const submission = await db.get('SELECT * FROM puzzle_submissions WHERE id = ?', [id]);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.status !== 'pending') {
      return res.status(409).json({ error: 'Submission has already been reviewed' });
    }

    if (status === 'approved') {
      const submitter = await db.get('SELECT username FROM users WHERE id = ?', [submission.user_id]);
      const puzzleId = `community-${id}`;
      const options = JSON.stringify(generateOptions(submission.sequence, submission.answer));

      try {
        await db.transaction(async (tx) => {
          const result = await tx.run(
            `UPDATE puzzle_submissions
             SET status = ?, reviewer_notes = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'pending'`,
            [status, notes, id]
          );

          if (result.changes === 0) {
            throw new Error('ALREADY_REVIEWED');
          }

          await tx.run(
            `INSERT INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, active, submitted_by)
             VALUES (?, ?, ?, 'emoji', ?, ?, ?, ?, 1, ?)`,
            [
              puzzleId,
              submission.category,
              submission.difficulty,
              submission.sequence,
              submission.answer,
              options,
              submission.explanation,
              submitter ? submitter.username : null,
            ]
          );
        });
      } catch (err) {
        if (err && err.message === 'ALREADY_REVIEWED') {
          return res.status(409).json({ error: 'Submission has already been reviewed' });
        }
        logger.error({ err, submissionId: id }, 'Error while approving submission');
        return res.status(500).json({ error: 'Internal server error' });
      }

      return res.json({ id, status, message: `Submission ${status}`, puzzleId });
    }

    // Rejected: only update the submission status
    const result = await db.run(
      `UPDATE puzzle_submissions
       SET status = ?, reviewer_notes = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [status, notes, id]
    );

    if (result.changes === 0) {
      return res.status(409).json({ error: 'Submission has already been reviewed' });
    }

    res.json({ id, status, message: `Submission ${status}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
