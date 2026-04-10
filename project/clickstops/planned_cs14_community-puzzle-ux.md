# Clickstop CS14: Community Puzzle Submission UX

**Status:** ⬜ Planned
**Goal:** Improve the community puzzle submission experience for both submitters and admins, adding discovery, authoring tools, moderation, and notifications.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS14-80 | Submission discovery & onboarding | ⬜ Pending | — | Add visible "Community" or "Create" entry point on home screen for all users (logged-out users see CTA to log in). Add brief explainer of how submissions work (submit → review → goes live). |
| CS14-81 | My Submissions dashboard | ⬜ Pending | CS14-80 | New screen showing user's own submissions with status (pending/approved/rejected), reviewer notes, and timestamps. Uses existing `GET /api/submissions` endpoint. |
| CS14-82 | Enhanced puzzle authoring form | ⬜ Pending | CS14-80 | Puzzle type selector (emoji/text/image). Custom options editor (4 options, must include answer). Live preview of how the puzzle will look to players. Validation feedback before submit. |
| CS14-83 | Public community gallery | ⬜ Pending | CS14-81 | Browse approved community puzzles with attribution (submitted by username). Filter by category/difficulty. New API endpoint `GET /api/puzzles/community`. |
| CS14-84 | Admin moderation improvements | ⬜ Pending | CS14-82 | Live puzzle preview in moderation screen. Bulk approve/reject. Edit puzzle before approval (fix typos, adjust options). Submission stats (total pending, approved, rejected). |
| CS14-85 | Submission editing & deletion | ⬜ Pending | CS14-81 | Users can edit pending submissions and delete their own submissions. API endpoints `PUT /api/submissions/:id` and `DELETE /api/submissions/:id` with ownership checks. |
| CS14-86 | Submission notifications | ⬜ Pending | CS14-84 | Notify submitters when their puzzle is approved/rejected (in-app notification or badge on submissions screen). Track unread review results. |
| CS14-87 | Image puzzle submissions | ⬜ Pending | CS14-82 | Image upload support for image-type puzzles. Server-side validation (size, format). Inline base64 storage in MVP (Azure Blob in future phase 2). Preview in authoring form and moderation. |

## Design Decisions

### Global: Feature Flag Gating

**Feature flag gating (PR #91, merged):** `submitPuzzle` is gated by the central feature-flag system (`server/feature-flags.js`). Evaluation order: feature-specific request override (only when that feature allows it in the current environment) → default state → explicit user targeting → deterministic percentage rollout → disabled.

**Configuration:** hidden/disabled by default; can be enabled for explicit users and/or a rollout percentage; request overrides are allowed only outside `production` and `staging`; override names are query param `ff_submit_puzzle` and header `x-gwn-feature-submit-puzzle`. Overrides are opt-in per feature, not a global bypass.

**Flag scope by task:**
| Scope | Tasks | Rationale |
|---|---|---|
| Always visible (no flag) | CS14-80 discovery UI, CS14-81 dashboard, CS14-83 gallery, CS14-85 delete own submission, CS14-86 user notification read/mark-read | Discovery, browsing, viewing own submissions, and reading own notifications are available without the authoring flag |
| Behind `submitPuzzle` flag | CS14-80 actual submit action, CS14-82 authoring form, CS14-85 edit pending submission, CS14-87 image upload | Operations that create submissions or change submission content remain gated behind the authoring feature flag |
| Behind `requireSystem` | CS14-84 moderation, CS14-86 notification creation (triggered by review) | Admin-only operations; notification creation happens as a side effect of the review endpoint |

> **Note:** Puzzle authoring format reference is in the [CS9 archive](done_cs9_content-growth.md).

### Global: Migration Numbering

Current migrations: 001–004. New migrations for CS14:

| Migration | Task | Purpose |
|---|---|---|
| 005 | CS14-82 | Add `type` and `options` columns to `puzzle_submissions` |
| 006 | CS14-86 | Create `notifications` table |

### Global: Shared Components

**Puzzle preview renderer** — a client-side function that renders a puzzle preview given `{type, sequence, answer, options, explanation}`. Used by CS14-82 (authoring preview), CS14-83 (gallery cards), and CS14-84 (moderation preview). Build once in CS14-82, reuse in later tasks.

---

### CS14-80: Submission Discovery & Onboarding

**What exists:**
- Home screen (`public/index.html`) has `show-submit-puzzle` and `show-moderation` buttons, visibility controlled by auth state, role, and feature flags
- Submit screen (`#screen-submit-puzzle`) exists with form fields
- `POST /api/submissions` endpoint works behind `submitPuzzle` flag + `requireAuth`
- Feature flag refresh happens on auth state change

**What's new:**
- A **Community section** on the home screen visible to **all users** regardless of feature flag state
- An **onboarding explainer** explaining the submission flow
- Differentiated logged-out vs logged-in experiences

**Client UI changes:**

1. **Home screen — Community entry point:**
   - Add a "Community Puzzles" card/button group below existing game modes, always visible
   - Contains two sub-buttons: "Browse Community" (→ gallery, CS14-83) and "Create Puzzle" (→ authoring form)
   - "Create Puzzle" button: if logged out → navigates to login with return URL; if logged in but flag off → shows "coming soon" tooltip; if logged in + flag on → opens submit form

2. **Onboarding explainer:**
   - Inline collapsible section (not modal — avoids interrupting flow) at the top of the submit screen
   - Three-step visual: ✏️ Create → 👀 Review → 🎮 Live
   - Brief text: "Submit a puzzle sequence → admins review it → approved puzzles go live for everyone to play"
   - Persisted dismissal via `localStorage` key `gwn_submit_onboarding_dismissed`
   - HTML: `<div id="submit-onboarding" class="onboarding-explainer">` with collapse toggle

3. **Logged-out user experience:**
   - "Create Puzzle" button shows on home screen for all users
   - Clicking while logged out navigates to `#screen-auth` with `data-return="submit-puzzle"` attribute
   - After successful login, auto-redirect to submit screen
   - The return-redirect logic goes in `public/js/app.js` login success handler

**API changes:** None — existing endpoints suffice.

**Database changes:** None.

**Feature flag considerations:**
- Home screen "Community Puzzles" section: **always visible** (discovery should not be gated)
- "Create Puzzle" button visibility: always visible, but **action** gated by flag (logged-in users without flag see a "coming soon" state)
- Actual form submission: still gated by `submitPuzzle` server-side via `POST /api/submissions`

**Test requirements:**
- E2E (Playwright): verify Community section visible when logged out; verify "Create" redirects to login; verify onboarding explainer shows on first visit, hides after dismiss
- Unit: no new server tests needed

**Edge cases:**
- Users who dismiss onboarding and clear localStorage see it again — acceptable
- Feature flag off + logged in: "Create Puzzle" button renders but shows tooltip/disabled state, not hidden (discovery matters)

---

### CS14-81: My Submissions Dashboard

**What exists:**
- `GET /api/submissions` returns current user's submissions with: id, sequence (parsed JSON), answer, explanation, difficulty, category, status, reviewer_notes, created_at, reviewed_at
- No dedicated "my submissions" screen — submissions are only viewable indirectly

**What's new:**
- New screen `#screen-my-submissions` showing the user's submission history
- Navigation from home screen and submit screen

**Client UI changes:**

1. **New screen: `#screen-my-submissions`**
   - HTML: `<section id="screen-my-submissions" class="screen">` in `index.html`
   - Header: "My Submissions" with back button (→ home)
   - Submission list rendered as cards, each showing:
     - Puzzle sequence preview truncated to the first 3 elements, followed by "..." when additional elements exist
     - Category badge and difficulty stars (★★☆ for difficulty 2)
     - **Status badge** with colors: 🟡 `pending` (yellow/amber), 🟢 `approved` (green), 🔴 `rejected` (red)
     - `created_at` as relative time ("2 days ago") — use simple JS date formatting, no library
     - `reviewed_at` (if reviewed) with timestamp
     - Reviewer notes (if present) in a collapsed/expandable section
   - **Empty state:** centered illustration text "No submissions yet" with CTA button "Create your first puzzle →" linking to submit screen
   - Sort order: newest first (matches API default `ORDER BY created_at DESC`)

2. **Navigation:**
   - Home screen: add "My Submissions" button in the Community section (only visible when logged in)
   - Submit screen: add "View My Submissions" link below the form
   - After successful submission: show confirmation with link to "View My Submissions"

3. **JS behavior (`public/js/app.js`):**
   - `showMySubmissions()` function: fetch `GET /api/submissions`, render cards, handle empty state
   - Screen registered in navigation handler
   - Refresh on screen show (always fetch fresh data)

**API changes:** None — `GET /api/submissions` already returns everything needed.

**Database changes:** None.

**Feature flag considerations:**
- "My Submissions" screen: **always visible** for logged-in users (viewing own submissions is non-destructive)
- If user has submissions from when flag was enabled, they should always be viewable even if flag is later disabled

**Test requirements:**
- E2E (Playwright): navigate to My Submissions, verify empty state, create a submission (with flag override), verify it appears with pending status
- Unit (Vitest): no new server tests (endpoint already covered by `tests/submissions.test.js`)

**Edge cases:**
- User with 0 submissions: show empty state with CTA
- Large number of submissions: initially no pagination (submissions per user expected to be low <100), add pagination if needed later
- Submission with very long sequence: truncate preview to first 3 elements (consistent with card spec above)

---

### CS14-82: Enhanced Puzzle Authoring Form

**What exists:**
- Submit screen (`#screen-submit-puzzle`) with fields: category (select), difficulty (select), sequence (textarea), answer (input), explanation (textarea)
- `POST /api/submissions` validates: sequence (array, min 3), answer (required, trimmed), explanation (required), difficulty (1–3), category (from `VALID_CATEGORIES`)
- Approved submissions always become `type='emoji'` with auto-generated options via `generateOptions()`
- `puzzle_submissions` table has: sequence, answer, explanation, difficulty, category — but no `type` or `options` columns

**What's new:**
- Puzzle type selector (emoji, text, image)
- Custom options editor (4 choices, answer must be one of them)
- Live preview showing what the puzzle will look like
- Enhanced client-side validation

**API changes:**

1. **Modified `POST /api/submissions`:**
   - New optional body fields: `type` (string, one of 'emoji', 'text', 'image'; defaults to 'emoji'), `options` (array of 4 strings, must include answer)
   - Validation additions in `validateSubmission()`:
     - `type`: if provided, must be one of `['emoji', 'text', 'image']`
     - `options`: if provided, must be array of exactly 4 non-empty strings, one must match `answer`
     - If `options` not provided, server auto-generates via existing `generateOptions()`
   - Response shape unchanged: `{id, status: "pending", message}`

2. **Modified `PUT /api/submissions/:id/review` (approve path):**
   - When inserting into `puzzles`, use submission's `type` (defaulting to 'emoji') instead of hardcoded 'emoji'
   - Use submission's `options` if provided, otherwise auto-generate

**Database changes:**

- **Migration 005:** Add `type` and `options` columns to `puzzle_submissions`
  ```sql
  ALTER TABLE puzzle_submissions ADD COLUMN type TEXT NOT NULL DEFAULT 'emoji'
    CHECK(type IN ('emoji', 'text', 'image'));
  ALTER TABLE puzzle_submissions ADD COLUMN options TEXT;  -- JSON array, nullable
  ```
  - `options` is nullable: null means "auto-generate on approval" (backward compatible)
  - `type` defaults to 'emoji' for existing rows

**Client UI changes:**

1. **Puzzle type selector:**
   - Three card-style buttons (not dropdown — visual selection is clearer for 3 options):
     - 😀 Emoji — "Use emoji characters in your sequence"
     - 📝 Text — "Use words, numbers, or text patterns"
     - 🖼️ Image — "Upload images for your sequence" (disabled until CS14-87)
   - Selected state: highlighted border + checkmark
   - Default selection: Emoji
   - HTML: `<div class="type-selector">` with `<button data-type="emoji|text|image">`

2. **Options editor:**
   - Below answer field, labeled "Answer Choices (4 options — players pick from these)"
   - 4 input fields, first auto-populated with the answer value
   - Answer field auto-syncs to first option (or whichever is marked as correct)
   - Visual indicator showing which option is the correct answer (radio button or checkmark)
   - Validation: all 4 must be non-empty, no duplicates, answer must be included
   - HTML: `<div class="options-editor">` with 4 `<input>` elements and radio/check indicators

3. **Live preview:**
   - Side panel (desktop) or collapsible section (mobile) showing real-time puzzle rendering
   - Uses the shared **puzzle preview renderer** (see Global: Shared Components)
   - Updates on every input change (debounced 300ms to avoid excessive re-renders)
   - Shows: sequence items in a row → "What comes next?" → 4 option buttons → explanation
   - Matches the actual game screen layout so authors see exactly what players will see
   - HTML: `<div id="puzzle-preview" class="puzzle-preview">`

4. **Enhanced validation feedback:**
   - Inline error messages per field (not just alert on submit)
   - Real-time validation on blur/change
   - Submit button disabled until all validations pass
   - Error states: red border + error text below field

**Feature flag considerations:**
- Entire authoring form: behind `submitPuzzle` flag (server-side enforcement unchanged)
- Image type option: visually present but disabled with "Coming soon" label until CS14-87

**Test requirements:**
- Unit (Vitest):
  - `validateSubmission()` with type field (valid values, invalid values, missing → defaults)
  - `validateSubmission()` with options field (valid 4-element array, wrong count, missing answer, duplicates)
  - Approve flow uses submission type instead of hardcoded 'emoji'
  - Approve flow uses custom options when provided
  - Backward compatibility: submissions without type/options still work
- E2E (Playwright):
  - Select puzzle type, fill options, verify preview updates
  - Submit with custom options, verify stored correctly

**Edge cases:**
- Emoji input: ensure multi-codepoint emoji (🏴‍☠️, 👨‍👩‍👧‍👦) handled correctly in sequence and options
- Text type: no length limit per item, but add max 200 chars per sequence element to prevent abuse
- Options with whitespace-only values: trim and reject empty
- Backward compatibility: existing submissions without `type`/`options` columns still display correctly

---

### CS14-83: Public Community Gallery

**What exists:**
- `GET /api/puzzles` returns all active puzzles (seeded + community) for authenticated users only (`requireAuth` in `server/routes/puzzles.js`)
- Approved community puzzles have `submitted_by` field populated
- Game screens show "Submitted by: ..." attribution when `puzzle.submitted_by` exists
- No dedicated community browsing interface

**What's new:**
- New API endpoint for community puzzle listing with filtering
- Gallery screen for browsing community-created puzzles
- Play-from-gallery flow

**API changes:**

1. **New `GET /api/puzzles/community`:**
   - Auth: `optionalAuth` (public endpoint, auth used for personalization later)
   - Query params:
     - `category` (string, optional) — filter by category
     - `difficulty` (number, optional) — filter by difficulty (1–3)
     - `page` (number, optional, default 1) — pagination
     - `limit` (number, optional, default 20, max 50) — items per page
   - Response:
     ```json
     {
       "puzzles": [
         {
           "id": "community-42",
           "category": "Nature",
           "difficulty": 2,
           "type": "emoji",
           "sequence": ["🌱", "🌿", "🌳"],
           "answer": "🌲",
           "options": ["🌲", "🌵", "🌻", "🍄"],
           "explanation": "Plants growing larger",
           "submitted_by": "puzzlemaster",
           "created_at": "2026-04-01T12:00:00Z"
         }
       ],
       "pagination": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
     }
     ```
   - SQL: `SELECT ... FROM puzzles WHERE submitted_by IS NOT NULL AND active = 1` with optional `AND category = ?` and `AND difficulty = ?`, `ORDER BY created_at DESC`, `LIMIT ? OFFSET ?`
   - Add route in `server/routes/puzzles.js`

**Database changes:** None — uses existing `puzzles` table. May want an index later if gallery traffic is high:
```sql
CREATE INDEX IF NOT EXISTS idx_puzzles_community ON puzzles(submitted_by) WHERE submitted_by IS NOT NULL;
```
This is a performance optimization, not required for initial implementation.

**Client UI changes:**

1. **New screen: `#screen-community-gallery`**
   - Header: "Community Puzzles" with back button (→ home)
   - **Filter bar:** category dropdown + difficulty selector (1–3 stars or "All") + search future placeholder
   - **Grid layout:** 2 columns on mobile, 3 on tablet, 4 on desktop
   - **Puzzle cards:** each shows:
     - Sequence preview (first 3–4 elements)
     - Category + difficulty badges
     - "By: {username}" attribution
     - "Play" button
   - **Pagination:** "Load more" button at bottom (append to grid, don't replace)
   - **Empty state:** "No community puzzles yet — be the first to create one!"

2. **Play from gallery:**
   - Clicking "Play" on a card starts a freeplay game with that specific puzzle
   - Reuses existing game engine — pass puzzle data to `game.js` as a single-puzzle session
   - After completing, return to gallery (not home)
   - No score recording for gallery plays (or record as freeplay mode — TBD)

3. **Navigation:**
   - Home screen Community section: "Browse Community" button → gallery
   - Gallery is accessible without login (public read)

**Feature flag considerations:**
- Gallery browsing: **always visible** (read-only, approved content is public)
- No flag gating needed — puzzles in the gallery are already approved

**Test requirements:**
- Unit (Vitest):
  - `GET /api/puzzles/community` returns only community puzzles (submitted_by IS NOT NULL)
  - Pagination: correct page/limit/total/offset
  - Filters: category, difficulty, combined
  - Empty result set returns empty array with pagination metadata
- E2E (Playwright):
  - Navigate to gallery, verify puzzle cards render
  - Click "Play" on a card, verify game starts with that puzzle

**Edge cases:**
- Gallery with 0 community puzzles: show empty state with CTA to create
- Pagination boundary: last page may have fewer items
- Puzzles deactivated after approval (`active = 0`): excluded from gallery
- Category filter with no matches: show "No puzzles in this category"

---

### CS14-84: Admin Moderation Improvements

**What exists:**
- Moderation screen (`#screen-moderation`) with tabs for submissions and users
- `GET /api/submissions/pending` returns pending submissions with submitter username (requireSystem)
- `PUT /api/submissions/:id/review` approves or rejects with optional reviewer notes (requireSystem)
- Approve inserts into `puzzles` table with auto-generated options and hardcoded type='emoji'

**What's new:**
- Live puzzle preview in moderation queue
- Bulk approve/reject operations
- Edit-before-approve capability
- Submission statistics dashboard

**API changes:**

1. **New `GET /api/submissions/stats`:**
   - Auth: `requireSystem`
   - Response:
     ```json
     {
       "pending": 12,
       "approved": 45,
       "rejected": 8,
       "total": 65,
       "today": { "submitted": 3, "reviewed": 5 }
     }
     ```
   - SQL: `SELECT status, COUNT(*) FROM puzzle_submissions GROUP BY status` + date-filtered counts

2. **Shared `PUT /api/submissions/:id` (admin edit before approve):**
   - Auth: `requireAuth` + authorization logic inside the handler: allow if user is admin/system role OR if user owns the submission
   - This is the **same endpoint** that CS14-85 uses for user edits — implement once with shared auth logic
   - Body: any subset of `{sequence, answer, explanation, difficulty, category, type, options}`
   - Validation: same rules as submission creation for provided fields
   - Only allowed on `pending` submissions (409 if already reviewed) for both admin and owner paths
   - Admin/system users can edit any user's pending submission; regular users can only edit their own
   - Response: updated submission object

3. **New `POST /api/submissions/bulk-review`:**
   - Auth: `requireSystem`
   - Body: `{ ids: [1, 2, 3], status: "approved"|"rejected", reviewerNotes: "optional" }`
   - Validation: all IDs must exist and be pending; if any fail, return partial results
   - Response: `{ results: [{ id: 1, status: "approved" }, { id: 2, error: "already reviewed" }] }`
   - Each approval still triggers puzzle insertion (reuse existing logic)
   - Uses transaction for atomicity per-item (not all-or-nothing — partial success is acceptable)

**Database changes:** None — uses existing tables.

**Client UI changes:**

1. **Live preview in moderation:**
   - Each submission card in the moderation queue gets an expandable preview section
   - Reuses the **puzzle preview renderer** from CS14-82
   - Click "Preview" to expand inline (not modal — allows comparing multiple submissions)

2. **Bulk operations:**
   - Checkbox on each submission card
   - "Select All" checkbox in header
   - Floating action bar appears when ≥1 selected: "Approve Selected (N)" / "Reject Selected (N)"
   - Confirmation dialog before bulk action: "Approve N submissions?"
   - Progress indicator during bulk operation
   - Results summary after completion: "5 approved, 1 already reviewed"

3. **Edit before approve:**
   - "Edit" button on each pending submission card
   - Inline editing: fields become editable inputs (sequence textarea, answer input, etc.)
   - "Save" / "Cancel" buttons replace "Edit" when in edit mode
   - After save, card refreshes with updated data
   - Then admin can approve the edited version

4. **Stats display:**
   - Stats bar at the top of the moderation screen (always visible)
   - Four metric cards: Pending (with count badge), Approved, Rejected, Today's Activity
   - Auto-refresh stats after any review action

**Feature flag considerations:**
- All moderation features: behind `requireSystem` (admin/system role only)
- No `submitPuzzle` flag dependency — moderation works regardless of submission flag state

**Test requirements:**
- Unit (Vitest):
  - `GET /api/submissions/stats` returns correct counts
  - `PUT /api/submissions/:id` updates fields, validates, rejects non-pending
  - `POST /api/submissions/bulk-review` approves/rejects multiple, handles partial failures
  - Bulk approve creates puzzle entries for each approved submission
  - Auth: all three endpoints require system/admin role
- E2E (Playwright): verify preview renders in moderation, bulk select + approve flow

**Edge cases:**
- Bulk operation with mix of pending and already-reviewed: return per-item results, don't fail all
- Edit + approve race condition: use `WHERE status = 'pending'` in update query
- Empty pending queue: show "All caught up! No pending submissions" message
- Stats with 0 submissions: all counts show 0

---

### CS14-85: Submission Editing & Deletion

**What exists:**
- `GET /api/submissions` returns user's own submissions (requireAuth)
- No edit or delete endpoints
- Submissions have `status` field: pending, approved, rejected

**What's new:**
- Edit pending submissions (PUT endpoint)
- Delete own submissions (DELETE endpoint)
- UI controls on My Submissions screen

**API changes:**

1. **New `PUT /api/submissions/:id`:**
   - Auth: `requireAuth` + ownership check (`user_id = req.user.id`)
   - Body: any subset of `{sequence, answer, explanation, difficulty, category, type, options}`
   - Constraints:
     - Only allowed on `pending` submissions (409 if approved/rejected — "Cannot edit a reviewed submission")
     - Same validation rules as `POST /api/submissions` for provided fields
     - Feature flag: `submitPuzzle` must be enabled (same gate as creating)
   - Response: updated submission object
   - Note: admin edit (CS14-84) uses the same endpoint path but different auth (`requireSystem`). Implementation approach: single route handler that checks if user is admin/system OR owner. Edits remain **pending-only** for both paths; the admin/system "broader access" here means they may edit **any user's pending submission**, whereas a normal user may edit **only their own pending submission**. Admins/system must **not** be allowed to edit approved or rejected submissions via this endpoint.

2. **New `DELETE /api/submissions/:id`:**
   - Auth: `requireAuth` + ownership check
   - Behavior: **hard delete** (not soft delete) — community submissions are proposals, not permanent records. Approved submissions that already created puzzles: the puzzle remains (it's a separate entity), only the submission record is deleted.
   - Constraints:
     - User can delete own submissions in **any** status (pending, approved, rejected)
     - Feature flag: NOT required for deletion (users should always be able to clean up their submissions)
     - Admins can delete any submission via `requireSystem` OR ownership check
   - Response: `{ message: "Submission deleted" }` with 200 status
   - If submission doesn't exist: 404

**Database changes:** None.

**Client UI changes:**

1. **My Submissions screen cards (CS14-81) — add action buttons:**
   - **Pending submissions:** "Edit" button (opens edit form) + "Delete" button
   - **Approved/rejected submissions:** "Delete" button only (no edit)
   - Buttons appear in card footer

2. **Edit form:**
   - Reuses the authoring form from CS14-82 but pre-populated with existing values
   - Appears inline (replaces card content) or as a slide-out panel
   - "Save Changes" + "Cancel" buttons
   - On save: `PUT /api/submissions/:id` → refresh card with updated data
   - Validation: same as authoring form (real-time, inline errors)

3. **Delete confirmation:**
   - Click "Delete" → confirmation dialog: "Delete this submission? This cannot be undone."
   - For approved submissions: additional note "The puzzle will remain live even if you delete this submission."
   - On confirm: `DELETE /api/submissions/:id` → remove card from list with animation
   - On cancel: close dialog

**Feature flag considerations:**
- Edit: behind `submitPuzzle` flag (same as creation — if you can't create, you can't edit)
- Delete: **not gated** — users should always be able to remove their own submissions
- Server enforces flag on PUT, not on DELETE

**Test requirements:**
- Unit (Vitest):
  - PUT: edit pending submission (success), edit approved (409), edit other user's (403), edit nonexistent (404)
  - PUT: validation of each field
  - PUT: feature flag enforcement
  - DELETE: delete own pending (200), delete own approved (200), delete other user's (403), delete nonexistent (404)
  - DELETE: verify hard delete (row gone from DB)
  - DELETE: approved submission deleted but puzzle remains in puzzles table
- E2E (Playwright): edit a pending submission, delete a submission with confirmation

**Edge cases:**
- Race condition: user edits while admin reviews → `WHERE status = 'pending'` prevents editing reviewed submissions
- Delete approved submission: puzzle in `puzzles` table is independent, remains active
- Edit with identical values: still succeeds (idempotent update)
- Large sequence edit: same validation as creation (min 3 elements)

---

### CS14-86: Submission Notifications

**What exists:**
- `PUT /api/submissions/:id/review` updates submission status and reviewer_notes
- No notification system of any kind
- No unread tracking

**What's new:**
- In-app notification system for submission review results
- Unread badge indicator
- Notification list/panel

**API changes:**

1. **New `GET /api/notifications`:**
   - Auth: `requireAuth`
   - Query params: `unread` (boolean, optional — filter to unread only)
   - Response:
     ```json
     {
       "notifications": [
         {
           "id": 1,
           "type": "submission_approved",
           "message": "Your puzzle was approved and is now live!",
           "data": { "submissionId": 42, "puzzleId": "community-42" },
           "read": false,
           "created_at": "2026-04-05T14:30:00Z"
         }
       ],
       "unread_count": 3
     }
     ```
   - Returns most recent 50 notifications, ordered by `created_at DESC`

2. **New `PUT /api/notifications/:id/read`:**
   - Auth: `requireAuth` + ownership check
   - Marks a single notification as read
   - Response: `{ id, read: true }`

3. **New `PUT /api/notifications/read-all`:**
   - Auth: `requireAuth`
   - Marks all of the user's notifications as read
   - Response: `{ updated: N }`

4. **Modified `PUT /api/submissions/:id/review`:**
   - After updating submission status, insert a notification for the submitter:
     - Approved: `type = "submission_approved"`, message includes puzzle going live
     - Rejected: `type = "submission_rejected"`, message includes reviewer notes if present
   - Notification creation is best-effort (don't fail the review if notification insert fails)

5. **New `GET /api/notifications/count`:**
   - Auth: `requireAuth`
   - Response: `{ unread_count: 3 }`
   - Lightweight endpoint for polling badge count without fetching full notifications

**Database changes:**

- **Migration 006:** Create `notifications` table
  ```sql
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,              -- JSON, nullable (e.g., {"submissionId": 42})
    read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications(user_id, read);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);
  ```

**Client UI changes:**

1. **Notification badge:**
   - Bell icon or badge on the "My Submissions" button (home screen)
   - Shows unread count (number or dot)
   - Poll `GET /api/notifications/count` every 60 seconds when user is logged in
   - Update immediately after viewing notifications (optimistic UI)

2. **Notification list:**
   - Shown at the top of My Submissions screen (not a separate screen — keep it simple)
   - Collapsible section "Notifications (N unread)"
   - Each notification: icon (✅ approved / ❌ rejected), message, relative timestamp, "mark read" button
   - Click notification → scrolls to or highlights the relevant submission in the list below
   - "Mark all as read" link in section header

3. **Notification triggers:**
   - `submission_approved` — "Your puzzle '{first 3 sequence items}...' was approved! It's now live in the Community Gallery."
   - `submission_rejected` — "Your puzzle '{first 3 sequence items}...' was not approved." + reviewer notes if present

**Feature flag considerations:**
- Notification endpoints: **no flag** — notifications are a core UX improvement, not a feature-flag candidate
- Notification creation: triggered by admin review action (already behind `requireSystem`)

**Test requirements:**
- Unit (Vitest):
  - `GET /api/notifications` returns user's notifications, respects `unread` filter
  - `PUT /api/notifications/:id/read` marks as read, rejects other user's notification
  - `PUT /api/notifications/read-all` marks all as read
  - `GET /api/notifications/count` returns correct unread count
  - Review approve → creates notification for submitter
  - Review reject → creates notification with reviewer notes
  - Notification creation failure doesn't break review endpoint
- E2E (Playwright): submit puzzle, approve it, verify notification badge appears, view and mark as read

**Edge cases:**
- User deleted while notifications exist: orphaned notifications are harmless (foreign key is soft — no cascade needed since user deletion is not currently supported)
- Bulk review (CS14-84): create one notification per submission, not one bulk notification
- Rapid polling: 60-second interval is conservative; no server-side rate limiting needed for this endpoint beyond global rate limits
- Notification table growth: no auto-cleanup initially; add a retention policy later if needed (e.g., delete read notifications older than 90 days)

---

### CS14-87: Image Puzzle Submissions

**What exists:**
- Puzzles table supports `type = 'image'` (CHECK constraint allows 'emoji', 'text', 'image')
- `public/img/` has existing SVG image assets for built-in puzzles (shapes, colors)
- No upload mechanism exists
- Submit form only handles text/emoji input

**What's new:**
- Image upload in authoring form
- Server-side storage and validation
- Inline resolvable image source support for MVP (base64 data URIs stored in submission payloads)
- Image preview in authoring and moderation

**API changes:**

1. **Modified `POST /api/submissions`:**
   - When `type = 'image'`, accept `sequence` as an array of **resolvable image source strings**. In Phase 1/MVP these are base64 data URIs (format: `data:image/png;base64,...`).
   - Canonical contract for image puzzles: `sequence`, `answer`, and any image-valued entries in `options` are stored and returned in the same resolvable format the client can pass directly to `<img src>`.
   - Alternative considered and rejected: separate upload endpoint with file references. Base64-in-JSON is simpler for the MVP — no multipart handling, no temporary file management, no separate upload state. The size limits (below) keep payloads reasonable.
   - Validation for image submissions:
     - Each sequence element: valid base64 data URI with recognized MIME type
     - Allowed formats: `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml`, `image/webp`
     - Max size per image: 500KB (base64-encoded, ~375KB raw)
     - Max sequence length for images: 6 elements (to limit total payload)
     - Answer: also a resolvable image source string (base64 data URI for image-based answers)
     - Options: array of 4 items — answer + 3 distractors; for image puzzles, all option values use the same resolvable image source format
   - **Body parser limit:** The server applies `express.json()` globally (default 100KB limit) in `server/app.js` before routes are matched. Image submissions can reach ~5MB. To support this, modify the global JSON parser to conditionally use a higher limit for the submissions route: either (a) skip the global parser for `/api/submissions` and let the router apply its own `express.json({ limit: '6mb' })`, or (b) use a conditional middleware that checks `req.path` before parsing (e.g., `app.use('/api/submissions', express.json({ limit: '6mb' }))` mounted before the default parser). Option (a) is cleaner — add `/api/submissions` to the parser exclusion list alongside the existing telemetry exclusion.

**Database changes:**

- **No migration required:** No separate `image_data` column needed in the MVP.
  - For image-type submissions, `puzzle_submissions.sequence` stores the canonical image source strings (base64 data URIs) directly, same as emoji/text submissions store their sequence data.
  - `answer` and image-valued `options` likewise store the same canonical representation directly.
  - On approval, `puzzles.sequence` stores the same canonical image source strings so approved community puzzles render without client-side transformation.
  - For non-image submissions, storage remains unchanged.
  - Note: this means submission rows for image puzzles will be larger. Sequence images alone are ~3MB max (6 × 500KB), and the worst case is closer to ~5MB if the answer and 3 distractor options are also uploaded as additional images.

**Storage strategy:**

- **Phase 1 (this task):** Store image puzzle assets inline as base64 data URIs in the existing JSON fields (`sequence`, `answer`, and image-valued `options`). Simple, no external dependencies, works in both dev and prod, and matches the current client expectation that image entries are directly usable as `<img src>` values.
  - Tradeoff: larger DB rows and API payloads, but community submission volume is expected to be low initially
  - Max storage per submission: ~3MB for the sequence alone (6 images × 500KB), or up to ~5MB worst case if the answer and 3 distractor options are also image-based uploads
- **Phase 2 (future, not in CS14):** Migrate to Azure Blob Storage for production if image volume grows while preserving the same API contract that image entries are resolvable `src` values. This would involve:
  - New `AZURE_BLOB_CONNECTION_STRING` config var
  - Upload to blob on submit and replace stored data URIs with blob URLs in `sequence` / `answer` / image-valued `options`
  - Serve directly via blob URL or proxy endpoint, while keeping read responses backward-compatible for the client
- **Dev environment:** always uses DB storage (no Azure dependency)

**Client UI changes:**

1. **Image type in authoring form (CS14-82 extension):**
   - When "Image" type selected, sequence input changes from textarea to image uploader
   - **Image uploader per sequence element:**
     - Drop zone with "Click or drag to upload"
     - File input accepting `.png, .jpg, .gif, .svg, .webp`
     - Client-side validation: file size, format, dimensions (max 1024×1024 recommended)
     - Preview thumbnail after upload
     - "Remove" button per image
     - Reorder via drag-and-drop (stretch goal — manual index for MVP)
   - **Answer image:** separate uploader for the correct answer image
   - **Distractor images:** 3 additional uploaders for wrong-answer images (options)

2. **Live preview for image puzzles:**
   - Puzzle preview renderer shows image thumbnails in sequence
   - Option buttons show image thumbnails instead of text
   - Uses `URL.createObjectURL()` for local preview before upload (no server round-trip)

3. **Image display in moderation (CS14-84 extension):**
   - Moderation preview renders images directly from `sequence` data (base64 data URIs are directly usable as `<img src>`)
   - Lazy loading: use `loading="lazy"` attribute on `<img>` elements for large image sequences

**Feature flag considerations:**
- Image type option: behind `submitPuzzle` flag (same as all submission writes)
- The type selector in CS14-82 initially shows image as disabled; this task enables it

**Test requirements:**
- Unit (Vitest):
  - Submit image puzzle: valid base64 data URIs, correct MIME types
  - Validation: reject oversized images, invalid formats, too many sequence elements
  - Validation: reject malformed data URIs, non-image MIME types
  - Approve image submission: puzzle created with image data URIs in sequence/options
  - Non-image submissions: storage unchanged, no data URI validation applied
- E2E (Playwright):
  - Upload images in authoring form, verify preview renders
  - Submit image puzzle, verify it appears in My Submissions with image previews
  - (Moderation preview of image puzzles covered by CS14-84 tests)

**Edge cases:**
- Very large images: 500KB limit enforced both client-side and server-side
- Unsupported format: reject with clear error message listing allowed formats
- Corrupt image data: validate base64 decoding succeeds, catch malformed data URIs
- SVG security: sanitize SVG content to prevent XSS (strip `<script>` tags, event handlers)
- Browser memory: client-side preview uses object URLs — revoke after use to avoid leaks
- Sequence with mix of images and text: not supported — all elements must be the same type

---

### Parallelism & Dependencies

```
CS14-80 (Discovery & Onboarding)
  ├── CS14-81 (My Submissions Dashboard) ──┬── CS14-83 (Community Gallery)
  │                                        └── CS14-85 (Editing & Deletion)
  └── CS14-82 (Enhanced Authoring Form) ───┬── CS14-84 (Admin Moderation)── CS14-86 (Notifications)
                                           └── CS14-87 (Image Submissions)
```

**Parallel execution groups:**
1. **Wave 1:** CS14-80 (sole prerequisite for everything)
2. **Wave 2:** CS14-81 + CS14-82 (parallel — independent UI work)
3. **Wave 3:** CS14-83 + CS14-84 + CS14-85 (parallel after their deps) + CS14-87 (parallel after CS14-82)
4. **Wave 4:** CS14-86 (requires CS14-84 for review-triggered notifications)

**Shared components across tasks:**
- **Puzzle preview renderer:** Built in CS14-82, reused by CS14-83 (gallery cards) and CS14-84 (moderation preview)
- **Options editor:** Built in CS14-82, reused by CS14-84 (edit before approve) and CS14-85 (edit own)
- **Submission card component:** Built in CS14-81, extended by CS14-85 (action buttons)

## Notes

**Migration order is strict:** 005 (CS14-82) → 006 (CS14-86). Each migration is additive so they don't conflict. `_tracker.js` only requires migration versions to be unique and increasing so they sort correctly; keeping the numbering sequential is a team convention for clarity and easier tracking. CS14-87 requires no migration — image data is stored inline in existing JSON fields.

**No breaking API changes:** All new body fields are optional with backward-compatible defaults. Existing clients and tests continue to work without modification.

**Test budget:** ~15–20 new Vitest tests across CS14-80 through CS14-87, plus ~8–10 new Playwright E2E tests. Existing 21 submission tests remain unchanged.
