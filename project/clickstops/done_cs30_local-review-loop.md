# CS30 — Local Review Loop

**Status:** ✅ Complete
**Goal:** Add GPT 5.4 local review loop to the development process as a fast pre-review step. Docs-only PRs use local review only; code PRs use local review + Copilot review.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS30-1 | Add Local Review Loop section to INSTRUCTIONS.md | ✅ Done | New section before Copilot PR Review Policy. Defines procedure, PR type table, docs-only definition. |
| CS30-2 | Update Sub-Agent Checklist | ✅ Done | Add local review step (step 9), make Copilot review conditional on PR type (steps 10-11). |
| CS30-3 | Update Quick Reference Checklist | ✅ Done | Replace Copilot review line with local review guidance. |
| CS30-4 | Update Copilot PR Review Policy | ✅ Done | Note docs-only exemption in policy opening. |
| CS30-5 | Validate new flow on this PR | ✅ Done | This PR itself uses the local review loop to validate the process works. |

---

## Design Decisions

- **GPT 5.4 for reviews:** Chosen based on empirical testing — local review completed in 63 seconds vs 10+ minute Copilot polling loop. Found 2 real issues that Copilot hadn't reviewed yet.
- **Docs-only skip:** Copilot review adds 10-20 minutes of polling overhead with minimal additional value for markdown-only changes. Local review catches the same class of issues (broken links, factual errors, consistency).
- **Code PRs keep Copilot:** Code changes benefit from Copilot's deeper analysis of logic, security, and correctness patterns. Local review serves as a fast first pass.
