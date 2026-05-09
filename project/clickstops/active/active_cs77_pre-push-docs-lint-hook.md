# CS77 — Pre-push docs lint hook

**Status:** 🔄 In Progress
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS73, CS75
**Origin:** Discovered 2026-05-08 while planning CS75. The CS75 plan file (commit `359fa00`) was pushed to `main` with 3 `check:docs:strict` errors that the linter would have caught locally. Investigation showed:

1. **No client-side enforcement.** `package.json` has no `husky` / `simple-git-hooks` / `lint-staged` / `prepare` script; `.git/hooks/` contains only the unmodified `*.sample` files Git ships with. Nothing wires `npm run check:docs:strict` into `git commit` or `git push`.
2. **Server-side enforcement is real but bypassable.** Branch protection on `main` requires PRs and 5 status checks (the push log emits `remote: Bypassed rule violations for refs/heads/main: Changes must be made through a pull request. 5 of 5 required status checks are expected.`). The orchestrator workflow allows direct-to-main pushes for `WORKBOARD.md` and clickstop-plan-file updates ([WORKBOARD.md:4](../../../WORKBOARD.md), [INSTRUCTIONS.md Quick Reference](../../../INSTRUCTIONS.md)), and that direct push silently bypasses **all** required status checks alongside the PR requirement — there is no per-rule branch-protection setting that says "you may bypass the PR requirement but `check:docs:strict` is still mandatory."

Net result: every direct-to-main push from an orchestrator currently relies on orchestrator discipline alone. CS77 closes that gap on the client side.

User direction 2026-05-08: *"File a planned CS to add a client-side pre-push hook (husky) that runs `npm run check:docs:strict` and blocks push on errors."*

## Goal

Make `npm run check:docs:strict` impossible to silently skip on any local push, regardless of whether the push targets `main` directly or a PR branch, without requiring server-side branch-protection changes.

## Approach

Install [`husky`](https://github.com/typicode/husky) (v9+, ESM-friendly, no shell-script files), wire a `pre-push` hook that runs `npm run check:docs:strict`, and document the escape hatch (`git push --no-verify`) and when it is acceptable to use.

**Why pre-push and not pre-commit:**
- The linter runs the full repo (~1s today, but grows) — pre-commit on every commit is friction with little benefit since orchestrators commit frequently mid-task.
- The push is the durable boundary: anything that lands on the remote is what other agents pull.
- Matches the CI gate's mental model: `check:docs:strict` is a "before remote" check, not a "before local commit" check.

**Why husky over alternatives:**
- Most widely adopted; well-documented; v9 has a stable `prepare`-script install path with documented escape-out-of-CI pattern via a small `.husky/install.mjs` shim.
- `simple-git-hooks` is lighter but not noticeably so for a single hook, and its config-in-`package.json` model makes it harder to add per-hook logging.
- Native `core.hooksPath` requires every clone to manually configure — defeats the purpose.

**CI / production-install safety (critical).** This repo runs `npm ci --omit=dev` in three places — [`Dockerfile`](../../../Dockerfile) line 7, [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) line 199, [`.github/workflows/staging-deploy.yml`](../../../.github/workflows/staging-deploy.yml) line 698. Husky will be a `devDependency`, so a naïve `"prepare": "husky"` would call a binary that does not exist in dev-omitted installs and break those builds. CS77-1 must use the documented [Husky 9 `install.mjs` skip-in-CI pattern](https://typicode.github.io/husky/how-to.html):

```jsonc
// package.json
"scripts": {
  "prepare": "node .husky/install.mjs"
}
```

```js
// .husky/install.mjs
if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
  process.exit(0);
}
const husky = (await import('husky')).default;
console.log(husky());
```

This makes `prepare` a no-op when `CI=true` (GitHub Actions sets this) or `NODE_ENV=production` (Dockerfile sets this), so dev-omitted installs never try to load the missing `husky` package. **CS77-1 must include a regression check that `npm ci --omit=dev` succeeds with the skip shim in place.**

## Tasks

| # | Task | Status | Depends On | Notes |
|---|------|--------|------------|-------|
| CS77-1 | Add `husky` (>= 9) as a `devDependency`. Add `"prepare": "node .husky/install.mjs"` to `package.json` (NOT a plain `husky` invocation — see § CI / production-install safety). Create `.husky/install.mjs` with the documented `CI`/`NODE_ENV=production` skip guard AND informative logging: print `→ configuring CS77 pre-push hook` when it actually runs, and `✓ CS77 pre-push hook already configured (no changes)` when re-run with the hook already in place (use `git config core.hooksPath` as the probe). Add `.husky/_/` to `.gitignore`. **Regression check:** verify `npm ci --omit=dev` still completes cleanly (the Dockerfile + prod-deploy + staging-deploy paths must not break). | ✅ Done | — | Single PR. Implemented in PR #328. |
| CS77-2 | Implement `.husky/pre-push` to run `npm run check:docs:strict` and exit non-zero on failure. Output should clearly say "blocked by CS77 pre-push hook — fix the errors above or use `git push --no-verify` only if you have a documented justification." | ✅ Done | CS77-1 | PR #328. |
| CS77-2b | Add a side-effect-free `npm run check:hook` script that probes whether the pre-push hook is currently active in this clone: assert `git config core.hooksPath == .husky`, assert `.husky/pre-push` exists, assert it is executable. Exit 0 with `✓ CS77 pre-push hook is active in this clone` or non-zero with `✗ CS77 pre-push hook is NOT active in this clone — run \`npm install\` to activate (see CS77).` Implementation in `scripts/check-hook.js` (~10 lines). Wire into `package.json` scripts as `check:hook`. | ✅ Done | CS77-1, CS77-2 | PR #328. Probe accepts `.husky` or `.husky/_` (husky 9 sets the latter). |
| CS77-2c | Have `scripts/check-docs-consistency.js` invoke `check-hook` at the top of its run and print a **warning** (not an error — does not affect exit code) **to stderr** if the hook is not active. Suppress the warning entirely when `process.env.CI === 'true'` (CI doesn't have or need the hook; GitHub Actions sets `CI=true`) AND when `--json` mode is in effect (so machine-readable output is not corrupted — emit to stderr in JSON mode if appropriate, or suppress entirely). The warning text must name CS77 and explain the one-time `npm install` fix. Rationale: an orchestrator who is following today's manual-lint discipline ("run `check:docs:strict` before every direct-to-main push") will get a loud nudge the very next time they lint, converting CS77 rollout from "passive opt-in" to "self-correcting on first lint." | ✅ Done | CS77-1, CS77-2, CS77-2b | PR #328. |
| CS77-3 | Documentation update. Add a short subsection in [CONVENTIONS.md](../../../CONVENTIONS.md) or [OPERATIONS.md](../../../OPERATIONS.md) — whichever already covers local linting — describing: (a) the hook exists and runs on `git push`, (b) **all known bypass mechanisms** — `git push --no-verify`, `HUSKY=0 git push …`, and `~/.config/husky/init.sh` global disablement — are allowed only with documented justification in the same commit/PR body, (c) the matching CI gate still runs on PRs as the backstop, (d) **GUI/editor caveat:** editor Git UIs invoke `git push` normally and the hook fires, but if the editor's environment lacks `node`/`npm` on `PATH` (common with `nvm`/`fnm` version managers) the hook will fail closed; the remedy is to add the version-manager init line to `~/.config/husky/init.sh` per [Husky's docs](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis). Reference [INSTRUCTIONS.md § Quick Reference Checklist](../../../INSTRUCTIONS.md#quick-reference-checklist) "Never skip any part of the process without asking the user first." | ✅ Done | — (parallel-safe with CS77-1/2) | PR #328. Added § Pre-push docs lint hook (CS77) in OPERATIONS.md, cross-linked from CONVENTIONS.md § 6 Documentation Conventions. |
| CS77-4 | **Validation:** confirm the hook actually blocks a bad push, the `check:hook` probe correctly reports active/inactive state, and the linter warning fires when the hook is missing. Construct a deliberately-broken plan file (e.g. duplicate a known-bad H1/filename mismatch in a throwaway branch), attempt `git push`, capture the hook's blocking output. Then run `npm run check:hook` (active state) → expect 0 + "✓ active". Temporarily `git config --unset core.hooksPath` and run again → expect non-zero + "✗ NOT active" message. With hook unset, run `npm run check:docs:strict` → expect the CS77-2c warning to fire on stderr. Restore hook with `npm install`. Confirm `git push --no-verify` succeeds (escape hatch works). Record all captured outputs in the PR body so reviewers can see each gate fires. Discard the throwaway branch after. | ✅ Done | CS77-1, CS77-2, CS77-2b, CS77-2c | PR #328 — evidence captured in PR body. |
| CS77-5 | **Cross-machine / per-checkout activation tracking.** `git pull` does NOT activate husky hooks — Git intentionally never auto-runs versioned hooks on pull, and husky's `core.hooksPath` is set by the `prepare` script which only runs during `npm install`. **Each existing orchestrator checkout listed in [WORKBOARD.md Orchestrators table](../../../WORKBOARD.md) (yoga-gwn, yoga-gwn-c2, yoga-gwn-c3, yoga-gwn-c4, yoga-gwn-c5, omni-gwn, omni-gwn-c2, omni-gwn-c3) needs to run `npm install` once after CS77 merges to activate the hook locally.** CS77-5 acceptance is a checkbox table in this CS file (or a small WORKBOARD-adjacent ledger) where each active orchestrator records "✅ hook active in <checkout-path>" with the orchestrator's agent ID + date. Closure of CS77-5 requires every 🟢 Active orchestrator to have ticked their box; ⚪ Offline orchestrators are tracked but do not block (they will pick up on next return). | ⬜ Planned | CS77-1 merged | Communication + tracking step. Without this, "pre-push hook protects all orchestrators" is overstated. |

### Dependency graph

```
CS77-1 ──→ CS77-2 ──→ CS77-2b ──→ CS77-2c ──→ CS77-4 (validate) ──→ (close CS77)
                                              │
                                              └──→ CS77-5 (cross-machine ack tracking)
CS77-3 (parallel, independent)
```

## Closure preconditions

CS77 cannot be closed until **all** of:

1. CS77-1 + CS77-2 + CS77-2b + CS77-2c PR merged (husky installed, pre-push hook in place, `check:hook` probe available, linter-warns-if-hook-missing wired).
2. CS77-3 docs PR merged.
3. CS77-4 validation evidence captured in the CS77-1+2 PR body (blocking output + `--no-verify` bypass output + `check:hook` probe output before/after install + lint-warning output when hook is uninstalled).
4. CS77-5 cross-machine ack table reaches "all 🟢 Active orchestrators ✅" (⚪ Offline orchestrators tracked but do not block).

## Acceptance

- After `npm install` in a fresh clone, `.husky/pre-push` is installed, `core.hooksPath` is set to `.husky`, and the hook is executable.
- After `npm install` in an **existing** checkout (i.e. one that pre-dates CS77), the same activation completes — verified per-checkout in CS77-5.
- `npm run check:hook` exits 0 with a "✓ active" message when the hook is installed, and non-zero with a "run `npm install` to activate" message when it is not.
- `npm run check:docs:strict` prints a non-fatal warning naming CS77 when run in a clone where the hook is not active (skipped under `CI=true`).
- A `git push` from any branch (including direct push to `main`) where `npm run check:docs:strict` would fail is **blocked** with a non-zero exit and a human-readable message naming CS77.
- The hook **fails closed** when `npm`/`node` is unavailable or `node_modules/` is stale (rather than silently skipping the check).
- `git push --no-verify`, `HUSKY=0 git push …`, and a user-installed `~/.config/husky/init.sh` continue to work as documented escape hatches (CS77 makes the hook hard to bypass *silently*, not impossible to bypass).
- `npm ci --omit=dev` continues to succeed on the Dockerfile + prod-deploy + staging-deploy paths (no regression from the husky `prepare` script).
- The matching CI status check (`check:docs:strict` in PR-required checks) is unaffected (no overlap, no double-fire).
- Documentation describes the hook, every bypass mechanism, the GUI/version-manager caveat, and the policy on when bypasses are acceptable.

## Will not be done as part of this clickstop

- Adding a **pre-commit** hook (only pre-push) — see "Why pre-push and not pre-commit" above.
- Wiring **other** lint scripts (`lint`, `check:pr-body`, `check:commit-trailers`, `check:feature-flag-policy`, `check:migration-policy`) into the same hook — they have different scopes (the PR-body and commit-trailer gates only make sense at PR time, not local push). A follow-up CS can extend the hook if a real failure mode emerges.
- Server-side branch-protection changes (e.g. removing the admin-bypass for the orchestrator's plan-file path). User explicitly chose the client-side fix during planning. A future CS can revisit if the client-side hook proves insufficient (e.g. orchestrators forget to `npm install` after pull and the hook is silently absent).
- Removing the orchestrator's direct-to-main shortcut for WORKBOARD/plan-file updates. That shortcut is intentional (avoids PR ceremony for purely-coordination edits) — CS77 makes it safer, not slower.
- Migrating the repo to `simple-git-hooks` or any other alternative.

## Accepted fragility & rejected server-side alternatives

This section documents the explicit informed trade-off made during planning (2026-05-09) so future orchestrators don't re-litigate it.

CS77's husky pre-push hook is **client-side enforcement only**. That is fundamentally fragile: an orchestrator who pulls but doesn't `npm install`, or who uses `git push --no-verify`, `HUSKY=0`, or `~/.config/husky/init.sh`, can silently bypass it. CS77-2b/2c reduce that fragility (the next `npm run check:docs:strict` run will warn about a missing hook, converting rollout into "self-correcting on first lint"), but they do not eliminate it.

**Server-side alternatives were considered and rejected for this iteration:**

| Option | Why rejected |
|---|---|
| **GitHub Rulesets per-rule bypass** (allow PR-rule bypass but require status checks on direct pushes) | Required status checks DO apply to direct pushes — they require the commit to already have passing checks before it can land on the protected branch. But GitHub Rulesets bypass is **all-or-nothing per ruleset** (verified via [GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-bypass-lists), 2026-05-09). Even with split rulesets (one for "require PR" with orchestrator bypass, another for "require check:docs:strict" without bypass), the orchestrator's locally-made commit has no prior CI run, so the status check requirement would block the direct push entirely — and the orchestrator can't bypass the second ruleset without bypassing both. The only way to make this work would be to push to a feature branch first, wait for CI, then promote the now-green commit — at which point we are functionally back to Option 2 (auto-merged PR fast-track) with extra steps. |
| **Auto-merged PR fast-track** (script wraps push-branch + open-PR + enable-auto-merge so orchestrators still feel "one command," but everything goes through the normal CI-gated PR path) | Adds ~30–60s CI latency per WORKBOARD/plan-file edit. User explicitly chose speed over robustness for this iteration. |
| **Remove admin bypass entirely** (orchestrators must use real PRs for WORKBOARD/plan files) | Kills the intentional direct-to-main affordance that makes multi-agent coordination cheap. PR ceremony per WORKBOARD update considered too heavy. |
| **Post-push detection + auto-revert** (workflow runs `check:docs:strict` on push to main and opens a revert PR if red) | Bad commit still lands in main briefly; other agents pulling in that window pick up the broken file. Detection without prevention. Could be added later as a third layer if husky proves insufficient. |

**Decision:** keep CS77 as a husky-only client-side hook for the speed. Accept that:
1. Each clone must `npm install` once after CS77 lands.
2. Bypass mechanisms remain — the hook prevents *silent* skip, not deliberate skip.
3. If an orchestrator on a never-`npm install`-ed clone makes a direct-to-main push, the gap reopens for them silently. CS77-2c's "lint warns if hook missing" mitigates by requiring them to also stop running the manual lint that today's policy already requires before every direct push — i.e. they have to ignore *two* signals to silently break things.

If future operational experience shows this fragility actually bites (e.g. another broken plan file lands on main from an unhooked clone), file a follow-up CS to layer Option 2 (auto-merged PR fast-track) on top — CS77's husky layer remains useful even then as the fast local pre-flight.

## Risks & rollback

- **`npm install` is required in each clone** for the hook to activate. `git pull` does NOT activate husky hooks — Git intentionally never auto-runs versioned hooks on pull. CS77-5 mitigates by per-clone ack-tracking; CS77-2c (linter warns if hook missing) converts the rollout into self-correcting behavior on first lint; long-term mitigation is that `npm install` is part of the standard "after pull" reflex anyway.
- **The hook must fail closed**, not silently skip, if `node`/`npm` are unavailable or `node_modules/` is stale. CS77-2 explicitly tests this (any non-zero exit blocks the push).
- **Worktrees** (e.g. `git worktree add` for parallel CS work) share `.git/config`'s `core.hooksPath` with the parent clone, so they inherit the hook automatically — no extra activation needed.
- **The hook adds ~1s to every `git push`** (current `check:docs:strict` runtime). Acceptable; well below the threshold where developers start `--no-verify`-ing reflexively.
- **Husky writes a `.husky/_/` directory** that should be gitignored per husky's standard install. CS77-1 must include the `.gitignore` update.
- **Bypasses remain available** — `git push --no-verify`, `HUSKY=0 git push …`, and `~/.config/husky/init.sh` global disablement. This is by design; CS77 makes silent skip *much harder to miss* (combined with CS77-2c's lint warning), not impossible. CS77-3 documents that using any bypass requires a documented justification in the same commit/PR.
- **GUI/editor caveat:** editor Git UIs (VS Code, JetBrains, etc.) invoke `git push` and the hook fires, but if the editor's environment lacks `node`/`npm` on `PATH` (common with `nvm`/`fnm` version managers), the hook will fail closed and the GUI push will appear to fail mysteriously. Remedy: add the version-manager init line to `~/.config/husky/init.sh` per [Husky's docs](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis). Documented in CS77-3.
- **Rollback:** remove the `prepare` script + `husky` devDep + `.husky/` directory + `scripts/check-hook.js` + the `check:hook` invocation in `check-docs-consistency.js` in a single revert PR. Single command for an in-place uninstall: `npm uninstall husky && rm -rf .husky scripts/check-hook.js` plus removing the `prepare` and `check:hook` lines from `package.json` and the warning hook from the linter.

## Cross-references

- Origin: CS75 push of `359fa00` (2026-05-08) — see this CS's § Origin section above for the full evidence chain.
- [WORKBOARD.md](../../../WORKBOARD.md) — defines the orchestrator's direct-to-main shortcut for coordination files.
- [INSTRUCTIONS.md § Quick Reference Checklist](../../../INSTRUCTIONS.md) — "Never skip any part of the process without asking the user first" (the rule CS77 puts a tripwire under).
- [TRACKING.md § WORKBOARD State Machine](../../../TRACKING.md#workboard-state-machine) — defines the canonical State vocabulary that `check:docs:strict` enforces.
- Linter source: [`scripts/check-docs-consistency.js`](../../../scripts/check-docs-consistency.js).
- Adjacent (no overlap): [CS65](../done/done_cs65_plan-file-schema-linter-rules.md) (added the plan-file schema rules CS77 will enforce at push time), [CS66](../done/done_cs66_pr-body-and-commit-trailer-gates.md) (added the PR-body / commit-trailer gates that CS77 deliberately does NOT also wire into pre-push).
