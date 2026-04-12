# CS31 — Instructions Optimization

**Status:** ✅ Complete
**Goal:** Audit INSTRUCTIONS.md for relevance, clarity, and conciseness. Remove content that doesn't help agents do their job. Strengthen areas where agents repeatedly make mistakes. Reduce overall length while improving signal-to-noise ratio.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS31-1 | Investigate instructions for irrelevant/outdated content | ✅ Done | Identified sections no longer relevant, duplicated, or overly verbose. |
| CS31-2 | Identify areas needing more emphasis | ✅ Done | Reviewed session history and common mistakes to find under-emphasized rules. |
| CS31-3 | Propose and implement simplifications | ✅ Done | Restructured and condensed sections, reduced line count while preserving actionable guidance. |
| CS31-4 | Validate changes | ✅ Done | Verified optimized instructions cover all necessary workflows via local review. |

---

## Design Decisions

- **Signal over completeness:** Instructions that agents never reference are noise. Better to have 400 high-signal lines than 800 lines where agents skip half.
- **Emphasis via position:** The most-violated rules placed closest to the top (Quick Reference Checklist pattern).
- **Cross-file deduplication:** Content duplicated between INSTRUCTIONS.md, CONTEXT.md, and LEARNINGS.md consolidated to one location.

## Completion

- **PR:** #151
- **Merged:** 2026-04-12
- **Files changed:** 1 (INSTRUCTIONS.md)
