# CS74 — Deploy-Run Image Tag In Run Name

**Status:** ⬜ Planned
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS73
**Origin:** CS52-11 prod deploy ceremony (yoga-gwn-c5, 2026-05-03). Operator UX gap surfaced during drift investigation; promoted to a dedicated CS at user direction.

## Symptom

`gh run list --workflow prod-deploy.yml` (and the GitHub Actions UI's run list) shows each run's `head_sha` (the branch's HEAD SHA at the moment `workflow_dispatch` fired) and a generic `display_title` of `"Deploy to Production"`. **Neither field reveals the actually-deployed image tag** — that comes from the operator-supplied `inputs.image-tag` and can differ from `head_sha`.

Concrete bite during CS52-11 (2026-05-03):

1. Operator (`yoga-gwn-c5`) ran `gh run list --workflow prod-deploy.yml`, saw the most recent successful run had `head_sha=a436b06`, and reported "prod is on `a436b06`, 275 commits behind main".
2. Subsequent `az containerapp show --query "properties.template.containers[0].image"` revealed the actually-deployed image was `ghcr.io/.../guesswhatisnext:6b368de` — **286 commits behind**, an entirely different SHA.
3. The drift count in the operator's status report was wrong by 11 commits because they read the wrong field.

The decoupling between `head_sha` and `inputs.image-tag` is **intentional** — `prod-deploy.yml` must be able to deploy any pre-built image (rollforward to last week's tested image, rollback past a bad commit, redeploy a known-good revision). Forcing them to match would lose that flexibility. CS74 keeps the flexibility but makes the actually-deployed image discoverable from the run list.

## Why this matters

- **Incident response:** an operator triaging a prod issue who reads `gh run list` to find "what's currently in prod" will get the wrong answer. Ground truth requires a separate `az containerapp show` call against the live env, which is one more step they may skip under time pressure.
- **Rollback decisions:** "revert prod to the SHA from last week's successful run" reads `head_sha`, which is NOT what was deployed — could roll forward to a different image than intended.
- **Cross-orchestrator coordination:** when one agent triggers a prod deploy and another reads `gh run list` for status, the second agent should be able to tell at a glance which image is being deployed without querying Azure.

This is a UX fix, not a correctness fix. The workflow itself is sound.

## Goal

Make the actually-deployed image tag visible in the **run list** (both `gh run list` `display_title` and the GitHub Actions UI's run name column) without changing the workflow's deploy-any-image flexibility.

## Out of scope

- Forcing `inputs.image-tag` to equal `github.sha` (would remove rollforward / rollback flexibility — explicitly rejected).
- Changing `staging-deploy.yml` similarly. Staging is push-triggered by default and the auto-built image *does* match the head SHA, so there's no information gap there. Only `prod-deploy.yml` (manual workflow_dispatch with operator-supplied image-tag) needs this fix. If staging ever gains a manual image-tag input, this CS's pattern can be reapplied.
- Embedding the image SHA into the deployment tag (already done by the `Tag Production Deployment` job — that's a git-tag, not a workflow run name).

## Approach

GitHub Actions supports the top-level [`run-name`](https://docs.github.com/en/actions/learn-github-actions/workflow-syntax-for-github-actions#run-name) key, which sets the human-visible name of each run. It can interpolate workflow inputs:

```yaml
name: Deploy to Production
run-name: Deploy ${{ inputs.image-tag }} to Production (by @${{ github.actor }})
```

After this change:
- `gh run list --workflow prod-deploy.yml` `display_title` field shows `Deploy 76f5705 to Production (by @henrik-me)` instead of the generic `Deploy to Production`.
- Same string appears in the GitHub Actions UI run list.
- Existing run history is unchanged (run-name only affects new runs).

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS74-1 | Add `run-name` to `.github/workflows/prod-deploy.yml` interpolating `inputs.image-tag` and `github.actor`. Validate the workflow YAML lints clean. | One-line addition under `name:`. No other workflow changes. |
| CS74-2 | Test by dispatching a no-op deploy: pick a tag already deployed (current revision's image), dispatch `prod-deploy.yml`, confirm the run name shows the image tag. The deploy itself is idempotent (same image → no traffic shift, smoke + ceremony all run cleanly per CS52-11 evidence). Costs one production-environment approval click. | Validation could alternately be done in a fork or by reading the `run-name` interpolation result via a new disposable workflow without actually deploying — operator's call. |
| CS74-3 | Update [LEARNINGS.md § Azure SQL serverless cold-pause](../../../LEARNINGS.md) (or wherever the `head_sha != image-tag` operator note ends up) to point at this fix. If a learning was filed for the head_sha gotcha, mark it "Resolved by CS74" and remove the workaround block. | Docs cleanup at merge. |

## Acceptance

1. After this CS lands, `gh run list --workflow prod-deploy.yml --limit 5 --json displayTitle` returns titles that include the actually-deployed image tag (e.g. `Deploy 76f5705 to Production (by @henrik-me)`) for runs dispatched after the merge.
2. Operator can determine "what's in prod's image" from `gh run list` alone without a separate `az containerapp show` call. (`az containerapp show` remains the ground truth for the *currently active* image, but the workflow run list now correctly reflects what *that run deployed*.)
3. No change to `prod-deploy.yml`'s deploy-any-image flexibility — `inputs.image-tag` is still operator-supplied and may differ from `github.sha`.

## Will not be done (deliberate)

- **Add `inputs.image-tag` validation that it matches a known good image.** Out of scope; that's a separate concern and `prod-deploy.yml` already calls `Verify image exists in GHCR` before deploying.
- **Backfill historical run names.** Not possible via the API; only new runs get the new name.
- **Apply to all workflow files in the repo.** Only `prod-deploy.yml` has the input-vs-head-SHA decoupling. Other workflows (CI, lint, staging-deploy auto-trigger) don't have this gap.

## Cross-references

- Origin: [CS52-11 closeout outcome section](../done/done_cs52_server-authoritative-scoring.md) (drift investigation that surfaced the gap).
- Related: [CS73](planned_cs73_prod-deploy-cold-db-handling.md) (also a prod-deploy-workflow UX/robustness fix, parallel-safe with CS74; touches same workflow file but different concerns — CS73 adds a wake step before migration, CS74 adds a `run-name` declaration at the top of the file; rebase conflicts unlikely).
- Workflow: [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) (top-level metadata).
- GitHub docs: [`run-name` workflow syntax](https://docs.github.com/en/actions/learn-github-actions/workflow-syntax-for-github-actions#run-name).
