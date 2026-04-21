# Agent Operation Model Review

## Findings

1. High: the live tracking system cannot represent the state transitions the instructions require. `INSTRUCTIONS.md` says `WORKBOARD.md` should be updated on task start/complete, blocked state, session start/end, and “whenever meaningful progress occurs” such as PR creation or review round completion, and it explicitly calls for ISO timestamps and blocked notes. But `WORKBOARD.md` only has `Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started` and no `Status`, `Last Updated`, `Blocked Reason`, or `Next Step` fields. The result is that the prescribed workflow is richer than the board can actually encode.

2. High: `CONTEXT.md` is presented as an authoritative planning/state document, but it contains stale and contradictory task state. The summary table marks CS20, CS21, CS22, and CS25 complete with `done_` links, while later sections still describe CS20/21/22 as planned and point to non-existent `planned_` files, and CS25 points to a non-existent `active_` file. This is materially risky because the instructions say errors in `CONTEXT.md` can cause agents to work on the wrong tasks or miss dependencies.

3. Medium: the work-tracking model is too human-dependent at the point where it most needs automation. Task locks persist until a human manually edits `WORKBOARD.md`; there is explicitly no automated reassignment for stalled work. At the same time, direct main-branch updates for the board and clickstop plan files rely on an owner-only ruleset bypass. That creates a single operational choke point: if the owner session is unavailable or a lock goes stale, the system has no resilient recovery path.

4. Medium: the instruction set is coherent but over-compressed into one document, which increases drift risk. `INSTRUCTIONS.md` mixes hard policy, rationale, examples, tooling commands, agent prompts, review procedure, and workflow theory across 700+ lines, while the quick checklist duplicates some of the same requirements up top. It is workable for a disciplined operator, but it is not easy to keep internally consistent, and the stale `CONTEXT.md` sections are evidence of that drift.

5. Low: the documented role boundaries are strong, but the current board does not show whether the model is actually being followed. The process says the main session only orchestrates and relays progress, yet the board has four orchestrators marked active and zero active tasks. That may be true at the moment, but as an operations artifact it is low-signal: it does not tell you whether sessions are idle, stale, blocked, or awaiting review.

## Evaluation

The operating model is good in intent. It has clear separation between orchestrator and implementer, explicit PR/review gates, branch protection awareness, and strong emphasis on preserving coordination state. That is substantially better than an ad hoc “just ask an agent to code” workflow.

The weak spot is not the philosophy; it is the state model. The process assumes a rich workflow state machine, but the actual tracking artifacts are mostly free-text Markdown and a thin table. That mismatch is why drift appears.

## How Work Is Tracked And Acted Upon

The current model uses three layers:

- `INSTRUCTIONS.md` as the normative policy and lifecycle definition.
- `WORKBOARD.md` as the live lock table for who owns what now.
- `CONTEXT.md` plus clickstop files as the roadmap and deliverable history.

That split is sensible. The problem is that the boundaries are not enforced cleanly enough:

- `WORKBOARD.md` is too thin for live operational state.
- `CONTEXT.md` carries both summary and semi-detailed status prose, which makes it easier to rot.
- clickstop files appear to be the most accurate task-level source, but the instructions still direct agents through `CONTEXT.md` for planning.

My recommendation is to make the source-of-truth hierarchy explicit:

- `WORKBOARD.md`: only live execution state.
- clickstop files: only deliverable scope, task breakdown, completion record.
- `CONTEXT.md`: only approved high-level roadmap and current environment facts.
- `INSTRUCTIONS.md`: only durable operating policy.

## Improvements I’d Recommend

1. Redesign `WORKBOARD.md` around actual workflow states.

Use columns like:

- `Task ID`
- `Owner`
- `Type`
- `State`
- `Branch`
- `PR`
- `Last Updated`
- `Next Action`
- `Blocked Reason`

Suggested `State` values:

- `claimed`
- `implementing`
- `validating`
- `pr_open`
- `local_review`
- `copilot_review`
- `ready_to_merge`
- `blocked`

That one change would make the board materially useful.

2. Add stale-lock handling.

At minimum:

- if `Last Updated` exceeds a threshold, mark as `stale`
- define who can release stale work
- define when an orchestrator may reclaim it

Right now the docs acknowledge the problem but leave it entirely manual.

3. Remove detailed clickstop status prose from `CONTEXT.md`.

`INSTRUCTIONS.md` already says `CONTEXT.md` should only have short summaries and links. Follow that strictly. The stale CS20/21/22/25 sections should not exist there. Keep detail only in clickstop files.

4. Split `INSTRUCTIONS.md` into policy vs procedure.

A better structure would be:

- `INSTRUCTIONS.md`: short normative rules only
- `OPERATIONS.md`: day-to-day workflow steps
- `REVIEWS.md`: local review + Copilot review loop
- `TRACKING.md`: workboard/clickstop lifecycle

That reduces cognitive load and drift surface.

5. Make the tracking format machine-friendly.

Even if Markdown remains the human view, consider a small structured file such as `.ops/workboard.json` or `.ops/tasks.yaml` that agents update, with Markdown generated from it. This would make stale detection, status transitions, and validation much easier.

6. Add a consistency check.

A simple script should fail if:

- `CONTEXT.md` links to non-existent clickstop files
- a clickstop is marked complete in the summary but referenced as planned later
- `WORKBOARD.md` contains an owner for a clickstop that is also marked done
- active/planned/done file prefixes do not match the declared status

That would have caught the current drift.

## Bottom Line

The model is thoughtfully designed and stronger than most agent workflows, but it is currently under-modeled operationally. The biggest improvement is to treat work tracking as a real state machine, not just a Markdown note-taking convention.
