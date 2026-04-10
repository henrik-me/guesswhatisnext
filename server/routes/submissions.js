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

/**
 * Build a short preview of a sequence for notification messages.
 * Shows first 3 items joined by commas with trailing ellipsis.
 * Image submissions use a placeholder since items are data URIs.
 */
function sequencePreview(sequenceStr, type) {
  if (type === 'image') return '🖼️ image puzzle';
  try {
    const seq = typeof sequenceStr === 'string' ? JSON.parse(sequenceStr) : sequenceStr;
    if (!Array.isArray(seq)) return '…';
    const items = seq.slice(0, 3).map(item => {
      const s = String(item);
      return s.length > 30 ? s.slice(0, 30) + '…' : s;
    });
    return items.join(', ') + (seq.length > 3 ? ', …' : '');
  } catch {
    return '…';
  }
}

/**
 * Create a notification for a submission review result (best-effort).
 * Errors are logged but never propagated to the caller.
 */
async function createReviewNotification(db, submission, status, reviewerNotes) {
  try {
    const preview = sequencePreview(submission.sequence, submission.type);
    let message;
    let type;

    if (status === 'approved') {
      type = 'submission_approved';
      message = `Your puzzle '${preview}' was approved! It's now live in the Community Gallery.`;
    } else {
      type = 'submission_rejected';
      message = `Your puzzle '${preview}' was not approved.`;
      if (reviewerNotes) {
        message += ` Reviewer notes: ${reviewerNotes}`;
      }
    }

    const data = JSON.stringify({ submissionId: submission.id });
    await db.run(
      'INSERT INTO notifications (user_id, type, message, data) VALUES (?, ?, ?, ?)',
      [submission.user_id, type, message, data]
    );
  } catch (err) {
    logger.warn({ err, submissionId: submission.id }, 'Failed to create review notification');
  }
}
const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 500KB decoded bytes
const MAX_IMAGE_SEQUENCE_LENGTH = 6;
const DATA_URI_REGEX = /^data:([a-z]+\/[a-z0-9.+_-]+);base64,(.+)$/i;

/** Validate a base64 data URI. Returns { mime, data } or null. */
function parseDataUri(str) {
  if (typeof str !== 'string') return null;
  const match = str.match(DATA_URI_REGEX);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), data: match[2] };
}

/** Sanitize SVG content — strip dangerous elements, attributes, and URLs. */
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
  // Strip dangerous elements: foreignObject, iframe, embed, object
  svgText = svgText.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  svgText = svgText.replace(/<(iframe|embed|object)[\s\S]*?<\/\1>/gi, '');
  svgText = svgText.replace(/<(iframe|embed|object)[^>]*\/>/gi, '');
  // Strip event handlers (on*)
  svgText = svgText.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Strip javascript: URLs in href/xlink:href/src attributes (handles quoted and unquoted)
  svgText = svgText.replace(/\s+(href|xlink:href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]*)/gi, '');
  return Buffer.from(svgText, 'utf-8').toString('base64');
}

/** Validate a single image data URI. Returns an error string or null. */
function validateImageDataUri(uri, label) {
  const parsed = parseDataUri(uri);
  if (!parsed) return `${label}: invalid data URI format`;
  if (!ALLOWED_IMAGE_MIMES.includes(parsed.mime)) {
    return `${label}: unsupported format (${parsed.mime}). Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}`;
  }
  // Validate base64 content — strict: reject if roundtrip doesn't match
  let buf;
  try {
    buf = Buffer.from(parsed.data, 'base64');
    if (buf.length === 0) return `${label}: empty image data`;
    if (buf.toString('base64') !== parsed.data) return `${label}: malformed base64 data`;
  } catch {
    return `${label}: malformed base64 data`;
  }
  // Compare decoded byte length (not base64 char count) to the size limit
  if (buf.length > MAX_IMAGE_SIZE_BYTES) {
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
      if (!options.includes(trimmedAnswer)) {
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

/** Validate a partial submission update. Returns an error string or null. */

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
      // Re-check uniqueness after sanitization (SVG sanitization can make distinct URIs collide)
      if (storedOptions) {
        const unique = new Set(storedOptions);
        if (unique.size !== storedOptions.length) {
          return res.status(400).json({ error: 'options must not contain duplicates (after sanitization)' });
        }
        if (!storedOptions.includes(storedAnswer)) {
          return res.status(400).json({ error: 'options must include the answer (after sanitization)' });
        }
      }
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

/** GET /api/submissions/stats — submission statistics (system/admin only). */
router.get('/stats', requireSystem, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const statusRows = await db.all(
      'SELECT status, COUNT(*) AS count FROM puzzle_submissions GROUP BY status'
    );

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of statusRows) {
      if (counts[row.status] !== undefined) {
        counts[row.status] = Number(row.count);
      }
    }
    const total = counts.pending + counts.approved + counts.rejected;

    // Day boundaries in UTC to match SQLite CURRENT_TIMESTAMP (UTC) and MSSQL GETUTCDATE().
    // Assumes all stored timestamps are UTC; MSSQL GETDATE() (local time) may skew "today" counts.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const y = now.getUTCFullYear();
    const m = pad(now.getUTCMonth() + 1);
    const d = pad(now.getUTCDate());
    const startOfDay = `${y}-${m}-${d} 00:00:00`;
    const startOfNextDay = (() => {
      const next = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate() + 1));
      return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())} 00:00:00`;
    })();

    const todaySubmitted = await db.get(
      'SELECT COUNT(*) AS count FROM puzzle_submissions WHERE created_at >= ? AND created_at < ?',
      [startOfDay, startOfNextDay]
    );
    const todayReviewed = await db.get(
      'SELECT COUNT(*) AS count FROM puzzle_submissions WHERE reviewed_at >= ? AND reviewed_at < ?',
      [startOfDay, startOfNextDay]
    );

    res.json({
      pending: counts.pending,
      approved: counts.approved,
      rejected: counts.rejected,
      total,
      today: {
        submitted: Number(todaySubmitted?.count ?? 0),
        reviewed: Number(todayReviewed?.count ?? 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/submissions/:id — edit a pending submission (admin or owner). */
router.put('/:id', requireAuth, async (req, res, next) => {
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

    const isAdminOrSystem = req.user.role === 'admin' || req.user.role === 'system';
    const isOwner = submission.user_id === req.user.id;

    if (!isAdminOrSystem && !isOwner) {
      return res.status(403).json({ error: 'Not authorized to edit this submission' });
    }

    if (submission.status !== 'pending') {
      return res.status(409).json({ error: 'Cannot edit a reviewed submission' });
    }

    // Regular users need the submitPuzzle feature flag
    if (!isAdminOrSystem && !isFeatureEnabled('submitPuzzle', req)) {
      return res.status(403).json({ error: 'Submit puzzle feature is not enabled' });
    }

    const error = validatePartialSubmission(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const { sequence, answer, explanation, difficulty, category, type, options } = req.body;
    const updates = [];
    const params = [];

    if (sequence !== undefined) {
      updates.push('sequence = ?');
      params.push(JSON.stringify(sequence));
    }
    if (answer !== undefined) {
      updates.push('answer = ?');
      params.push(typeof answer === 'string' ? answer.trim() : String(answer));
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
      params.push(type);
    }
    if (options !== undefined) {
      const normalizedOptions = options === null ? null : options.map(o => o.trim());
      const effectiveAnswer = answer !== undefined
        ? (typeof answer === 'string' ? answer.trim() : String(answer))
        : submission.answer;

      if (
        normalizedOptions !== null &&
        typeof effectiveAnswer === 'string' &&
        effectiveAnswer.length > 0 &&
        !normalizedOptions.includes(effectiveAnswer)
      ) {
        return res.status(400).json({ error: 'Options must include the correct answer' });
      }

      updates.push('options = ?');
      params.push(normalizedOptions === null ? null : JSON.stringify(normalizedOptions));
    }

    // Cross-validate: if only answer changes, check it still fits existing options
    if (answer !== undefined && options === undefined && submission.options) {
      const existingOptions = JSON.parse(submission.options);
      const newAnswer = typeof answer === 'string' ? answer.trim() : String(answer);
      if (!existingOptions.includes(newAnswer)) {
        return res.status(400).json({ error: 'New answer must be included in existing options, or update options too' });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const result = await db.run(
      `UPDATE puzzle_submissions SET ${updates.join(', ')} WHERE id = ? AND status = 'pending'`,
      params
    );

    if (result.changes === 0) {
      return res.status(409).json({ error: 'Cannot edit a reviewed submission' });
    }

    const updated = await db.get('SELECT * FROM puzzle_submissions WHERE id = ?', [id]);
    res.json({
      ...updated,
      sequence: JSON.parse(updated.sequence),
      options: updated.options ? JSON.parse(updated.options) : null,
    });
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

      if (puzzleType === 'image' && !options) {
        return res.status(400).json({ error: 'Cannot approve image puzzle without options' });
      }

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

      await createReviewNotification(db, submission, status, notes);

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

    await createReviewNotification(db, submission, status, notes);

    res.json({ id, status, message: `Submission ${status}` });
  } catch (err) {
    next(err);
  }
});

/** GET /api/submissions/stats — get submission statistics (system/admin only). */
router.get('/stats', requireSystem, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const statusRows = await db.all(
      'SELECT status, COUNT(*) AS count FROM puzzle_submissions GROUP BY status'
    );

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of statusRows) {
      if (counts[row.status] !== undefined) {
        counts[row.status] = row.count;
      }
    }
    const total = counts.pending + counts.approved + counts.rejected;

    const todaySubmitted = await db.get(
      "SELECT COUNT(*) AS count FROM puzzle_submissions WHERE DATE(created_at) = DATE('now')"
    );
    const todayReviewed = await db.get(
      "SELECT COUNT(*) AS count FROM puzzle_submissions WHERE DATE(reviewed_at) = DATE('now')"
    );

    res.json({
      pending: counts.pending,
      approved: counts.approved,
      rejected: counts.rejected,
      total,
      today: {
        submitted: todaySubmitted ? todaySubmitted.count : 0,
        reviewed: todayReviewed ? todayReviewed.count : 0,
      },
    });
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

/** POST /api/submissions/bulk-review — batch approve/reject (system/admin only). */
router.post('/bulk-review', requireSystem, async (req, res, next) => {
  try {
    const { ids, status, reviewerNotes } = req.body;

    const MAX_BULK_SIZE = 50;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (ids.length > MAX_BULK_SIZE) {
      return res.status(400).json({ error: `Maximum ${MAX_BULK_SIZE} submissions per bulk operation` });
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
    const results = [];

    for (const rawId of ids) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        results.push({ id: Number(rawId) || 0, rawId, error: 'Invalid submission ID' });
        continue;
      }

      const submission = await db.get('SELECT * FROM puzzle_submissions WHERE id = ?', [id]);
      if (!submission) {
        results.push({ id, error: 'Submission not found' });
        continue;
      }
      if (submission.status !== 'pending') {
        results.push({ id, error: 'Already reviewed' });
        continue;
      }

      if (status === 'approved') {
        const submitter = await db.get('SELECT username FROM users WHERE id = ?', [submission.user_id]);
        const puzzleId = `community-${id}`;
        const puzzleType = VALID_TYPES.includes(submission.type) ? submission.type : 'emoji';
        const puzzleOptions = submission.options
          ? submission.options
          : JSON.stringify(generateOptions(submission.sequence, submission.answer));

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
                puzzleOptions,
                submission.explanation,
                submitter ? submitter.username : null,
              ]
            );
          });
          results.push({ id, status: 'approved' });
          await createReviewNotification(db, submission, status, notes);
        } catch (err) {
          if (err && err.message === 'ALREADY_REVIEWED') {
            results.push({ id, error: 'Already reviewed' });
          } else {
            logger.error({ err, submissionId: id }, 'Error during bulk approve');
            results.push({ id, error: 'Internal error' });
          }
        }
      } else {
        // Rejected
        try {
          const result = await db.run(
            `UPDATE puzzle_submissions
             SET status = ?, reviewer_notes = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'pending'`,
            [status, notes, id]
          );
          if (result.changes === 0) {
            results.push({ id, error: 'Already reviewed' });
          } else {
            results.push({ id, status: 'rejected' });
            await createReviewNotification(db, submission, status, notes);
          }
        } catch (e) {
          req.log?.error?.({ submissionId: id, err: e }, 'bulk-review reject failed');
          results.push({ id, error: 'Internal error' });
        }
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
