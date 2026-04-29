# CS69 — Workboard Row Colspan

**Status:** ⬜ Planned
**Depends on:** CS65-2 (which flips `workboard-title-matches-h1` to error in `--strict`; CS69 must update both the rule logic AND its parser to handle HTML, so it lands after CS65-2 is settled)
**Parallel-safe with:** any CS not touching `scripts/check-docs-consistency.js`, `WORKBOARD.md`, or its test fixtures
**Origin:** User direction 2026-04-29T21:15Z: "for the workboard, I would like to see that the second line does a colspan on the last 5 columns on the second row for each item, ensuring only the first column in the second row is not used for the text details. This will read much better as it will condense the row height significantly."

## Problem

WORKBOARD.md Active Work uses a 2-row-per-entry table (per [TRACKING.md § WORKBOARD entry template](../../../TRACKING.md#workboard-entry-template)). The current shape is:

```
| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
| CS65-2     | ...   | ...   | ...   | ...          | ...            |
|            | _description prose..._ |  |  |  |  |
```

The description row (row 2) carries the descriptive prose in **column 2** and leaves columns 1, 3, 4, 5, 6 empty. Markdown renders this as a row with five visually-empty trailing cells next to one wide cell of prose. The renderer reflows the prose onto multiple lines while the empty cells inflate row height with whitespace — every entry takes 4–8 visual lines.

User wants the description row to be:
- Column 1: empty (preserves the visual indentation under the CS-Task ID)
- Columns 2–6: a single merged cell holding the prose

This is a **colspan** layout. It would render as a true 2-column row (small spacer + wide prose) and condense each entry's height significantly.

## Investigation finding

**Markdown tables do not support colspan.** Pipe-table syntax in CommonMark, GFM, and the variants GitHub renders has no syntax for cell merging. Confirmed against:
- [GFM spec § Tables](https://github.github.com/gfm/#tables-extension-) — defines pipe tables only; no `colspan` mechanism.
- Repo precedent: every existing markdown table in the repo uses fixed cell counts; no current file uses colspan via markdown.

**The only workable mechanism is inline HTML.** GitHub's Markdown renderer does pass `<table>...<td colspan="5">...</td>...</table>` through to HTML output. We can replace the WORKBOARD Active Work pipe table with an HTML `<table>` block. The Orchestrators table can stay markdown (no colspan needed there).

**Parser impact** (the cost side of the trade-off):

`scripts/check-docs-consistency.js` reads the WORKBOARD Active Work table via:
- `getActiveWorkTable(lines)` (line ~676) — finds the `## Active Work` section, then calls `parseMarkdownTableMatching` to find the data table by header.
- `parseMarkdownTableMatching` (line ~640) — pipe-table specific (`/^\s*\|/` regex on each line, `splitMarkdownRow` per row).

Six rules consume the parsed cells:
1. `workboard-title-matches-h1` (CS62) — Title cell
2. `state-in-vocabulary` (CS44) — State cell
3. `last-updated-iso8601` (CS44) — Last Updated cell
4. `owner-in-orchestrators-table` (CS44) — Owner cell
5. `active-row-stale` / `active-row-reclaimable` (CS44-5b) — Last Updated cell
6. `no-orphan-active-work` (CS43) — CS-Task ID cell

If the table becomes HTML, `parseMarkdownTableMatching` returns null → all 6 rules go silent → CI passes vacuously while the rules are non-functional. **Parser update is mandatory and must land in the same PR as the format change.**

**Test fixture impact:** ~10 fixtures under `tests/fixtures/check-docs-consistency/` contain markdown-format WORKBOARD.md files exercising these rules. They need HTML versions (or, preferably, the parser supports both formats and fixtures can be either).

## Proposed approach

Convert ONLY the `## Active Work` table to inline HTML; leave the `## Orchestrators` table as markdown (no colspan needed there). Make the parser format-tolerant so the fixtures can stay markdown (less churn) while live WORKBOARD.md uses HTML.

### Target HTML shape

```html
<table>
<thead>
<tr>
  <th>CS-Task ID</th><th>Title</th><th>State</th><th>Owner</th><th>Last Updated</th><th>Blocked Reason</th>
</tr>
</thead>
<tbody>
<tr>
  <td>CS65-2</td>
  <td><b>Plan-File Schema Linter Rules — Baseline Cleanup + Flip to Error</b><br>WT: <code>C:\src\gwn-worktrees\wt-2</code><br>B: <code>omni-gwn/cs65-2-flip-to-error</code></td>
  <td>claimed</td>
  <td>omni-gwn</td>
  <td>2026-04-29T20:55Z</td>
  <td>—</td>
</tr>
<tr>
  <td></td>
  <td colspan="5"><i>Closes the CS62 + CS65 open promise. ...</i></td>
</tr>
<!-- next entry: 2 rows... -->
</tbody>
</table>
```

### Parser strategy

Add a sibling helper `parseHtmlActiveWorkTable(lines)` next to `parseMarkdownTableMatching`:
- Detects an HTML `<table>` block inside the `## Active Work` section.
- Walks `<tr>` rows, splitting `<td>` / `<th>` cells.
- Returns the same `{ headers, rows }` shape so downstream rules don't change.
- For colspan rows, skip them OR represent them with the appropriate cell count to avoid breaking rules that expect 6 cells per row (the existing parser's "description row" handling at TRACKING.md:147 already filters these — port that logic).

`getActiveWorkTable(lines)` becomes a dispatcher: try HTML first, fall back to markdown. Both formats remain supported.

## Alternative considered (and rejected)

**Option D — embed description prose inline in the Title cell with `<br>`.** The Title cell already uses `<br>` for the WT/B subfields; we could append the description as another `<br><i>...</i>` line. Pros: zero parser changes, no HTML conversion, achieves visual compactness. Cons: doesn't match user's explicit "colspan on the last 5 columns" request; description text becomes mixed with WT/B lines and harder to scan as a separate field; loses the column-1 spacer indentation.

Option D would be the right call if HTML conversion proved infeasible, but since GitHub renders inline HTML cleanly it is worth doing the user's preferred layout.

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS69-1a | Add `parseHtmlActiveWorkTable(lines)` helper to `scripts/check-docs-consistency.js` next to the existing markdown parser. Returns `{ headers, rows }` shape compatible with downstream rule consumers. Handles `<colspan="N">` by either skipping such rows or padding cells per the existing description-row convention. | parallel |
| CS69-1b | Update `getActiveWorkTable(lines)` to try HTML detection first, fall back to markdown parser. Both formats remain supported so test fixtures don't all need updating. | sequential after 1a |
| CS69-1c | Convert `WORKBOARD.md` `## Active Work` table to inline HTML with `colspan="5"` description rows. Preserve all existing entries verbatim (only formatting changes). Orchestrators table stays markdown. | sequential after 1b |
| CS69-1d | Add 1-2 new fixtures under `tests/fixtures/check-docs-consistency/cs69-html-workboard-*/` exercising the HTML-format parser path. Existing markdown fixtures stay markdown (covers fallback). | parallel with 1a |
| CS69-1e | Update `TRACKING.md § WORKBOARD entry template` to show the new HTML schema as the primary format with a worked example. Note that the parser supports both for backward compat. | sequential after 1c |
| CS69-1f | Validate end-to-end: `npm run check:docs:strict` returns 0 errors against live WORKBOARD.md (now HTML) AND against existing markdown fixtures (fallback path). All 6 consumer rules still emit findings on intentional fixture violations. | sequential after 1a-e |

All CS69-1* tasks land in one PR. No follow-up CS needed unless the soak surfaces issues.

## Risks and mitigations

- **Risk: HTML cells may render slightly differently than markdown cells in different GitHub viewers.** Mitigation: test on github.com PR diff view + repo browse view + `gh pr view` CLI before merging.
- **Risk: parser dual-format adds complexity.** Mitigation: add unit tests for both paths; the dual-format support is bounded (one helper per format, single dispatch point).
- **Risk: future orchestrators may add markdown rows by habit, breaking parsing.** Mitigation: TRACKING.md template doc shows HTML as primary; the parser supports markdown fallback so a hand-typed markdown row still parses (graceful degradation).
- **Risk: Copilot / sub-agent edits to WORKBOARD via `edit` tool become more verbose with HTML syntax.** Mitigation: orchestrator-only file (sub-agents don't edit it); orchestrator is the one bearing the cost.

## Acceptance

- WORKBOARD.md `## Active Work` renders on github.com as a table with 6-column header rows AND 2-column description rows (column 1 spacer + colspan="5" prose).
- `npm run check:docs:strict` returns 0 errors.
- All 6 consumer rules (`workboard-title-matches-h1`, `state-in-vocabulary`, `last-updated-iso8601`, `owner-in-orchestrators-table`, `active-row-stale`, `active-row-reclaimable`, `no-orphan-active-work`) continue to find violations on intentional fixtures (markdown OR HTML format).
- TRACKING.md § WORKBOARD entry template shows the new HTML schema with a worked example, with a note that markdown fallback still parses.
- Visual scan of WORKBOARD.md on github.com shows description rows compact to ~1 visual line (vs current 4–8) for typical entries.

## Cross-references

- [TRACKING.md § WORKBOARD entry template](../../../TRACKING.md#workboard-entry-template) — the canonical schema doc to update
- [scripts/check-docs-consistency.js](../../../scripts/check-docs-consistency.js) — `getActiveWorkTable`, `parseMarkdownTableMatching` (lines ~640, ~676)
- CS62 — established the title-matches-h1 rule that consumes the parser output
- CS65-2 — flips that rule from warn to error; this CS depends on CS65-2 being settled before changing the format
- [GFM spec § Tables](https://github.github.com/gfm/#tables-extension-) — confirms markdown has no colspan; HTML is the only path
