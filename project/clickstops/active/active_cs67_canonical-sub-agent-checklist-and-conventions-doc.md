# CS67 — Canonical Sub Agent Checklist And Conventions Doc

**Status:** 🔄 In Progress
**Origin:** 2026-04-29 conversation (omni-gwn). Two related observations: (1) the Sub-Agent Checklist lives buried inside a 50KB OPERATIONS.md, forcing orchestrators to paraphrase or misplace it on each dispatch; (2) ~70% of INSTRUCTIONS.md is code/test/architecture conventions a sub-agent needs every time it touches code, while the rest is orchestrator-only. Splitting both extracts canonical artifacts that are mechanically referenceable.
**Depends on:** CS64 (uses the dep/parallelism conventions in the new docs)
**Parallel-safe with:** CS65, CS66

## Problem

**Issue 1 — non-canonical sub-agent checklist.** The "include verbatim in every sub-agent prompt" Sub-Agent Checklist (OPERATIONS.md lines ~198–215) is prose embedded in a much larger file. There's no way for an orchestrator to `view docs/sub-agent-checklist.md` and paste-by-reference. Each dispatch prompt is hand-typed, leading to:
- Bullet drift (omitting steps the orchestrator forgot).
- Paraphrasing (e.g., "run tests" instead of the literal `npm run lint && npm test && npm run test:e2e` command).
- Stale references to old anchors when OPERATIONS.md restructures.

**Issue 2 — INSTRUCTIONS.md mixes audiences.** The file is ~50KB, with content for two distinct readers:

| Audience | Sections | Why they read |
|----------|----------|----------------|
| **Orchestrator** | Quick Reference Checklist, Production deploys approval gate, Investigation artifacts | Workflow rules, daily ops |
| **Sub-agent (code work)** | §1 Architecture, §2 Coding, §3 Testing, §4 Logging, §4a Telemetry, §5 Git Workflow, Database & Data, Documentation Conventions, §6 Performance & Accessibility | Conventions for the actual code change |

A sub-agent currently has to scan the whole file to find code-relevant sections. A focused `CONVENTIONS.md` (~15-20KB) makes the required-read smaller and the "did the agent actually read it" question verifiable.

## Goals

1. Extract the Sub-Agent Checklist into `docs/sub-agent-checklist.md` as the canonical source.
2. Add a docs-linter rule that fails if the OPERATIONS.md quoted version drifts from the canonical file (or remove the quoted version entirely and have OPERATIONS.md reference-by-link only).
3. Extract code/test/architecture conventions from INSTRUCTIONS.md into `CONVENTIONS.md`.
4. Update INSTRUCTIONS.md to keep only orchestrator-facing content + pointers.
5. Update repo-wide cross-references (anchor links) to the new file locations.
6. Add CONVENTIONS.md to the canonical sub-agent required-reads list.

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS67-1 | ✅ Done — Phase 1 extracts the canonical sub-agent checklist to `docs/sub-agent-checklist.md`, replaces OPERATIONS.md § Sub-Agent Checklist with a one-paragraph link reference, and adds warn-only `docs:strict` rule `sub-agent-checklist-canonical` asserting the canonical file exists and OPERATIONS.md links to it. | sequential (Phase 1) |
| CS67-2a | Phase 2 — extract `CONVENTIONS.md`. Move INSTRUCTIONS.md sections §1, §2, §3, §4, §4a, §5, Database & Data, Documentation Conventions, §6 into a new `CONVENTIONS.md` at repo root. Preserve heading order, anchor stability where possible. INSTRUCTIONS.md keeps Quick Reference Checklist + Production deploys + Investigation artifacts + a "See CONVENTIONS.md for code/test policy" pointer at the top. | sequential after Phase 1 (Phase 2 may share PR with 2b/2c) |
| CS67-2b | Update repo-wide cross-references. Every `(INSTRUCTIONS.md#anchor)` link to a moved section must be rewritten to `(CONVENTIONS.md#anchor)`. Use `grep -rn 'INSTRUCTIONS.md#'` to find all sites; mechanical sweep. | parallel with 2c |
| CS67-2c | Update the canonical sub-agent checklist (from Phase 1) to add `CONVENTIONS.md` as a required read. Add a state marker convention: sub-agents emit `READS_COMPLETE: INSTRUCTIONS@<sha> CONVENTIONS@<sha>` before starting work, so PR-body gate (CS66) or dispatch-time check can verify. | parallel with 2b |
| CS67-3 | Soak. Run for ≥ 2 weeks; collect feedback from sub-agents about whether CONVENTIONS.md scope is right. Adjust section split (e.g. move boundaries) if needed. | sequential after 2* |

CS67-1 must complete before CS67-2* because Phase 2's CONVENTIONS.md split changes anchors that the canonical checklist (Phase 1) references. Phase 2's three subtasks can land in one PR or three depending on size.

## Acceptance

- `docs/sub-agent-checklist.md` exists with the canonical 17-step checklist.
- OPERATIONS.md no longer carries a verbatim duplicate (either deleted in favor of include marker, or kept synced via the `sub-agent-checklist-canonical` linter rule).
- `CONVENTIONS.md` exists at repo root with the extracted sections; INSTRUCTIONS.md has been trimmed to orchestrator-facing content only and is < 25KB.
- Every `INSTRUCTIONS.md#anchor` link in the repo that targets a moved section now correctly points at `CONVENTIONS.md#anchor`. Verified via `npm run check:docs:strict` (existing `link-resolves` rule).
- Sub-agent dispatch prompts (post-CS67) reference `docs/sub-agent-checklist.md` and `CONVENTIONS.md` by path; orchestrators no longer paste the checklist body verbatim.
- After ≥ 2 weeks of soak (CS67-3), no sub-agent has reported "I needed convention X but couldn't find it" (or, if they have, the section split is updated).

## Risks and mitigations

- **Risk:** Anchor churn breaks links in archived `done/` clickstop files. **Mitigation:** the existing `link-resolves` linter is warn-only against `done/` files (or can be made so). Sweeping fixes for moved anchors in done files is acceptable but not required.
- **Risk:** Concurrent in-flight PRs conflict on INSTRUCTIONS.md heavy edits. **Mitigation:** Phase 2 is one tightly-scoped PR landed quickly. Other agents are notified via a WORKBOARD entry while CS67-2* is in flight.
- **Risk:** OPERATIONS.md includes the checklist in many places ("see § Sub-Agent Checklist" cross-refs). **Mitigation:** Phase 1's anchor migration is mechanical; CS62's anchor pattern (drop version from heading) is the precedent.

## Cross-references

- CS45 (done) — original INSTRUCTIONS.md split into INSTRUCTIONS / OPERATIONS / REVIEWS / TRACKING. Direct precedent for this kind of doc-restructure.
- CS64 — planning conventions; CS67's plan files use the new dep/parallelism notation.
- CS65 — plan-file schema linter; the `sub-agent-checklist-canonical` rule in CS67-1 is added to the same `scripts/check-docs-consistency.js`.
- CS66 — PR-body gate; CS67-2c's `READS_COMPLETE: ...` marker is verifiable by the same gate.
- INSTRUCTIONS.md, OPERATIONS.md, REVIEWS.md, TRACKING.md — all touched.
