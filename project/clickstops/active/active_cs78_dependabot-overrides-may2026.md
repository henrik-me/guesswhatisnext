# CS78 — Dependabot overrides may2026

**Status:** ⬜ Planned
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS73, CS75
**Origin:** User direction 2026-05-09: *"investigate the open dependabot / security issues. tell me what they are and let me know what is needed for each of them"*. Three open Dependabot alerts surfaced (#10, #11, #12). All three resolvable with `package.json` `overrides` entries — no upstream waiting required.

## Goal

Close all three currently-open Dependabot alerts with a single `package.json` `overrides` patch and validate that the patched versions don't regress runtime or test behavior.

## Open alerts (snapshot 2026-05-09T20:30Z, source: `gh api repos/henrik-me/guesswhatisnext/dependabot/alerts?state=open`)

| # | Severity | Package | Vulnerable | Patched | CVE | Path | Real exposure |
|---|---|---|---|---|---|---|---|
| 12 | **HIGH** | `fast-xml-builder` | ≤ 1.1.6 | 1.1.7 | [CVE-2026-44665](https://nvd.nist.gov/vuln/detail/CVE-2026-44665) ([GHSA-5wm8-gmm8-39j9](https://github.com/advisories/GHSA-5wm8-gmm8-39j9)) | `artillery → @azure/storage-blob → @azure/core-xml → fast-xml-parser → fast-xml-builder@1.1.5` | **Real (ships to production).** `artillery` is in `optionalDependencies` (lines 75-77 `package.json`), and `npm ci --omit=dev` keeps optional deps — so `fast-xml-builder` lands in the production image even though no production code path actually invokes it. Dependabot's `scope=runtime` tag is correct. |
| 11 | MEDIUM | `fast-xml-builder` | = 1.1.5 | 1.1.6 | [CVE-2026-44664](https://nvd.nist.gov/vuln/detail/CVE-2026-44664) ([GHSA-45c6-75p6-83cc](https://github.com/advisories/GHSA-45c6-75p6-83cc)) | identical to #12 | Same as #12 — present in production install set. |
| 10 | MEDIUM | `ip-address` | ≤ 10.1.0 | 10.1.1 | [CVE-2026-42338](https://nvd.nist.gov/vuln/detail/CVE-2026-42338) ([GHSA-v2v4-37r5-5v8g](https://github.com/advisories/GHSA-v2v4-37r5-5v8g)) | `express-rate-limit@8.3.1 → ip-address@10.1.0` | **Runtime path is real**, but practical exposure is none: the CVE is XSS in `Address6` HTML-emitting methods (`htmlEntities`, `correctForm`, similar). `express-rate-limit` uses `ip-address` only for parsing/normalization, not for HTML output. Repo grep confirms: zero call sites of `htmlEntities` / `correctForm` / `Address6` in our code. |

## Approach

**Two complementary changes** in a single PR (review noted that the original "overrides only" approach left the optional-dep production-install issue unaddressed and missed a cleaner upstream-bump path for `ip-address`):

### 1. Move `artillery` from `optionalDependencies` → `devDependencies`

Eliminates the entire `fast-xml-builder` chain from the production image. `artillery` is only invoked by `test:load*` scripts (`package.json` lines 14-16) — never by production code. Moving it makes `npm ci --omit=dev` actually omit it (along with the whole sub-tree). This is the correct long-term fix for #11 and #12 and reduces the production attack surface beyond just the two CVEs.

### 2. Bump `express-rate-limit` to ≥ 8.5.1

`express-rate-limit@8.5.1` (current latest) declares `ip-address: ^10.2.0`, which natively brings in the patched 10.1.1+ line. This is cleaner than an `overrides` entry because it follows the upstream's intended dependency graph and removes the override at the next opportunity rather than carrying it indefinitely.

### Belt-and-braces: keep an `overrides` entry as backstop

Because the `express-rate-limit` bump is a minor version (8.3.1 → 8.5.1) and we want defense-in-depth in case a future re-resolution drifts, also add `"ip-address": "^10.1.1"` to the existing `overrides` block. Same for `fast-xml-builder` in case the artillery move is later reverted.

```jsonc
// package.json
"dependencies": {
  ...
  "express-rate-limit": "^8.5.1",   // CS78: 8.3.1 -> 8.5.1 brings ip-address ^10.2.0 natively (closes #10)
  ...
},
"devDependencies": {
  ...
  "artillery": "^2.0.30"            // CS78: moved from optionalDependencies — production no longer pulls fast-xml-builder chain (closes #11 + #12)
},
"optionalDependencies": {
  "@opentelemetry/exporter-trace-otlp-http": "^0.214.0"
  // artillery removed
},
"overrides": {
  "postcss": "^8.5.10",
  "uuid": "^14.0.0",
  "fast-xml-builder": "^1.1.7",     // CS78 backstop: closes #11 #12 even if artillery returns to non-dev scope
  "ip-address": "^10.1.1"           // CS78 backstop: closes #10 even if express-rate-limit re-resolves transitively
}
```

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS78-1 | Apply the three `package.json` changes: (a) move `artillery` from `optionalDependencies` → `devDependencies`, (b) bump `express-rate-limit` from `^8.3.1` to `^8.5.1`, (c) add `fast-xml-builder` and `ip-address` backstop entries to the `overrides` block (with inline CS78 + CVE comments). Run `npm install` to regenerate `package-lock.json`. Verify: `npm ls fast-xml-builder` shows 1.1.7+ in any remaining occurrence; `npm ls ip-address` shows 10.1.1+; `npm ls --omit=dev fast-xml-builder` returns "(empty)" / not-found (proving the artillery move took effect for production installs). | Single PR; lockfile churn is expected. |
| CS78-2 | Full validation: `npm run lint && npm test && npm run test:e2e`. Then `npm ci --omit=dev` in a clean clone (or via `docker build -t cs78-test .`) to verify production install completes cleanly without `fast-xml-builder` or `artillery`. Then `npm audit --omit=dev` to verify the production install set has zero high/medium vulnerabilities related to these alerts. Smoke-check artillery still works in dev: `npx artillery --version`. | Standard non-docs PR validation plus the production-install audit (the load-bearing check that proves the `optionalDependencies` → `devDependencies` move actually shrank the production surface). |
| CS78-3 | PR with body containing `## Local Review`, `## Container Validation` (= run `npm run container:validate` since the `express-rate-limit` bump touches a runtime middleware path; the rate-limit-touching paths — auth, scores submit, telemetry — are runtime-critical), `## Telemetry Validation` (= `not applicable (tooling-only)` for the dependency-graph changes; no new telemetry signals introduced). | Container Validation is **not** "not applicable" here — `express-rate-limit` is in the request hot path. Treat this as a non-trivial dependency bump and run the full container validate cycle. |
| CS78-4 | After merge, verify all three Dependabot alerts auto-close (Dependabot polls and closes resolved alerts within ~24h). If any remain open after 24h, investigate via `gh api repos/henrik-me/guesswhatisnext/dependabot/alerts/{N}` to see what state they're in (likely `auto_dismissed` or stuck in `open` if the override didn't propagate). Do **not** manually `state=dismissed` with `fix_started` — that's a "we're working on it" disposition, not a "we fixed it" one. If forced to manually intervene, use `state=dismissed` with `dismissed_reason=tolerable_risk` only if the technical fix really is in place and Dependabot is just slow. | Post-merge verification step. |

## Closure preconditions

CS78 cannot be closed until **all** of:

1. CS78-1 + CS78-2 + CS78-3 PR merged.
2. CS78-4: all three alerts (#10, #11, #12) confirmed closed via `gh api repos/henrik-me/guesswhatisnext/dependabot/alerts?state=open` returning 0 hits for these three numbers.

## Acceptance

- `gh api repos/henrik-me/guesswhatisnext/dependabot/alerts?state=open` returns no entries for alerts #10, #11, #12 (or returns them with `state: fixed`).
- `npm ls --omit=dev fast-xml-builder` returns "not found" / empty (proving the production install no longer pulls the `fast-xml-builder` chain — load-bearing acceptance criterion for the optional-dep → devDep move).
- `npm ls ip-address` shows version ≥ 10.1.1 throughout (both runtime + dev trees).
- `npm audit --omit=dev` reports 0 vulnerabilities of any severity related to alerts #10, #11, #12.
- Full validation suite (`npm run lint && npm test && npm run test:e2e`) passes.
- `npm run container:validate` passes (proves the `express-rate-limit` bump doesn't break runtime middleware).
- `npm install` does not introduce new ERESOLVE warnings beyond the existing OpenTelemetry/Artillery peer-dep noise documented in CONTEXT.md.
- The `overrides` block in `package.json` is annotated with CS78 + CVE references inline so future maintainers know why each entry exists.

## Will not be done as part of this clickstop

- **Removing the `overrides` entries once the natural dependency graph catches up.** A future cleanup CS can drop them when `express-rate-limit ≥ 8.5.1` is the proven floor and `artillery` stays in `devDependencies`. The backstops cost nothing.
- **Removing `artillery` entirely** to fully eliminate the load-test capability — out of scope; the `optionalDependencies` → `devDependencies` move keeps load-testing available for developers without shipping it to production.
- **Audit of every other dependency** — CS78 is scoped to the three currently-open alerts. A broader `npm audit fix` or `npm outdated` sweep is a separate exercise.
- **CONTEXT.md / README.md updates about the OpenTelemetry/Artillery peer-dep noise** — that issue is unchanged and already documented in CONTEXT.md.
- **Adding automated dependabot-merge automation** — out of scope; would be a separate process CS.
- **Container Validation skip via `not applicable`** — explicitly NOT skipping. The `express-rate-limit` bump is a runtime-middleware change and warrants the full `npm run container:validate` cycle.

## Risks & rollback

- **`express-rate-limit` 8.3.1 → 8.5.1 is a minor bump** (semver-compatible). Risk of breaking middleware behavior is low but non-zero — minor versions can introduce config-default changes. Container Validation cycle (`npm run container:validate`) catches functional regressions; the e2e suite covers auth/scores/telemetry endpoints which exercise rate limiting.
- **Moving `artillery` from `optionalDependencies` → `devDependencies`** changes only its install-scope classification, not its installable-ness for developers. `npm install` (no flags) and `npm ci` (no flags) both still install it. Only `npm ci --omit=dev` (production path) now skips it. Smoke check `npx artillery --version` after the move.
- **`overrides` are belt-and-braces** here. If the natural `express-rate-limit` 8.5.1 dependency graph already pulls `ip-address ≥ 10.1.1`, the `overrides` entries are no-ops; if not (e.g. due to a peer-dep conflict) the override forces the fix. Either way, the alerts close.
- **Rollback:** revert the PR. Single-commit revert restores `package.json` and `package-lock.json` to pre-CS78 state. The Dependabot alerts will re-open within ~24h.

## Cross-references

- Origin: user message 2026-05-09T20:30Z asking for Dependabot investigation.
- Dependabot UI: <https://github.com/henrik-me/guesswhatisnext/security/dependabot>
- API: `gh api repos/henrik-me/guesswhatisnext/dependabot/alerts?state=open`
- Existing overrides pattern: [`package.json`](../../../package.json) lines 79-82.
- Adjacent (no overlap): no other security CSes are currently in flight.
