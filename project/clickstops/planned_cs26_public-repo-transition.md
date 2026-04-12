# CS26 — Public Repository Transition

**Status:** ⬜ Planned
**Goal:** Secure the repository and configure proper access controls, then make it public. Ensure only the owner (henrik-me) can see secrets/variables, deploy, and modify CI/CD configuration. External contributors can only contribute via fork PRs requiring owner approval.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS26-1 | Configure branch protection on main | ⬜ Pending | Require PR reviews before merge (at least 1 approval from henrik-me). Require status checks (lint, test, e2e) to pass. Disallow direct pushes to main (exception: WORKBOARD.md pattern may need adjustment — consider using a bot or always-PR approach for public). No force pushes. Require linear history. Enable squash merge only (disable merge commits and rebase merges). Dismiss stale reviews on new pushes. Restrict who can push to main. |
| CS26-2 | Add environment protection rules | ⬜ Pending | Add required reviewers (henrik-me) on both `staging` and `production` GitHub Environments. This ensures only the owner can approve deployments. Also add protection to the `copilot` environment if applicable. |
| CS26-3 | Restrict workflow permissions | ⬜ Pending | Set repository-level Actions permissions to restrict allowed actions (only allow actions from verified creators or specific allowlist). Audit every workflow and add explicit minimum `permissions:` blocks before switching the repo-level default GITHUB_TOKEN permissions to read-only (ensure CI workflows like `ci.yml` declare permissions needed for `actions/upload-artifact`). Pin all third-party actions to SHA instead of tags to prevent supply chain attacks. Audit all workflows for tag-pinned actions; examples include `docker/login-action@v3`, `docker/build-push-action@v5`, `azure/login@v2`, `azure/cli@v2`, `actions/github-script@v7`, `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4` — this list is not exhaustive. |
| CS26-4 | Protect CI/CD and deployment config | ⬜ Pending | Ensure CODEOWNERS (`* @henrik-me`) is enforced via branch protection "Require review from Code Owners". This means any PR touching `.github/workflows/`, `infra/`, `Dockerfile`, `docker-compose*.yml`, or deployment scripts requires owner approval. Consider adding more specific CODEOWNERS entries for these critical paths. |
| CS26-5 | Audit and scrub sensitive information | ⬜ Pending | Review hardcoded test credentials in `docker-compose.yml`, `docker-compose.mssql.yml`, `ci.yml`, `server/config.js` — add comments clarifying these are dev-only defaults. Review Azure resource names in `infra/deploy.sh`, `infra/deploy.ps1`, `infra/README.md` — these aren't secrets but could aid reconnaissance. Consider whether to keep or redact. Verify `.gitignore` covers all sensitive paths. Run `git log` secret scan one final time before making public. |
| CS26-6 | Configure fork PR security | ⬜ Pending | Verify CI workflow (`ci.yml`) does not expose secrets on fork PRs (confirmed safe — uses no repo secrets). Ensure `pull_request` trigger (not `pull_request_target`) is used. Set "Require approval for all outside collaborators" in Actions settings so fork PR workflows need manual approval to run. Disable "Allow edits from maintainers" default on PRs if desired. |
| CS26-7 | Update documentation for public repo | ⬜ Pending | Update README.md with contribution guidelines (fork + PR workflow, code of conduct link). Add CONTRIBUTING.md with PR process, coding standards reference, and testing requirements. Add LICENSE file (choose appropriate license — MIT recommended for game projects). Remove or redact any internal-only information from docs (INSTRUCTIONS.md agent IDs, machine names, internal paths). |
| CS26-8 | Handle WORKBOARD.md direct-push pattern | ⬜ Pending | The current workflow has orchestrating agents pushing WORKBOARD.md directly to main. With branch protection requiring PR reviews, this pattern breaks. Options: (a) exempt WORKBOARD.md from branch protection via ruleset bypass, (b) switch to PR-based workboard updates, (c) use a GitHub App/bot token with bypass permissions. Decide and implement. |
| CS26-9 | Make repository public | ⬜ Pending | After all security tasks are complete and verified, change repository visibility from private to public via Settings → General → Danger Zone → Change visibility. Verify that Actions billing switches to unlimited free minutes. Re-trigger staging deploy to confirm workflows work in public mode. |
| CS26-10 | Post-public verification | ⬜ Pending | After making public: verify secrets are hidden (check Settings → Secrets), verify environment protections work (try triggering deploy without approval), verify branch protection blocks direct pushes, verify fork PRs work correctly (create a test fork PR), verify Actions run on PRs without exposing secrets. |

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
- All workflow secrets use `${{ secrets.* }}` — not hardcoded
- CI workflow uses no repo secrets — safe for fork PRs
- No `pull_request_target` triggers
- `.gitignore` properly excludes `.env*` and database files
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
- All other security tasks must complete before CS26-9 (making public)

## Task Dependencies

- CS26-1 through CS26-8 must all complete before CS26-9
- CS26-10 must follow CS26-9
- CS26-1 (branch protection) should be done first as other tasks depend on it
- CS26-7 (docs) and CS26-5 (audit) can run in parallel with CS26-2 through CS26-4
