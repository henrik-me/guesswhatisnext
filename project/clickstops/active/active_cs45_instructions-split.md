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
| CS45-1 | Outline target file structure and section-by-section content allocation | ⬜ Pending | For every section/subsection currently in `INSTRUCTIONS.md`, decide which of the four files it belongs in. Produce the allocation as a table in the implementation PR description before any content moves. Identify duplicated content (e.g. quick checklist vs full sections) and decide a single canonical home. Identify content that must remain cross-referenced and design the cross-reference shape (link to file + heading anchor). |
| CS45-2 | Create `OPERATIONS.md` and move workflow procedure content | ⬜ Pending | Move: Parallel Agent Workflow, Orchestrator Startup Checklist, Orchestrator Responsiveness, Deployment Monitoring, Agent Progress Reporting, Branch Strategy & Merge Model. Leave one-line summaries + links in `INSTRUCTIONS.md`. Verify checker (CS43-2) finds no broken links. |
| CS45-3 | Create `REVIEWS.md` and move review-loop content | ⬜ Pending | Move: Local Review Loop (GPT 5.4) section, Copilot PR Review Policy, the GraphQL commands for thread resolution, the review-comment categorization rules. Leave one-line summary + link in `INSTRUCTIONS.md`. |
| CS45-4 | Create `TRACKING.md` and move tracking-lifecycle content | ⬜ Pending | Move: Clickstop File Lifecycle (statuses, prefixes, location convention as decided in CS43-5), CONTEXT.md update protocol, WORKBOARD.md update protocol (+ state machine if CS44 has landed), CS number conflict resolution, deferred-task handling. Leave one-line summary + link in `INSTRUCTIONS.md`. |
| CS45-5 | Update `INSTRUCTIONS.md` to durable-policy-only shape | ⬜ Pending | After CS45-2/-3/-4 have moved their content out, what remains in `INSTRUCTIONS.md` should be: architecture principles, coding guidelines, testing strategy, logging conventions, performance/accessibility, and the quick checklist (which now contains rules that don't repeat the procedural sections). Add a clear top section: "This file contains durable policy. For procedures see OPERATIONS.md, REVIEWS.md, TRACKING.md." Target: ~250 lines. |
| CS45-6 | Update all cross-references in other docs | ⬜ Pending | `CONTEXT.md`, `WORKBOARD.md`, `README.md`, `CONTRIBUTING.md`, `LEARNINGS.md`, `.github/copilot-instructions.md`, every clickstop file (`grep -rn 'INSTRUCTIONS.md'`). Where a reference points at a section that moved, update it to point at the new file + heading anchor. The consistency checker (CS43-2 link-resolution rule) must pass. |
| CS45-7 | Update issue #198 with CS45 completion summary | ⬜ Pending | Final task. Comment on [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) listing the structural-split items now done (INSTRUCTIONS.md split into INSTRUCTIONS / OPERATIONS / REVIEWS / TRACKING, all cross-references updated). Note that CS45 addresses review.md finding 4 and the over-compression concern. Close the issue **only if** CS43 and CS44 are also complete and product/code findings have been migrated to their own clickstops; otherwise leave open with a final summary of remaining work. |

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
- **Order matters.** CS45-1 (allocation outline) must complete and be agreed upon before CS45-2/-3/-4. CS45-5 (shrink INSTRUCTIONS.md) only after the other three have moved their content. CS45-6 (cross-references) last. Each step is its own PR.
- **Depends on CS43-1 (link, don't restate principle).** Without it, the new files risk paraphrasing each other. With it, cross-references between OPERATIONS / REVIEWS / TRACKING / INSTRUCTIONS are mechanical.
- **Should ideally land after CS44 (workboard state machine).** CS44 modifies the WORKBOARD section that CS45-4 is going to move into TRACKING.md. Doing CS44 first means CS45-4 moves the final shape; doing CS45 first means CS44 has to land in two files. Recommend CS44 → CS45.

## Acceptance Criteria

- [ ] `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md` exist and contain the migrated content.
- [ ] `INSTRUCTIONS.md` contains durable policy only and is significantly shorter (target: ~250 lines).
- [ ] `INSTRUCTIONS.md` opens with a clear pointer to the three procedure files.
- [ ] All cross-references in other docs point at the correct new locations.
- [ ] `npm run check:docs` passes (no broken links).
- [ ] No content was lost in the move (compare line totals before/after; deltas should be only in cross-reference scaffolding).
- [ ] At least one full session (orchestrator + sub-agent) can run end-to-end using only the new structure without consulting the pre-split version.
