# CS26 — Public Repository Transition

**Status:** ✅ Complete
**Goal:** Secure the repository and configure proper access controls, then make it public. Ensure only the owner (henrik-me) can see secrets/variables, deploy, and modify CI/CD configuration. External contributors can only contribute via fork PRs requiring owner approval.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS26-1 | Configure branch protection on main | ✅ Done | 1 required review, status checks (lint, test, e2e), CODEOWNERS enforcement, linear history, no force push, admin bypass. Configured via GitHub API. |
| CS26-2 | Add environment protection rules | ✅ Done | staging + production environments require henrik-me approval. Configured via GitHub API. |
| CS26-3 | Restrict workflow permissions | ✅ Done | SHA-pinned all third-party actions, added explicit `permissions:` blocks to all workflows. PR #145. |
| CS26-4 | Protect CI/CD and deployment config | ✅ Done | Updated CODEOWNERS with critical paths (`.github/workflows/`, `infra/`, `Dockerfile`, `docker-compose*.yml`). PR #145. |
| CS26-5 | Audit and scrub sensitive information | ✅ Done | Added credential comments clarifying dev-only defaults in docker-compose files and CI config. PR #145. |
| CS26-6 | Configure fork PR security | ✅ Done | Selected actions only, read-only GITHUB_TOKEN default, fork PR approval required for outside collaborators. Configured via GitHub settings. |
| CS26-7 | Update documentation for public repo | ✅ Done | Added MIT LICENSE, CONTRIBUTING.md, updated README with contributing/license sections. PR #145. |
| CS26-8 | Handle WORKBOARD.md direct-push pattern | ✅ Done | Documented ruleset bypass approach in INSTRUCTIONS.md — owner bypasses branch protection for coordination file updates. PR #145. |
| CS26-9 | Make repository public | ✅ Done | Repository visibility changed to public via Settings → Danger Zone. |
| CS26-10 | Post-public verification | ✅ Done | All 6 checks passed: secrets hidden, environment protections active, branch protection enforced, fork PRs require approval, Actions safe for public. |
| CS26-11 | Add Quick Reference Checklist to INSTRUCTIONS.md | ✅ Done | Added Quick Reference Checklist at top of INSTRUCTIONS.md with critical orchestrator rules. PR #145. |

---

## Design Decisions

- **Branch protection is the foundation:** Without branch protection, CODEOWNERS is advisory-only. Branch protection must be enabled first, then CODEOWNERS enforcement layered on top.
- **SHA-pinning third-party actions:** Tag-pinned actions (e.g., `@v2`) can be moved by the action author to point at different code. SHA-pinning prevents supply chain attacks where a compromised action steals secrets.
- **Environment protection:** Even though deploy workflows are `workflow_dispatch` only (not triggerable by fork PRs), environment protection adds defense-in-depth. A compromised workflow file in a PR can't deploy without environment approval.
- **Fork PR safety:** The CI workflow is already safe for public repos — it uses `pull_request` trigger (not `pull_request_target`) and doesn't reference any repository secrets. Fork PRs get read-only GITHUB_TOKEN with no access to secrets.
- **WORKBOARD.md pattern:** This is the hardest problem. Branch protection will block direct pushes. The most practical solution for a single-owner repo is to use a ruleset with bypass for the owner, or to accept the overhead of PR-based workboard updates.
- **License:** MIT is recommended — it's permissive, widely understood, and appropriate for a game/educational project.

## Security Audit Results (from investigation)

### 🟢 Already Safe
- No leaked secrets in git history
- No production secrets are hardcoded; sensitive workflow values use GitHub Secrets/Variables where needed
- CI workflow uses no repo secrets — safe for fork PRs
- No `pull_request_target` triggers
- `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, and database files
- Only collaborator is `henrik-me`

### 🔴 Must Fix Before Public
- No branch protection on main
- No environment protection rules (staging/production have no required reviewers)

### 🟡 Should Fix
- Third-party actions tag-pinned, not SHA-pinned (supply chain risk)
- Actions permissions allow all actions (should restrict)
- Hardcoded test credentials visible (dev-only, cosmetic)
- Azure resource names in docs (recon info, not secrets)
- No CONTRIBUTING.md or LICENSE file
- WORKBOARD.md direct-push pattern conflicts with branch protection

## Prerequisites

- GitHub Pro plan or public repo (branch protection requires Pro for private repos)
- Owner access to repository settings
- Decide which execution path applies before starting:
  - **Private repo on GitHub Pro:** branch protection can be configured before the repo is made public.
  - **Private repo on non-Pro plan:** branch protection cannot be configured until after the repo is public, so prepare all other settings first and enable branch protection immediately after CS26-9.

## Task Dependencies

- **If private repo on GitHub Pro:** CS26-1 through CS26-8 must complete before CS26-9.
- **If private repo on non-Pro plan:** CS26-2 through CS26-8 must complete before CS26-9; CS26-1 must be applied immediately after CS26-9 as the first post-public change.
- CS26-10 must follow CS26-9
- CS26-1 (branch protection) should be done as early as the plan allows: first for the Pro/private path, or immediately after CS26-9 for the non-Pro/private path
- CS26-7 (docs) and CS26-5 (audit) can run in parallel with CS26-2 through CS26-4

---

## Completion Checklist

- [x] All tasks done and merged (CS26-1 through CS26-11; code changes in PR #145, settings via GitHub API)
- [x] README updated (contributing/license sections added)
- [x] INSTRUCTIONS.md updated (Quick Reference Checklist, WORKBOARD.md bypass note)
- [x] CONTEXT.md updated with final state
- [x] Tests — no new tests needed (security/config changes only)
- [ ] Staging deployed — N/A (billing issue, will deploy when resolved)
- [ ] Production deployed — N/A (same)
