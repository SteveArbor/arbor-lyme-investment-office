# Implementation Record: Foundation Milestone

**Date:** 2026-07-19
**Branch:** `foundation`
**Status:** Complete and committed (`2ce68b5`–`110de62`; the sign-off
checklist below reflects the state at review time and is left as a
historical record, not a live checklist). Phase 2 was built on top of this
milestone — see `docs/implementation/phase-2-architecture-review.md` and
`docs/implementation/staff-engineer-review.md` for what came after.

This is the authoritative record of what the Foundation milestone actually
built, as distinct from what the architecture documents describe for later
phases. Where this document and another doc's prose disagree on current
status, this document wins — it is the one updated at implementation time,
not speculatively.

## Scope Completed

Per the Foundation brief's Part A (final architectural additions) and Part
B (implementation):

- **Part A:** `decision-engine.md`, `rules-engine.md`, `data-flow.md` (10
  Mermaid diagrams), `data-classification.md`, `threat-model.md`,
  backup/recovery documentation, the 14-phase roadmap rewrite, ADRs
  0014–0017.
- **Part B:** a working Next.js application implementing authentication,
  settings, audit, the internal event system's in-request tier, a
  feature-flag registry, brand integration, the required UI screens,
  security headers, structured logging, a health endpoint, a full testing
  setup (unit/component/e2e), code quality tooling, CI, Dependabot, and
  developer-experience documentation.

**Explicitly not built** (per the brief's "Out of Scope" list, honoured
throughout): portfolio management, transactions, market data, watch
lists, rules evaluation, decision recommendations, research records,
document uploads, AI providers/briefings, email notifications, broker
connectivity, trade execution, payments, public registration. No mock
financial data exists anywhere in the codebase.

## Architecture Applied

- **Domain-Driven Design structure** (`docs/domain-driven-design.md`):
  `domain/settings`, `domain/audit`, `domain/shared` are real,
  framework-independent TypeScript with zero Next.js/React/Supabase
  imports — verified by the fact that their unit tests run under plain
  Vitest with no DOM, no server, no database. Every other `domain/*` and
  `infrastructure/*` folder contains a `README.md` stating its planned
  status and target phase, not empty scaffolding.
- **Dependency inversion**: `domain/settings/repository.ts` and
  `domain/audit/repository.ts` are interfaces; `infrastructure/database/`
  provides the Supabase implementations. Domain services depend only on
  the interfaces.
- **Event-driven audit**: `SettingsChanged` is published by
  `domain/settings/service.ts` and consumed by an audit subscriber
  (`application/services/audit-subscribers.ts`) — audit capture is a
  consequence of the event already existing, not a duplicated manual call.
  Proven by `application/services/audit-subscribers.test.ts`, which wires
  a real `InProcessEventBus` between fake repositories and asserts the
  audit record's shape.
- **Composition root**: `application/services/compose.ts` is the one place
  that constructs concrete repository/service instances, matching
  `provider-architecture.md`'s "small composition module" pattern.

## Files and Modules Created

```
src/
  config/               env.public.ts, env.server.ts (lazy, memoized validation)
  domain/
    shared/              events.ts, errors.ts — DomainEvent/EventBus contract, base errors
    settings/             model.ts, repository.ts, service.ts, feature-flags.ts
    audit/                 model.ts, repository.ts, service.ts
    portfolio/ trading/ market/ analytics/ decision/ rules/
    research/ documents/ alerts/ ai/                        README.md only — Planned
  infrastructure/
    auth/                  supabase-browser-client.ts, supabase-server-client.ts, update-session.ts
    database/               settings-repository.ts, audit-repository.ts
    events/                  in-process-event-bus.ts
    market-data/ ai/ notifications/ storage/ documents/       README.md only — Planned
  application/
    services/               compose.ts, audit-subscribers.ts
  components/
    layout/                 site-nav.tsx, disclaimer.tsx
    ui/                     empty-state-card.tsx
  app/
    layout.tsx, page.tsx, error.tsx, global-error.tsx, not-found.tsx
    (auth)/sign-in/, (auth)/actions.ts
    (protected)/layout.tsx, dashboard/, settings/
    access-denied/
    api/health/
  proxy.ts                 (Next.js 16's renamed middleware.ts)
  types/database.ts        hand-written, matches migrations exactly
  lib/logger.ts
```

## Database Migrations Created

`supabase/migrations/`:

1. `20260719000001_create_profiles.sql`
2. `20260719000002_create_user_settings.sql`
3. `20260719000003_create_audit_events.sql`
4. `20260719000004_profile_creation_trigger.sql`

**Validated against a real PostgreSQL 16 instance** (installed via
Homebrew, not Docker/Supabase CLI — see `docs/local-supabase-strategy.md`
for why no Docker was used), with a hand-written stub of Supabase's
`auth.uid()`/`auth.users`. 11 negative/positive RLS and permission tests
were run directly via `psql`, all passing:

- A user can read/update only their own `profiles`/`user_settings` row.
- A user cannot update another user's settings (0 rows affected).
- A user can insert an audit event naming themselves; **cannot** insert
  one naming another user as actor (RLS policy violation, correctly
  rejected).
- A user cannot see another user's audit events.
- `UPDATE`/`DELETE` on `audit_events` is rejected for every role
  (`permission denied for table` — the table-level `REVOKE`, not just RLS,
  is what's enforcing this).
- The `anon` role (no session) cannot read `profiles` at all
  (`permission denied for table` — no grant exists).

This process caught and fixed a real bug: the original migrations had RLS
policies but no table-level `GRANT`s, which would have produced blunt
"permission denied" errors for every authenticated query rather than
correct row-level filtering. Fixed before this record was written; see the
`grant select, update` statements in the migration files.

The throwaway Postgres instance and all test data were torn down after
validation; nothing from that process persists except the corrected
migration files themselves. **No Supabase project — hosted or local — was
created.**

## Security Controls Implemented

| Control                                                    | Status                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row-Level Security on every table                          | ✅ Implemented, tested (see above)                                                                                                                                                                                                                                           |
| Audit log append-only (RLS + `REVOKE`)                     | ✅ Implemented, tested                                                                                                                                                                                                                                                       |
| No service-role client anywhere in the codebase            | ✅ (ADR 0021)                                                                                                                                                                                                                                                                |
| Generic auth error messages (no user enumeration)          | ✅ Implemented, e2e-tested                                                                                                                                                                                                                                                   |
| No public sign-up route                                    | ✅ (route doesn't exist)                                                                                                                                                                                                                                                     |
| Security headers (CSP, HSTS, X-Frame-Options, etc.)        | ✅ Implemented, verified via live HTTP response headers                                                                                                                                                                                                                      |
| CSP strictness                                             | ⚠️ Baseline (`'unsafe-inline'`), not nonce-based — deliberate trade-off, see ADR 0022                                                                                                                                                                                        |
| Env var validation, secrets never logged/exposed to client | ✅ Implemented, tested (`env.public.test.ts`)                                                                                                                                                                                                                                |
| Audit metadata sanitization (deny-list)                    | ✅ Implemented, tested                                                                                                                                                                                                                                                       |
| Rate limiting on sensitive routes                          | 🧭 Designed only (`docs/threat-model.md` §3), not backed by infrastructure this phase — Supabase Auth's own rate limiting is the only current protection                                                                                                                     |
| Dependency audit                                           | ✅ `pnpm audit` enforced in CI (`--audit-level=moderate`, no `continue-on-error`) — one real moderate finding (postcss XSS, GHSA-qx2v-qp2m-jg93, pulled in transitively via Next.js's own dependency) was found and fixed via a `pnpm-workspace.yaml` override, not silenced |
| Secrets committed to Git                                   | ✅ Manually reviewed before this record was written — see Validation section                                                                                                                                                                                                 |

## Tests Created

- **34 Vitest unit/component tests** across 10 files: `env.public`,
  `domain/settings/service`, `domain/settings/feature-flags`,
  `domain/audit/model` (sanitization), `domain/audit/service` (fail-open
  behaviour), `infrastructure/events/in-process-event-bus`,
  `application/services/audit-subscribers` (the full wiring, end to end),
  `api/health/route`, and two component tests
  (`components/ui/empty-state-card`, `(auth)/sign-in/sign-in-form`).
- **8 Playwright e2e tests** across 4 files: sign-in rendering and generic
  error behaviour, protected-route redirects (`/dashboard`, `/settings`,
  `/`), custom 404 handling, and one authenticated-journey test that is
  prepared but skipped by default (requires real Supabase credentials this
  environment doesn't have).
- All tests pass; two real bugs were caught and fixed by actually running
  them (not just writing them): a `server-only` import breaking a
  client-component test (fixed via mocking), and a Playwright locator
  colliding with Next.js's own route-announcer element (fixed via a more
  specific locator).

## Known Limitations

- **Login/Logout audit capture is best-effort, not guaranteed.** Both are
  recorded via direct calls from the sign-in/sign-out Server Actions, not
  a framework-level auth event listener (no such hook exists in the
  current Supabase SSR architecture for Next.js). A client that
  disconnects mid-request, or a session that expires without an explicit
  sign-out action, will not produce a Logout audit record. This is the
  limitation `docs/audit-strategy.md` explicitly asked to be documented
  rather than glossed over.
- **CSP is baseline, not nonce-based** (ADR 0022) — real but currently
  low-impact given no third-party scripts or user-rendered HTML exist yet.
- **Rate limiting is designed, not implemented** — Supabase Auth's
  own throttling is the only current protection against credential
  stuffing (`docs/threat-model.md` §3).
- **`pnpm-workspace.yaml` carries one dependency override** (`postcss` →
  `^8.5.10`, fixing GHSA-qx2v-qp2m-jg93 in Next.js's bundled copy) — worth
  re-checking when Next.js itself is upgraded, since a future Next.js
  release will likely bundle an already-patched postcss and the override
  can be removed at that point.
- **Settings model is a flat per-user row**, not the full layered
  resolution chain `docs/settings-engine.md` describes — correct for one
  user, revisited when household/system-level defaults are needed
  (Phase 6+, multi-user).

## Deferred Work

Everything in `docs/development-roadmap.md` Phase 2 onward: portfolio,
trading, market data, analytics, rules, decisions, research, documents,
AI, alerts, reporting, broker import. Additionally, deferred within
"security foundation" specifically: nonce-based CSP and real rate
limiting infrastructure.

## Manual Setup Still Required

Before this application can run against real data:

1. Create a Supabase project (hosted, per `docs/local-supabase-strategy.md`)
   — not done by this milestone.
2. Copy `.env.example` to `.env.local` and fill in real values.
3. Link the Supabase CLI and run `supabase db push` to apply the four
   migrations to the real project.
4. Create the first user via the Supabase dashboard (no self-service
   sign-up exists).
5. When ready to deploy: create and connect a Vercel project
   (`docs/vercel-preparation.md`) — not done by this milestone.
6. Enable GitHub's secret scanning / push protection on the repository
   (recommended in `docs/threat-model.md` §13, not something configurable
   from within the repository itself).

## Review Checklist

- [ ] Read `docs/threat-model.md`'s Foundation-phase coverage summary and
      confirm the 9 threats marked Implemented match your own assessment.
- [ ] Skim the four migration files in `supabase/migrations/` — these are
      the highest-consequence files in this milestone.
- [ ] Run `pnpm check` locally and confirm it passes on your machine
      (Node version differences are the most likely source of any
      divergence from what's reported here — see ADR 0018).
- [ ] Run `pnpm test:e2e` locally and confirm the 7 runnable tests pass.
- [ ] Decide whether to create the Supabase project now or later (this
      does not block reviewing/committing the code itself).
- [ ] Review the proposed commit grouping (end of this milestone's
      completion response) before approving any commit.
