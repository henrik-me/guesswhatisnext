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
| CS45-1 | Outline target file structure and section-by-section content allocation | ⬜ Pending | For every section/subsection currently in `INSTRUCTIONS.md`, decide which of the four files it belongs in. Commit the allocation as a new "## Content Allocation" section inside this clickstop file (the active version). Subsequent tasks read the allocation directly from here. Identify duplicated content (e.g. quick checklist vs full sections) and decide a single canonical home. Identify content that must remain cross-referenced and design the cross-reference shape (link to file + heading anchor). |
| CS45-2 | Create `OPERATIONS.md` (parallel-safe: new file only) | ⬜ Pending | **PARALLEL with CS45-3 and CS45-4.** Create `OPERATIONS.md` containing the verbatim content for: Parallel Agent Workflow, Orchestrator Startup Checklist, Orchestrator Responsiveness, Deployment Monitoring, Agent Progress Reporting, Branch Strategy & Merge Model. **Do NOT modify `INSTRUCTIONS.md` in this PR** — that's CS45-5's job. The new file is duplicative with INSTRUCTIONS.md until CS45-5 lands; this is the deliberate trade-off for parallel execution. |
| CS45-3 | Create `REVIEWS.md` (parallel-safe: new file only) | ⬜ Pending | **PARALLEL with CS45-2 and CS45-4.** Create `REVIEWS.md` containing the verbatim content for: Local Review Loop (GPT 5.4), Copilot PR Review Policy, GraphQL commands for thread resolution, review-comment categorization rules. **Do NOT modify `INSTRUCTIONS.md` in this PR.** |
| CS45-4 | Create `TRACKING.md` (parallel-safe: new file only) | ⬜ Pending | **PARALLEL with CS45-2 and CS45-3.** Create `TRACKING.md` containing the verbatim content for: Clickstop File Lifecycle (per CS43-5), CONTEXT.md update protocol, WORKBOARD.md update protocol (including the state machine + row-ownership/stale-lock policy from CS44-1/-2), CS number conflict resolution, deferred-task handling. **Do NOT modify `INSTRUCTIONS.md` in this PR.** |
| CS45-5 | Consolidated `INSTRUCTIONS.md` shrink (single PR) | ⬜ Pending | After CS45-2/-3/-4 have all landed. Remove the moved sections from `INSTRUCTIONS.md` in one PR (no per-section stubs needed — the new files are already in the repo). Add a clear top section: "This file contains durable policy. For procedures see `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`." (Use clickable links once those files exist; written here as code spans because the link checker is strict.) Target: ~250 lines. **PR description must include a written end-to-end walkthrough** ("agent claims clickstop → dispatches sub-agent → opens PR → review → merge → closeout") with section links into the new structure to prove docs cover the journey end-to-end. |
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
