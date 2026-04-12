# CS31 — Instructions Optimization

**Status:** ⬜ Planned
**Goal:** Audit INSTRUCTIONS.md for relevance, clarity, and conciseness. Remove content that doesn't help agents do their job. Strengthen areas where agents repeatedly make mistakes. Reduce overall length while improving signal-to-noise ratio.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS31-1 | Investigate instructions for irrelevant/outdated content | ⬜ Pending | Identify sections that are no longer relevant, duplicated across files, or overly verbose. Compare against actual agent behavior patterns. |
| CS31-2 | Identify areas needing more emphasis | ⬜ Pending | Review session history, stored memories, and common mistakes to find rules that agents consistently miss despite being documented. |
| CS31-3 | Propose and implement simplifications | ⬜ Pending | Restructure, condense, or remove sections based on findings. Target: reduce line count while preserving all actionable guidance. |
| CS31-4 | Validate changes | ⬜ Pending | Ensure the optimized instructions still cover all necessary workflows. Local review loop. |

---

## Design Decisions

- **Signal over completeness:** Instructions that agents never reference are noise. Better to have 400 high-signal lines than 800 lines where agents skip half.
- **Emphasis via position:** The most-violated rules should be closest to the top (Quick Reference Checklist pattern).
- **Cross-file deduplication:** Content duplicated between INSTRUCTIONS.md, CONTEXT.md, and LEARNINGS.md should live in one place only.
