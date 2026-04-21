# CS45 — INSTRUCTIONS.md Structural Split

**Status:** 🔄 Active
**Goal:** Split the 700+-line `INSTRUCTIONS.md` into focused, single-purpose documents so each file has a clear scope, lower drift surface, and is easier to keep internally consistent.

**Origin:** Identified by the local `review.md` operating-model review (finding 4 / improvement 4). `INSTRUCTIONS.md` currently mixes hard policy, rationale, examples, tooling commands, agent prompts, review procedure, and workflow theory in a single file. CS31 (Instructions Optimization) and CS36 (Instructions Lifecycle Clarity) reworked the content but did not split the file. The result is workable for a disciplined operator but is not easy to keep internally consistent — and the stale `CONTEXT.md` sections that triggered review.md were partly evidence of that drift propagating from `INSTRUCTIONS.md` outward.

---

## Problem

A single file mixing four distinct audiences and lifecycles:

1. **Durable policy** ("no direct commits to main except WORKBOARD.md", "PRs are squash-merged", "use Pino, not console.*"). Changes rarely. Always relevant.
2. **Day-to-day workflow procedures** (how to claim a clickstop, how to dispatch a sub-agent, how to handle deployment approval gates). Changes occasionally. Relevant when starting a task.
3. **Review-loop procedures** (Local Review Loop, Copilot review thread resolution, the GraphQL commands). Changes occasionally. Relevant during PR work only.
4. **Tracking lifecycle** (clickstop file naming, WORKBOARD.md update protocol, CONTEXT.md update protocol). Changes occasionally. Relevant during planning and closeout.

When all four live in one file:
- Updates to one section risk silently contradicting another.
- The "quick checklist" at the top duplicates content from later sections (drift surface).
- Newcomers must read 700+ lines to find the policies relevant to their current task.
- Search-and-replace edits are higher-risk because the same term (e.g. "WORKBOARD.md") appears in many distinct contexts.

## Approach

Split into four files, each with a single audience and lifecycle. Cross-references replace duplication. The "link, don't restate" principle from CS43-1 governs how the new files relate to each other.

Target structure:

| File | Scope | Audience | Lifecycle |
|---|---|---|---|
| `INSTRUCTIONS.md` | Durable policy only — short, normative rules | Everyone, always | Rarely changes |
| `OPERATIONS.md` | Day-to-day workflow procedures (claim/dispatch/handoff/deployment) | Orchestrators + sub-agents in flight | Occasional |
| `REVIEWS.md` | Local review loop + Copilot review loop + thread resolution + GraphQL commands | Sub-agents during PR work | Occasional |
| `TRACKING.md` | Clickstop lifecycle + WORKBOARD update protocol + CONTEXT.md update protocol | Orchestrators during planning/closeout | Occasional |

Existing `INSTRUCTIONS.md` becomes a short index file that links to the other three for procedure detail.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS45-1 | Outline target file structure and section-by-section content allocation | ✅ Done ([#214](https://github.com/henrik-me/guesswhatisnext/pull/214)) | For every section/subsection currently in `INSTRUCTIONS.md`, decide which of the four files it belongs in. Commit the allocation as a new "## Content Allocation" section inside this clickstop file (the active version). Subsequent tasks read the allocation directly from here. Identify duplicated content (e.g. quick checklist vs full sections) and decide a single canonical home. Identify content that must remain cross-referenced and design the cross-reference shape (link to file + heading anchor). |
| CS45-2 | Create `OPERATIONS.md` (parallel-safe: new file only) | ✅ Done ([#217](https://github.com/henrik-me/guesswhatisnext/pull/217)) | **PARALLEL with CS45-3 and CS45-4.** Create `OPERATIONS.md` containing the verbatim content for: Parallel Agent Workflow, Orchestrator Startup Checklist, Orchestrator Responsiveness, Deployment Monitoring, Agent Progress Reporting, Branch Strategy & Merge Model. **Do NOT modify `INSTRUCTIONS.md` in this PR** — that's CS45-5's job. The new file is duplicative with INSTRUCTIONS.md until CS45-5 lands; this is the deliberate trade-off for parallel execution. |
| CS45-3 | Create `REVIEWS.md` (parallel-safe: new file only) | ✅ Done ([#215](https://github.com/henrik-me/guesswhatisnext/pull/215)) | **PARALLEL with CS45-2 and CS45-4.** Create `REVIEWS.md` containing the verbatim content for: Local Review Loop (GPT 5.4), Copilot PR Review Policy, GraphQL commands for thread resolution, review-comment categorization rules. **Do NOT modify `INSTRUCTIONS.md` in this PR.** |
| CS45-4 | Create `TRACKING.md` (parallel-safe: new file only) | ✅ Done ([#216](https://github.com/henrik-me/guesswhatisnext/pull/216)) | **PARALLEL with CS45-2 and CS45-3.** Create `TRACKING.md` containing the verbatim content for: Clickstop File Lifecycle (per CS43-5), CONTEXT.md update protocol, WORKBOARD.md update protocol (including the state machine + row-ownership/stale-lock policy from CS44-1/-2), CS number conflict resolution, deferred-task handling. **Do NOT modify `INSTRUCTIONS.md` in this PR.** |
| CS45-5 | Consolidated `INSTRUCTIONS.md` shrink (single PR) | ✅ Done ([#218](https://github.com/henrik-me/guesswhatisnext/pull/218)) | After CS45-2/-3/-4 have all landed. Remove the moved sections from `INSTRUCTIONS.md` in one PR (no per-section stubs needed — the new files are already in the repo). Add a clear top section: "This file contains durable policy. For procedures see `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`." (Use clickable links once those files exist; written here as code spans because the link checker is strict.) Target: ~250 lines. **PR description must include a written end-to-end walkthrough** ("agent claims clickstop → dispatches sub-agent → opens PR → review → merge → closeout") with section links into the new structure to prove docs cover the journey end-to-end. |
| CS45-6 | Update all cross-references in other docs | ⬜ Pending | `CONTEXT.md`, `WORKBOARD.md`, `README.md`, `CONTRIBUTING.md`, `LEARNINGS.md`, every clickstop file (`grep -rn 'INSTRUCTIONS.md'`). Where a reference points at a section that moved, update it to point at the new file + heading anchor. **`.github/copilot-instructions.md` keeps pointing at `INSTRUCTIONS.md` only** (which now serves as the index). Subagents/orchestrators discover the procedure files via the INSTRUCTIONS.md header. The consistency checker (CS43-2 link-resolution rule) must pass. |
| CS45-7 | Update issue #198 with CS45 completion summary | ⬜ Pending | Final task. Comment on [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) listing what landed (split into INSTRUCTIONS / OPERATIONS / REVIEWS / TRACKING, cross-references updated, walkthrough in PR description) and noting CS45 addresses review.md finding 4. **Do NOT close the issue** — leave it open as a tracking thread for any remaining product/code findings. |

---

## Will not be done as part of this update

- **Splitting the architecture/coding/testing sections out of INSTRUCTIONS.md** (e.g. into `ARCHITECTURE.md`, `TESTING.md`). Considered as a further split. Rejected: those sections are durable policy and belong in `INSTRUCTIONS.md`. The split here is by *lifecycle* (policy vs procedure), not by *topic*.
- **Auto-generated table of contents per file.** Considered as a navigation aid. Rejected: GitHub renders Markdown headings into a navigable outline already; a generated TOC is one more thing to keep in sync.
- **Content rewrites or rewordings during the move.** Out of scope. CS45 is a structural split, not a content rewrite. Move content verbatim where possible. Wording improvements should be follow-up clickstops if needed.
- **Renaming `INSTRUCTIONS.md` itself** (e.g. to `POLICY.md`). Considered. Rejected: too many existing references would need to update, and `INSTRUCTIONS.md` is well-known to all current sessions and external integrations (e.g. `.github/copilot-instructions.md`).

---

## Design Considerations

- **Merge-conflict risk is the top concern.** This clickstop touches a file that every active sub-agent reads at session start. If multiple agents are mid-task during the split, they may have stale references in their context. Mitigation: schedule CS45 during a quiet window; announce the split before merging; ensure the new files are reachable from `INSTRUCTIONS.md` so anyone with a stale reference still finds the content one click away.
- **Move content verbatim, not paraphrased.** This is a structural change, not a content edit. Resist the urge to "improve while moving" — it makes review impossible. Diffs should show "removed N lines from INSTRUCTIONS.md, added the same N lines to OPERATIONS.md."
- **Order matters.** CS45-1 (allocation, committed into this clickstop file) must complete first. CS45-2/-3/-4 then run **in parallel** (each only creates a new file; none of them modify `INSTRUCTIONS.md`). CS45-5 then runs alone — it removes moved content from `INSTRUCTIONS.md` in one consolidated PR (no per-section stubs). CS45-6 (cross-references) follows. CS45-7 last. Each step is its own PR.
- **Why CS45-2/-3/-4 don't touch INSTRUCTIONS.md.** Three parallel sub-agents each editing INSTRUCTIONS.md to remove their section + leave a stub would produce 3-way add/delete conflicts at rebase time (every edit is in the same file). Splitting the work so the new files are created in parallel and INSTRUCTIONS.md is shrunk in one separate PR eliminates that conflict surface. Trade-off: between CS45-2/-3/-4 landing and CS45-5 landing, the moved content is duplicated (lives in both INSTRUCTIONS.md and the new file). This window is short and intentional.
- **Depends on CS43-1 (link, don't restate principle).** Without it, the new files risk paraphrasing each other. With it, cross-references between OPERATIONS / REVIEWS / TRACKING / INSTRUCTIONS are mechanical.
- **Should ideally land after CS44 (workboard state machine).** CS44 modifies the WORKBOARD section that CS45-4 is going to move into TRACKING.md. Doing CS44 first means CS45-4 moves the final shape; doing CS45 first means CS44 has to land in two files. Recommend CS44 → CS45.

## Acceptance Criteria

- [ ] `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md` exist and contain the migrated content.
- [ ] `INSTRUCTIONS.md` contains durable policy only and is significantly shorter (target: ~250 lines).
- [ ] `INSTRUCTIONS.md` opens with a clear pointer to the three procedure files.
- [ ] All cross-references in other docs point at the correct new locations.
- [ ] `npm run check:docs:strict` passes (0 errors; pre-existing CS42-1 stale warning OK).
- [ ] **No original content lost in the move.** Verified by structural diff review (not numeric line counts): every deletion from `INSTRUCTIONS.md` in CS45-5 should appear verbatim as an addition in one of the new files (modulo heading-level adjustments). The reviewer reads the diff side-by-side, not `wc -l` totals.
- [ ] **End-to-end docs coverage demonstrated by written walkthrough.** CS45-5's PR description includes a step-by-step walkthrough of the full agent journey (claim → dispatch → review → merge → closeout) using only links into the new structure, proving the docs cover the journey without consulting the pre-split version.

---

## Content Allocation

This section is the authoritative output of CS45-1. CS45-2/-3/-4 read the **Target file** column directly to know what verbatim content to copy into each new file. CS45-5 reads it to know what to delete from `INSTRUCTIONS.md`. Line ranges refer to `INSTRUCTIONS.md` at the commit that introduces this allocation; if `INSTRUCTIONS.md` is edited before CS45-5 lands, the ranges may shift but the section identities won't.

Target file shorthand:
- **INSTRUCTIONS** = `INSTRUCTIONS.md` (stays — durable policy)
- **OPERATIONS** = `OPERATIONS.md` (new, CS45-2)
- **REVIEWS** = `REVIEWS.md` (new, CS45-3)
- **TRACKING** = `TRACKING.md` (new, CS45-4)

### Allocation table

| INSTRUCTIONS.md section (current heading) | Approx. line range | Target file | Notes |
|---|---|---|---|
| `# Quick Reference Checklist` (top-of-file 30-bullet list) | 1–31 | INSTRUCTIONS | Stays at top of the slimmed `INSTRUCTIONS.md`. **Duplicate of later content** — see Duplication callouts below; CS45-5 must prune any bullet that has become a pure restatement of a procedure now living in OPERATIONS / REVIEWS / TRACKING and replace it with a one-line cross-reference. |
| `# Development Instructions` header + intro paragraph | 33–39 | INSTRUCTIONS | Stays. CS45-5 rewrites the intro to also point at `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`. |
| `## 1. Architecture Principles` (umbrella) | 41–43 | INSTRUCTIONS | Durable policy. |
| `### Separation of Concerns` | 45–51 | INSTRUCTIONS | Durable policy. |
| `### Feature Flag Rollouts` | 52–59 | INSTRUCTIONS | Durable policy. |
| `### File Organization` | 60–66 | INSTRUCTIONS | Durable policy. |
| `## 2. Coding Guidelines` (umbrella) | 67–68 | INSTRUCTIONS | Durable policy. |
| `### Language & Style` | 69–75 | INSTRUCTIONS | Durable policy. |
| `### Naming Conventions` (code identifiers) | 76–86 | INSTRUCTIONS | Durable policy. Distinct from the later `### Naming Conventions` under Clickstop & Task Management (branches/commits/PRs) — that one moves to TRACKING. |
| `### HTML` | 87–92 | INSTRUCTIONS | Durable policy. |
| `### CSS` | 93–99 | INSTRUCTIONS | Durable policy. |
| `### JavaScript` | 100–106 | INSTRUCTIONS | Durable policy. |
| `### Comments` | 107–113 | INSTRUCTIONS | Durable policy. |
| `## 3. Testing Strategy` (umbrella) | 114–123 | INSTRUCTIONS | Durable policy. |
| `### Test Data Management` | 124–129 | INSTRUCTIONS | Durable policy. |
| `### Container Validation` | 130–167 | INSTRUCTIONS | Durable policy (includes the docker-compose / smoke-test commands; these are policy about *what must be run*, not workflow about *who runs it when*). |
| `### MSSQL Local Development` | 168–193 | INSTRUCTIONS | Durable policy. |
| `## 4. Logging Conventions` (umbrella) | 194–203 | INSTRUCTIONS | Durable policy. |
| `### Structured Context Guidelines` | 204–212 | INSTRUCTIONS | Durable policy. |
| `### Sensitive Data Handling` | 213–224 | INSTRUCTIONS | Durable policy. |
| `## 5. Git Workflow` (umbrella heading) | 225–226 | INSTRUCTIONS | Heading and one-line intro stay; the section is significantly reduced because most subsections move out. |
| `### Commit Conventions` (conventional-commit types + examples) | 227–256 | INSTRUCTIONS | Durable policy (commit-message *grammar*). The workboard-specific commit format on lines 571–577 is procedural and moves to TRACKING. |
| `### When to Commit` | 257–268 | INSTRUCTIONS | Durable policy (granularity rule). |
| `### Agent Progress Reporting` | 269–296 | OPERATIONS | Procedural — the `STATE:` reporting protocol, deployment-monitoring approval-gate procedure, milestone timing table. Cross-references to `§ WORKBOARD State Machine` become links into TRACKING. |
| `### Branch Strategy & Merge Model` | 298–311 | OPERATIONS | Per clickstop plan. (The high-level "no direct commits to main" rule is procedural: it describes the *flow*, not a one-line policy. The shortened form may be echoed in the Quick Reference Checklist.) |
| `### Agent Work Model` (umbrella + main agent rules) | 313–328 | OPERATIONS | Procedural orchestration rules. |
| Inline subsection: **Orchestrator Startup Checklist** | 329–337 | OPERATIONS | Procedural. |
| Inline subsection: **Orchestrator responsiveness** | 338 | OPERATIONS | Procedural. |
| Inline subsection: **Deployment monitoring** | 340 | OPERATIONS | Procedural. |
| Inline subsection: **Deployment approval policy** | 342–344 | OPERATIONS | Procedural. |
| Inline subsection: **No-shortcut policy** | 346 | OPERATIONS | Procedural (governs orchestrator/sub-agent behaviour during a task). The corresponding *policy statement* ("there is no too-small-for-a-PR threshold") may be echoed in the Quick Reference Checklist as a one-liner. |
| Inline subsection: **Stale instructions guard** | 348 | OPERATIONS | Procedural. |
| Inline subsection: **Copilot CLI commands (reference)** | 350–353 | OPERATIONS | Procedural reference. |
| Inline subsection: **Sub-agents in worktrees** intro paragraph | 355–363 | OPERATIONS | Procedural. |
| Inline subsection: **Sub-Agent Checklist** (verbatim-include block) | 365–382 | OPERATIONS | Procedural — the canonical checklist that orchestrators paste into dispatch prompts. References to local review move-target are REVIEWS; references to State Machine move-target are TRACKING. |
| Inline subsection: **Sub-agent dispatch checklist (for orchestrators)** | 384–393 | OPERATIONS | Procedural. |
| Inline subsection: **Model selection** | 395 | OPERATIONS | Procedural (which model for which agent role). |
| `### Parallel Agent Workflow` (worktree slots, ports, branch lifecycle, recycling) | 397–439 | OPERATIONS | Procedural. Includes the worktree-root naming table, slot/port table, branch lifecycle steps, and slot-recycling commands. |
| `### Documentation Conventions` ("link, don't restate") | 441–462 | INSTRUCTIONS | Durable policy. This is the meta-rule that governs how all four files relate to each other; it must remain in `INSTRUCTIONS.md` so the other files can cite it. The cross-references inside this block (to `§ CONTEXT.md — Project State Updates` and `§ Clickstop File Lifecycle`) get rewritten to point at TRACKING. |
| `### Clickstop & Task Management` (umbrella) | 464–467 | TRACKING | Tracking lifecycle. |
| `#### Task IDs` (incl. CS number allocation 3-source check) | 468–476 | TRACKING | Tracking lifecycle. The CS-number-conflict rule is the same one repeated near line 736 — see Duplication callouts; TRACKING is canonical. |
| `#### Task Statuses` | 478–484 | TRACKING | Tracking lifecycle. |
| `#### Agent Identification` | 486–489 | TRACKING | Tracking-adjacent (defines the agent ID used in Owner column, branch names, commit trailers). Cited from OPERATIONS via cross-reference. **Alternative considered:** OPERATIONS, since it's used during dispatch. Chose TRACKING because the ID is a stable identity attribute, not an action — and it sits inside the existing Clickstop & Task Management block. |
| `#### Naming Conventions` (branches / commits / PR titles / PR descriptions) | 491–515 | TRACKING | Tracking lifecycle (CS-prefixed IDs flow through here). **Alternative considered:** INSTRUCTIONS (durable convention) or OPERATIONS (used during dispatch). Chose TRACKING for cohesion with Task IDs, Task Statuses, and Agent Identification — they form one logical block. INSTRUCTIONS retains a one-line pointer in the Quick Reference Checklist. |
| `#### Clickstop Completion Checklist` + **Deferred work policy** | 517–537 | TRACKING | Tracking lifecycle. |
| `#### WORKBOARD.md — Live Coordination` (incl. direct-commit, session naming, update frequency, timestamps, task locking, row ownership, clickstop assignment, commit convention for workboard updates, conflict handling, public-repo bypass note) | 539–581 | TRACKING | Tracking lifecycle. The workboard-specific commit-message format (`workboard:` type) moves with this section even though the overall commit-conventions table stays in INSTRUCTIONS. |
| `#### WORKBOARD State Machine` (8 states, transitions, event mapping, reporting protocol) | 583–628 | TRACKING | Tracking lifecycle. Cross-referenced from OPERATIONS § Agent Progress Reporting and § Sub-Agent Checklist. |
| `#### WORKBOARD Row Ownership & Stale-Lock Policy` | 630–679 | TRACKING | Tracking lifecycle. |
| `#### CONTEXT.md — Project State Updates` | 681–694 | TRACKING | Tracking lifecycle. |
| `#### Clickstop File Lifecycle` (planned/active/done dirs, claiming steps, closing steps, "CS number conflicts" repeat) | 696–736 | TRACKING | Tracking lifecycle. The "CS number conflicts" paragraph at line 736 duplicates the rule under `#### Task IDs` — see Duplication callouts. |
| `### Local Review Loop (GPT 5.4)` (incl. Local Review Log table format and PR-type / Copilot-required matrix) | 738–775 | REVIEWS | Review procedures. |
| `### (no heading)` **Copilot PR Review Policy** + **Copilot Review — Detailed Workflow** (review loop, Waiting for Copilot Review, Replying to comments REST API, Resolving threads GraphQL, Large-diff PR behavior) | 777–822 | REVIEWS | Review procedures. The GraphQL / REST snippets stay verbatim. |
| **Merge conflict guidelines** (paragraph block) | 824–828 | OPERATIONS | Procedural — about *when to merge what*, not about review. **Alternative considered:** REVIEWS (it sits inside the review section today). Chose OPERATIONS because the rules are about parallelism and merge ordering of branches, not about reviewing diffs. |
| **Parallel grouping rules** (✅/⚠️/❌ bullets) | 830–835 | OPERATIONS | Procedural — companion to the Parallel Agent Workflow section. |
| Deployment env / rollback link line ("For deployment environments, CI/CD pipeline, and rollback policy, see…") | 837 | OPERATIONS | Procedural pointer; sits with the other deployment paragraphs. |
| **Database migrations must be backward-compatible** (one-liner) | 839 | INSTRUCTIONS | Durable policy (additive-only schema rule). Belongs with architecture/policy, not procedure. Surfacing it inline near the Architecture or Testing section in the slimmed INSTRUCTIONS is fine; CS45-5 picks the spot. |
| `## 6. Performance & Accessibility` (umbrella + Performance + Accessibility) | 843–855 | INSTRUCTIONS | Durable policy. |

**Bucket totals (top-level + meaningful subsections counted above): 47 rows total.**
- INSTRUCTIONS (stays / durable policy): **24** rows
- OPERATIONS (new): **15** rows
- REVIEWS (new): **2** rows (each is a large multi-block region)
- TRACKING (new): **11** rows
- Flagged `???` (no clear bucket): **0** rows

REVIEWS shows as only two rows because the entire 738–822 review block is two large logical units (the local-review loop and the Copilot-review workflow). It is not undersized in line count — it is roughly 85 lines.

### Duplication callouts

The pre-split `INSTRUCTIONS.md` contains several places where the same rule is stated twice. For each, the canonical home below wins; the other location must be replaced (by CS45-5) with a one-line cross-reference rather than a verbatim restatement.

1. **CS-number conflict resolution** — appears twice:
   - Lines 471–476 inside `#### Task IDs` (the "3 sources to check" version).
   - Line 736 inside `#### Clickstop File Lifecycle` (the shorter "check planned/active/done" version).
   - **Canonical home:** TRACKING, in the `#### Task IDs` block. CS45-5 (or CS45-4 when authoring TRACKING.md) keeps the longer 3-source version under Task IDs and replaces the shorter line in Clickstop File Lifecycle with `See § Task IDs above for the full CS-number conflict procedure.`
2. **Quick Reference Checklist (top of file, lines 5–29)** — every bullet is a compressed restatement of a rule whose authoritative form lives later in the file (or, after the split, in OPERATIONS / REVIEWS / TRACKING). Examples:
   - "Claiming a clickstop → update WORKBOARD.md…" restates `#### Clickstop File Lifecycle` (→ TRACKING).
   - "After every `git pull` → re-read this checklist; if INSTRUCTIONS.md changed, re-read fully" restates **Stale instructions guard** (→ OPERATIONS).
   - "Run local review loop (GPT 5.4) before Copilot review — skip Copilot for docs-only PRs" restates `### Local Review Loop` (→ REVIEWS).
   - "Update WORKBOARD.md immediately on task claim/complete — commit AND push" restates `#### WORKBOARD.md — Live Coordination` (→ TRACKING).
   - **Canonical home for the substantive rule:** the long-form section in OPERATIONS / REVIEWS / TRACKING in each case.
   - **Disposition:** the Quick Reference Checklist itself stays in INSTRUCTIONS (it is intentionally a fast-scan summary), but CS45-5 must (a) not let it grow new rules that don't exist downstream, and (b) where a bullet has drifted from its long-form source, edit the bullet to match the source rather than the other way around. The checklist is a *summary* of normative content, not an alternate source of truth.
3. **Sub-agent State reporting** — the `STATE: <value>` protocol is described in three overlapping places: `### Agent Progress Reporting` (lines 269–296), the **Sub-Agent Checklist** inside `### Agent Work Model` (lines 365–382, especially steps 5/7/8/9/11/15), and `#### WORKBOARD State Machine` point D (lines 621–628).
   - **Canonical home for the vocabulary** (the 8 states, the event→state table, the reporting-protocol semantics): TRACKING § WORKBOARD State Machine.
   - **Canonical home for the agent-side procedure** (when to emit which `STATE:` line): OPERATIONS § Agent Progress Reporting and OPERATIONS § Sub-Agent Checklist.
   - The two OPERATIONS sections must cite TRACKING for the vocabulary — using a markdown link whose text is "§ WORKBOARD State Machine in TRACKING.md" and whose target is `TRACKING.md#workboard-state-machine` — rather than re-listing the eight states.
4. **Row ownership** — the short statement "Only modify your own rows in WORKBOARD.md Active Work" appears in the Quick Reference Checklist, in `#### WORKBOARD.md — Live Coordination` (paragraph "Row ownership"), and in `#### WORKBOARD Row Ownership & Stale-Lock Policy` (point A "Strict row ownership").
   - **Canonical home:** TRACKING § WORKBOARD Row Ownership & Stale-Lock Policy point A. The Live-Coordination paragraph keeps a one-line pointer; the Quick Reference Checklist bullet stays as a summary.
5. **Sub-agents do not edit WORKBOARD.md** — stated in `### Agent Progress Reporting`, in **Sub-Agent Checklist** step 17, and in `#### WORKBOARD State Machine` point D.
   - **Canonical home:** TRACKING § WORKBOARD State Machine point D ("Reporting protocol"). OPERATIONS sections cross-reference rather than restate.

No content is being deleted by these callouts — only the authoritative-vs-summary relationship is being declared so CS45-5 can prune restatements safely.

### Cross-reference design

Cross-references between the four files use **full markdown links to a heading anchor**, never bare paths and never inline value restatements:

```markdown
See [§ WORKBOARD State Machine in `TRACKING.md`](TRACKING.md#workboard-state-machine) for the canonical state list.
```

Rules:

- **Always anchor to a specific heading**, not just the file. `TRACKING.md#workboard-state-machine` is correct; `TRACKING.md` alone is only acceptable when the entire target file is the referent (rare).
- **Keep the file name in code spans inside the link text** (`` `TRACKING.md` ``) so plaintext readers can still see which file is meant.
- **Use `§ Section Name` prefix in the link text** for visual consistency with how the existing `INSTRUCTIONS.md` already cites itself (e.g. `§ WORKBOARD State Machine`).
- **Anchor slugs follow GitHub's normalization rules** (lowercase, spaces → hyphens, punctuation stripped). The CS43-2 link checker (`npm run check:docs:strict`) validates these on every PR.
- **Within a single file** continue to use bare anchor links — i.e. link text followed by a parenthesised `#anchor` target — since those don't need the file name.
- **Do not paraphrase content from the target section in the citing sentence** — that re-introduces the drift surface CS43-1 was designed to remove. Cite and stop.

The four files form a small star: `INSTRUCTIONS.md` is the durable-policy hub, and OPERATIONS / REVIEWS / TRACKING each link back to INSTRUCTIONS for policy and link sideways to each other where a procedure spans concerns (most commonly OPERATIONS ↔ TRACKING for state-machine semantics, and OPERATIONS ↔ REVIEWS for the dispatch checklist's review steps).

> **Note on examples in this section:** the file paths `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md` above are written as code spans rather than clickable links because those files do not yet exist on disk. The link checker would otherwise fail on this clickstop file. Once CS45-2/-3/-4 land, future references in real docs use the full markdown-link form shown in the example block.

### Sequence note

CS45-2, CS45-3, and CS45-4 run **in parallel** and each ONLY creates its own new file (`OPERATIONS.md`, `REVIEWS.md`, or `TRACKING.md` respectively). The content is copied **verbatim** from the line ranges above — no rewording, no reorganization, no merging of adjacent paragraphs. Cross-references between the new files may be left as `INSTRUCTIONS.md#section` links during CS45-2/-3/-4 (since INSTRUCTIONS.md still contains everything at that point); CS45-6 rewrites them to point at the final homes.

None of CS45-2/-3/-4 modify `INSTRUCTIONS.md`. The content is duplicated between `INSTRUCTIONS.md` and the new file during the window between (CS45-2/-3/-4 merging) and (CS45-5 merging). This is the deliberate trade-off documented in § Design Considerations.

CS45-5 then performs the consolidated `INSTRUCTIONS.md` shrink: removes every line range marked OPERATIONS / REVIEWS / TRACKING above, applies the Duplication-callout dispositions (rewrites the canonical-vs-summary cross-references), and adds the top-of-file index header pointing at the three procedure files.

CS45-6 fixes external references (`CONTEXT.md`, `WORKBOARD.md`, `README.md`, `CONTRIBUTING.md`, `LEARNINGS.md`, every clickstop file). CS45-7 closes out on issue #198.
