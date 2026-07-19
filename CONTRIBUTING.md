# Contributing

Arbor Lyme Capital is a private project, currently maintained by its
owner (with AI-assisted development via Claude Code). This document exists
so that both future-you and any future collaborator (human or AI) work
against the same expectations.

## Before You Start

Read, in order:

1. [`docs/vision.md`](docs/vision.md) — what this is and why.
2. [`docs/architecture.md`](docs/architecture.md) and
   [`docs/domain-driven-design.md`](docs/domain-driven-design.md) — how the
   codebase is structured and why.
3. [`docs/coding-standards.md`](docs/coding-standards.md) and
   [`docs/engineering-standards.md`](docs/engineering-standards.md) — the
   concrete conventions and the judgment behind them.
4. [`docs/development-roadmap.md`](docs/development-roadmap.md) — what
   phase we're in and what's next.

## Git Workflow

- Feature branches off `main` (or the current milestone branch, e.g.
  `foundation`); `main` is always deployable.
- Commit messages: imperative mood, explain _why_ when not obvious from
  the diff.
- No direct commits to `main` beyond trivial documentation fixes.
- Never force-push a shared branch without explicit agreement.

## Before Opening a Pull Request

Run the full local gate:

```bash
pnpm check
```

This runs format-check, lint, typecheck, and unit tests — the same checks
CI runs (`.github/workflows/ci.yml`). For anything touching a user-facing
flow, also run the relevant Playwright journey:

```bash
pnpm test:e2e
```

## Definition of Done

A change is not done until (full list in
[`docs/engineering-standards.md`](docs/engineering-standards.md)):

- It satisfies the stated requirement, including edge cases actually
  implied by it — not hypothetical ones (YAGNI).
- It has test coverage matching its risk: domain logic gets unit tests;
  critical user journeys get e2e coverage.
- `pnpm check` passes.
- It respects the dependency direction in
  [`docs/domain-driven-design.md`](docs/domain-driven-design.md) — domain
  code never imports Next.js, React, Supabase, or any provider SDK.
- Any new database table has Row-Level Security policies _and_ a negative
  test proving an unauthorized user can't access it (see
  `docs/database-design.md`, `docs/threat-model.md`).
- Any new significant domain action is wired to the audit system
  (`docs/audit-strategy.md`) where applicable.
- Documentation affected by the change is updated in the same change —
  documentation drift is treated as a defect.
- It has been manually exercised, not just passed automated checks, for
  anything user-facing.

## Architecture Decisions

Significant architectural decisions get a new, numbered ADR in
`docs/adr/` — never edit an existing ADR's decision after the fact; if a
decision changes, write a new ADR that supersedes it (see
`docs/adr/README.md` for the exact convention).

## Code Style

Formatting (Prettier) and linting (ESLint) are enforced automatically —
run `pnpm format` before committing if you haven't configured your editor
to format on save. Don't hand-format code to match Prettier; let the tool
do it.

## Security-Sensitive Changes

Anything touching authentication, RLS policies, the audit system, or
environment/secrets handling gets extra scrutiny against
[`docs/security-principles.md`](docs/security-principles.md) and
[`docs/threat-model.md`](docs/threat-model.md) before merging — this is
the highest-stakes category of change in this codebase, given the domain.

## Reporting a Security Issue

See [`SECURITY.md`](SECURITY.md) — please do not open a public issue for a
genuine vulnerability.
