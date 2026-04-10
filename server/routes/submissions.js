'use strict';

/**
 * Submission routes — community puzzle proposals.
 * Authenticated users can submit puzzles; system/admin can review them.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { isFeatureEnabled } = require('../feature-flags');
const { requireAuth, requireSystem } = require('../middleware/auth');
const { VALID_CATEGORIES } = require('../categories');
const logger = require('../logger');

const router = express.Router();

const VALID_TYPES = ['emoji', 'text', 'image'];
const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 500KB base64-encoded
const MAX_IMAGE_SEQUENCE_LENGTH = 6;
const DATA_URI_REGEX = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i;

/** Validate a base64 data URI. Returns { mime, data } or null. */
function parseDataUri(str) {
  if (typeof str !== 'string') return null;
  const match = str.match(DATA_URI_REGEX);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), data: match[2] };
}

/** Sanitize SVG content — strip <script> tags and event handlers. */
function sanitizeSvg(base64Data) {
  let svgText;
  try {
    svgText = Buffer.from(base64Data, 'base64').toString('utf-8');
  } catch {
    return null;
  }
  // Strip <script> blocks
  svgText = svgText.replace(/<script[\s\S]*?<\/script>/gi, '');
  svgText = svgText.replace(/<script[^>]*\/>/gi, '');
  // Strip event handlers (on*)
  svgText = svgText.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  return Buffer.from(svgText, 'utf-8').toString('base64');
}

/** Validate a single image data URI. Returns an error string or null. */
function validateImageDataUri(uri, label) {
  const parsed = parseDataUri(uri);
  if (!parsed) return `${label}: invalid data URI format`;
  if (!ALLOWED_IMAGE_MIMES.includes(parsed.mime)) {
    return `${label}: unsupported format (${parsed.mime}). Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}`;
  }
  // Validate base64 content
  try {
    const buf = Buffer.from(parsed.data, 'base64');
    if (buf.length === 0) return `${label}: empty image data`;
  } catch {
    return `${label}: malformed base64 data`;
  }
  const base64Size = parsed.data.length;
  if (base64Size > MAX_IMAGE_SIZE_BYTES) {
    return `${label}: image exceeds 500KB limit`;
  }
  return null;
}

/** Sanitize image data URIs — processes SVGs in-place for XSS prevention. */
function sanitizeImageUri(uri) {
  const parsed = parseDataUri(uri);
  if (!parsed) return uri;
  if (parsed.mime === 'image/svg+xml') {
    const sanitized = sanitizeSvg(parsed.data);
    if (sanitized === null) return uri;
    return `data:${parsed.mime};base64,${sanitized}`;
  }
  return uri;
}

/** Validate image-type submission fields. Returns an error string or null. */
function validateImageSubmission(body) {
  const { sequence, answer, options } = body;

  if (sequence.length > MAX_IMAGE_SEQUENCE_LENGTH) {
    return `image puzzles allow at most ${MAX_IMAGE_SEQUENCE_LENGTH} sequence elements`;
  }

  for (let i = 0; i < sequence.length; i++) {
    const err = validateImageDataUri(sequence[i], `sequence[${i}]`);
    if (err) return err;
  }

  const answerErr = validateImageDataUri(answer, 'answer');
  if (answerErr) return answerErr;

  if (options) {
    for (let i = 0; i < options.length; i++) {
      const err = validateImageDataUri(options[i], `options[${i}]`);
      if (err) return err;
    }
  }

  return null;
}

/** Validate provided fields of a partial submission update.
 *  @param {object} body - request body with partial fields
 *  @param {object} [existing] - stored submission row for cross-field validation
 *  Returns an error string or null. */
function validatePartialSubmission(body, existing) {
  const { sequence, answer, explanation, difficulty, category, type, options } = body;

  if (sequence !== undefined) {
    if (!Array.isArray(sequence) || sequence.length < 3) {
      return 'sequence must be an array of at least 3 elements';
    }
  }
  if (answer !== undefined) {
    if (answer === null) return 'answer is required';
    const trimmed = typeof answer === 'string' ? answer.trim() : String(answer);
    if (trimmed.length === 0) return 'answer is required';
  }
  if (explanation !== undefined) {
    if (typeof explanation !== 'string' || explanation.trim().length === 0) {
      return 'explanation is required';
    }
  }
  if (difficulty !== undefined) {
    const diff = Number(difficulty);
    if (!Number.isInteger(diff) || diff < 1 || diff > 3) {
      return 'difficulty must be 1, 2, or 3';
    }
  }
  if (category !== undefined) {
    if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
      return `category must be one of: ${VALID_CATEGORIES.join(', ')}`;
    }
  }
  if (type !== undefined && type !== null) {
    if (typeof type !== 'string' || !VALID_TYPES.includes(type)) {
      return `type must be one of: ${VALID_TYPES.join(', ')}`;
    }
  }

  // Cross-field options/answer validation: merge with stored values
  const effectiveAnswer = answer !== undefined
    ? (typeof answer === 'string' ? answer.trim() : String(answer))
    : (existing ? existing.answer : null);

  const effectiveOptions = options !== undefined
    ? options
    : (existing && existing.options ? JSON.parse(existing.options) : null);

  if (options !== undefined && options !== null) {
    if (!Array.isArray(options) || options.length !== 4) {
      return 'options must be an array of exactly 4 items';
    }
    for (let i = 0; i < options.length; i++) {
      if (typeof options[i] !== 'string' || options[i].trim().length === 0) {
        return 'each option must be a non-empty string';
      }
    }
    const trimmedOptions = options.map(o => o.trim());
    if (new Set(trimmedOptions).size !== 4) {
      return 'options must not contain duplicates';
    }
    if (effectiveAnswer && !trimmedOptions.includes(effectiveAnswer)) {
      return 'options must include the answer';
    }
  } else if (answer !== undefined && effectiveOptions && Array.isArray(effectiveOptions)) {
    // Answer changed but options not provided — check new answer against stored options
    const trimmedStored = effectiveOptions.map(o => String(o).trim());
    if (effectiveAnswer && !trimmedStored.includes(effectiveAnswer)) {
      return 'options must include the answer';
    }
  }

  return null;
}

/** Validate a submission payload. Returns an error string or null. */
function validateSubmission(body) {
  const { sequence, answer, explanation, difficulty, category, type, options } = body;

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

  // Validate type (optional, defaults to 'emoji')
  if (type !== undefined && type !== null) {
    if (typeof type !== 'string' || !VALID_TYPES.includes(type)) {
      return `type must be one of: ${VALID_TYPES.join(', ')}`;
    }
  }

  const isImage = type === 'image';

  // Validate options (optional array of exactly 4 non-empty strings including answer)
  if (options !== undefined && options !== null) {
    if (!Array.isArray(options) || options.length !== 4) {
      return 'options must be an array of exactly 4 items';
    }
    for (let i = 0; i < options.length; i++) {
      if (typeof options[i] !== 'string' || options[i].trim().length === 0) {
        return 'each option must be a non-empty string';
      }
    }
    if (!isImage) {
      const trimmedOptions = options.map(o => o.trim());
      const uniqueOptions = new Set(trimmedOptions);
      if (uniqueOptions.size !== 4) {
        return 'options must not contain duplicates';
      }
      if (!trimmedOptions.includes(trimmedAnswer)) {
        return 'options must include the answer';
      }
    } else {
      // For image options, check uniqueness by value and require answer in options
      const uniqueOptions = new Set(options);
      if (uniqueOptions.size !== 4) {
        return 'options must not contain duplicates';
      }
      if (!options.includes(answer)) {
        return 'options must include the answer';
      }
    }
  }

  // Image-specific validation
  if (isImage) {
    // Image type requires options (answer + 3 distractors)
    if (!options || !Array.isArray(options) || options.length !== 4) {
      return 'image puzzles require exactly 4 options';
    }
    const imageErr = validateImageSubmission(body);
    if (imageErr) return imageErr;
  }

  return null;
}

/** POST /api/submissions — submit a puzzle proposal (requires auth). */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (!isFeatureEnabled('submitPuzzle', req)) {
      return res.status(403).json({ error: 'Submit puzzle feature is not enabled' });
    }

    const error = validateSubmission(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { sequence, answer, explanation, difficulty, category, type, options } = req.body;
    const db = await getDbAdapter();

    const userExists = await db.get('SELECT 1 FROM users WHERE id = ?', [req.user.id]);
    if (!userExists) {
      return res.status(401).json({ error: 'User not found — please log in again' });
    }

    const isImage = type === 'image';
    const trimmedAnswer = isImage ? answer : (typeof answer === 'string' ? answer.trim() : String(answer));
    const submissionType = (type && VALID_TYPES.includes(type)) ? type : 'emoji';

    // Sanitize image data — SVG XSS prevention
    let storedSequence = sequence;
    let storedAnswer = trimmedAnswer;
    let storedOptions = options;
    if (isImage) {
      storedSequence = sequence.map(sanitizeImageUri);
      storedAnswer = sanitizeImageUri(trimmedAnswer);
      storedOptions = Array.isArray(options) ? options.map(sanitizeImageUri) : null;
    }

    const submissionOptions = Array.isArray(storedOptions)
      ? JSON.stringify(isImage ? storedOptions : storedOptions.map(o => o.trim()))
      : null;

    const result = await db.run(
      `INSERT INTO puzzle_submissions (user_id, sequence, answer, explanation, difficulty, category, type, options)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        JSON.stringify(storedSequence),
        storedAnswer,
        explanation.trim(),
        Number(difficulty),
        category,
        submissionType,
        submissionOptions,
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
      `SELECT id, sequence, answer, explanation, difficulty, category, type, options, status, reviewer_notes, created_at, reviewed_at
       FROM puzzle_submissions
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const submissions = rows.map((row) => ({
      ...row,
      sequence: JSON.parse(row.sequence),
      options: row.options ? JSON.parse(row.options) : null,
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
              ps.type, ps.options, ps.status, ps.created_at, u.username AS submitted_by
       FROM puzzle_submissions ps
       JOIN users u ON ps.user_id = u.id
       WHERE ps.status = 'pending'
       ORDER BY ps.created_at ASC`
    );

    const submissions = rows.map((row) => ({
      ...row,
      sequence: JSON.parse(row.sequence),
      options: row.options ? JSON.parse(row.options) : null,
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
      const puzzleType = VALID_TYPES.includes(submission.type) ? submission.type : 'emoji';
      const options = submission.options
        ? submission.options
        : (puzzleType === 'image' ? null : JSON.stringify(generateOptions(submission.sequence, submission.answer)));

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
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              puzzleId,
              submission.category,
              submission.difficulty,
              puzzleType,
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

/** PUT /api/submissions/:id — edit a pending submission (owner or admin/system). */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const isAdmin = req.user.role === 'system' || req.user.role === 'admin';

    // Feature flag required for regular users (admin/system bypass)
    if (!isAdmin && !isFeatureEnabled('submitPuzzle', req)) {
      return res.status(403).json({ error: 'Submit puzzle feature is not enabled' });
    }

    const db = await getDbAdapter();
    const submission = await db.get('SELECT * FROM puzzle_submissions WHERE id = ?', [id]);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Authorization: admin/system can edit any user's pending; regular users only their own
    if (!isAdmin && submission.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own submissions' });
    }

    if (submission.status !== 'pending') {
      return res.status(409).json({ error: 'Cannot edit a reviewed submission' });
    }

    const error = validatePartialSubmission(req.body, submission);
    if (error) {
      return res.status(400).json({ error });
    }

    // Build update fields from provided body keys
    const { sequence, answer, explanation, difficulty, category, type, options } = req.body;
    const updates = [];
    const params = [];

    if (sequence !== undefined) {
      updates.push('sequence = ?');
      params.push(JSON.stringify(sequence));
    }
    if (answer !== undefined) {
      const trimmed = typeof answer === 'string' ? answer.trim() : String(answer);
      updates.push('answer = ?');
      params.push(trimmed);
    }
    if (explanation !== undefined) {
      updates.push('explanation = ?');
      params.push(explanation.trim());
    }
    if (difficulty !== undefined) {
      updates.push('difficulty = ?');
      params.push(Number(difficulty));
    }
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    if (type !== undefined && type !== null) {
      updates.push('type = ?');
      params.push(VALID_TYPES.includes(type) ? type : 'emoji');
    }
    if (options !== undefined) {
      updates.push('options = ?');
      params.push(options !== null ? JSON.stringify(options.map(o => o.trim())) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const updateResult = await db.run(
      `UPDATE puzzle_submissions SET ${updates.join(', ')} WHERE id = ? AND status = 'pending'`,
      params
    );

    if (!updateResult || updateResult.changes === 0) {
      return res.status(409).json({ error: 'Cannot edit a reviewed submission' });
    }

    // Fetch the updated submission to return
    const updated = await db.get(
      `SELECT id, sequence, answer, explanation, difficulty, category, type, options, status, reviewer_notes, created_at, reviewed_at
       FROM puzzle_submissions WHERE id = ?`,
      [id]
    );

    res.json({
      ...updated,
      sequence: JSON.parse(updated.sequence),
      options: updated.options ? JSON.parse(updated.options) : null,
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/submissions/:id — delete a submission (owner or admin/system). */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const db = await getDbAdapter();
    const submission = await db.get('SELECT * FROM puzzle_submissions WHERE id = ?', [id]);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const isAdmin = req.user.role === 'system' || req.user.role === 'admin';

    // Authorization: admin/system can delete any; regular users only their own
    if (!isAdmin && submission.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own submissions' });
    }

    // Hard delete — puzzle in puzzles table (if approved) remains
    const deleteResult = await db.run('DELETE FROM puzzle_submissions WHERE id = ?', [id]);

    if (!deleteResult || deleteResult.changes === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({ message: 'Submission deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
