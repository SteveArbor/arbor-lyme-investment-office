# CLAUDE.md

## Project

Arbor Lyme Capital — a private investment decision-support platform. Start
with [`docs/vision.md`](docs/vision.md) and
[`docs/architecture.md`](docs/architecture.md) for full context. Every
architectural, security, and process decision made so far is recorded in
[`docs/`](docs/) and [`docs/adr/`](docs/adr/) — check whether a doc already
answers a design question before deciding it fresh.

Current state: read
[`docs/implementation/foundation.md`](docs/implementation/foundation.md) for
exactly what's built, and
[`docs/development-roadmap.md`](docs/development-roadmap.md) for what's next.

## Autonomy & Working Mode

This project runs in high-autonomy mode:

- Once given a task or phase, proceed through the full implementation —
  including multi-hour sessions — without pausing for approval on routine
  decisions.
- Work in the staged manner already established: implement a coherent unit,
  verify it for real (typecheck, lint, unit tests, and a runtime check
  where the change is user-facing — not just "it should work"), then move
  to the next unit. See [`docs/engineering-standards.md`](docs/engineering-standards.md).
  and the pattern in `docs/implementation/foundation.md`.
- Use sensible defaults consistent with existing docs/ADRs rather than
  asking. When a genuinely new architectural decision is required, record
  it as a new ADR (per [`docs/adr/README.md`](docs/adr/README.md)'s rules)
  and keep going — don't pause to ask permission for a decision that gets
  documented anyway.
- At natural milestones (end of a roadmap phase, or a sensible stopping
  point in a long session), give a concise progress note. This is a status
  update, not a request for permission.

## Decision Boundaries — Stop and Ask

Even in autonomous mode, stop and ask before:

1. **Git:** committing, pushing, merging into `main`, or any destructive
   git operation (`reset --hard`, force-push, branch deletion, history
   rewrite).
2. **External services:** creating or connecting any account, project, or
   paid service (Supabase project, Vercel project, domain registration, a
   new API/vendor account). See
   [`docs/local-supabase-strategy.md`](docs/local-supabase-strategy.md) and
   [`docs/vercel-preparation.md`](docs/vercel-preparation.md) for what's
   already prepared but deliberately not created.
3. **Cost:** anything that spends real money or commits to a paid
   tier/subscription.
4. **Scope:** starting a roadmap phase out of sequence, or building
   anything on an "Out of Scope" list, without confirming the phase change
   first.
5. **Data:** sending real user/portfolio data to any third party (an AI
   provider, analytics, etc.). See
   [`docs/data-classification.md`](docs/data-classification.md) and
   [`docs/threat-model.md`](docs/threat-model.md).
6. **Destructive data operations:** dropping/altering a table or column in
   an environment holding real (non-throwaway) data, or deleting a
   migration already applied to a real environment.
7. **Reversing an existing decision:** if new information suggests an ADR's
   decision should change, write a new _superseding_ ADR and flag it
   explicitly — never silently deviate from a recorded decision.
8. **Genuine ambiguity:** anything the existing docs don't clearly answer
   and that would be expensive to reverse.

Everything else — writing code, adding tests, extending the schema within
an already-approved phase, refactoring, fixing bugs found along the way —
proceeds without a check-in.

## Quality Bar (always true, not something to ask about)

- `pnpm check` (format, lint, typecheck, unit tests) passes before any
  stage is considered done.
- New domain logic gets unit tests; new user-facing flows get a real
  runtime check.
- No mock or invented financial data, ever.
- Every new table has Row-Level Security and a negative-path test proving
  an unauthorized user can't access it.
- Follow [`docs/coding-standards.md`](docs/coding-standards.md) and
  [`docs/engineering-standards.md`](docs/engineering-standards.md).

## Commands

See [`README.md`](README.md) for the full command reference
(`pnpm dev`, `pnpm check`, `pnpm test:e2e`, etc.) and environment setup.
