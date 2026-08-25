# Agent design: ticket → PR → merge

This directory holds an agent that runs part of this repo's own development
workflow: turning a filed issue into a reviewed pull request, with a human
approving the plan before code is written and approving the merge before
anything lands on `main`. It operates on this repo the same way any
contributor would — issues, branches, PRs — just with an agent doing the
triage and implementation steps.

## Pipeline

1. **Intake** — a ticket is filed as a GitHub Issue. If the ask is
   underspecified, the agent asks a clarifying question in a comment instead
   of guessing.
2. **Triage + plan** — the agent reads the issue, looks at the affected
   parts of the codebase (read-only), and posts a comment with its
   understanding of the ask, the files it expects to touch, a rough plan,
   and a risk rating (`trivial` / `standard` / `sensitive`).
3. **Gate 1 — plan approval.** `trivial`-rated tickets proceed straight to
   implementation (the agent states why it's skipping the gate). Everything
   else waits for an authorized commenter to reply `/approve-plan` before
   any code is written.
4. **Implementation** — branch created off the issue, agent writes the
   change and tests.
5. **Self-check** — the existing CI (`.github/workflows/ci.yml`: build +
   test for `server/` and `web/`) has to pass before a PR opens. A failure
   is posted back to the issue instead of opening a broken PR.
6. **PR** — opened linked to the issue, with a description and test plan.
7. **Revision loop** — review comments requesting changes trigger the agent
   to push follow-up commits addressing just those comments.
8. **Gate 2 — merge.** Always manual. No workflow merges a PR; a human
   clicks merge. This is deliberately the highest-friction step in the
   pipeline.

## Why embedded in this repo, not a separate one

The agent could live as its own standalone repo/reusable GitHub Action,
operating on this repo over the API. Starting embedded here instead is
faster to get an end-to-end loop working, and extracting a proven pattern
into a reusable Action later is a normal, well-understood refactor —
cleaner than speculatively separating something before it's clear what
actually needs to be reusable. `.github/workflows/` here is where GitHub
Actions triggers have to live anyway, since they fire on this repo's own
issue/PR events.

## Why Python for the agent script

The rest of this repo (`web/`, `server/`) is TypeScript end-to-end. The
agent script is Python instead: it's mostly API/webhook glue (GitHub API,
Claude Agent SDK, later a Slack bridge) rather than UI or type-heavy
request-handling code, and Python is the more portable choice if this logic
ever needs to run outside a GitHub Actions container — a standalone script,
a small service, etc.

## Guardrails

- `/approve-plan` only acts on comments from an authorized user — not
  anyone who comments on the issue.
- The agent's Bash/file tools are scoped to the checked-out repo directory.
  It is never given tools that push force, delete branches, or merge.
- GitHub side-effects (posting comments, opening the PR) are deterministic
  workflow steps that run on the agent's *output*, not tools the agent
  calls freely mid-run — keeps behavior predictable and reviewable.
- A diff that touches an unexpectedly large number of files for the ticket's
  stated scope is flagged rather than auto-opened as a PR.

## Phasing

- **Phase 1 (this repo, GitHub-native):** issue → plan → approval → PR →
  merge, entirely within GitHub. Currently in progress — see the issues
  tracking the agent's own build-out.
- **Phase 2 (later):** a Slack bridge so a non-technical "client" can file
  requests in plain language, translated into GitHub issues automatically.
  Deferred because it needs a webhook endpoint the client repo doesn't have
  yet (GitHub Actions alone can't listen for Slack events), and the
  GitHub-native loop should be proven first.

## Status

Design only as of 2026-08-25 — no workflow or script code yet. First slice
being built: triage-only (stages 1–3), tracked as its own issue so the
agent's build follows the same issue → PR → merge discipline it will later
enforce on others.
