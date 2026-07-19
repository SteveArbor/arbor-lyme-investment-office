# Coding Standards

These standards exist to keep a long-lived, primarily solo-maintained codebase
consistent, readable, and safe to change months or years after it was written.
This document covers concrete conventions (naming, layout, workflow); the
judgment and principles behind them (SOLID, testing philosophy, Definition of
Done) are in **`engineering-standards.md`** — read both.

## Language & Type Safety

- TypeScript in `strict` mode, project-wide. No `any` without an explicit comment
  justifying why (e.g., a genuinely untyped third-party payload at a boundary).
- Prefer explicit types on function signatures (parameters and return types) for
  anything exported or crossing a module boundary; inference is fine for local
  variables.
- Domain types (e.g., `Portfolio`, `Transaction`, `Position`) are defined once, in
  the domain layer, and reused everywhere — not redefined ad hoc per component.
- Money/amount values are handled with explicit units and a consistent
  representation (e.g., integer minor units or a decimal library) — never raw
  floating-point arithmetic for currency. This is non-negotiable given the domain.
- Dates are handled with explicit timezone awareness; ambiguous local-time handling
  is a common source of financial-reporting bugs.

## Repository Structure

The full structure and its reasoning are specified in **`domain-driven-design.md`**
(ADR 0005); summarized here:

```
src/
  app/                  Next.js App Router routes, layouts, pages — composition only
  components/           Shared, reusable UI components (presentational)
  domain/<context>/      Framework-independent business logic, one folder per
                         bounded context (portfolio, trading, market, analytics,
                         research, ai, alerts, documents, settings, audit)
  infrastructure/        Implementations of interfaces domain/* defines
                         (database, auth, ai, market-data, storage, notifications, events)
  lib/                  Generic, domain-agnostic utilities only
  hooks/                Shared client-side React hooks
  types/                Cross-cutting shared types only
/tests                 Unit and integration tests (mirrors source structure)
/e2e                   Playwright end-to-end tests
/docs                  Project documentation, including /docs/adr
```

- Domain logic never imports from `app/`, `infrastructure/`, or Next.js-specific
  modules — dependency direction flows from framework/infrastructure code into
  domain code, never the reverse (`domain-driven-design.md`'s dependency rule).
  This is what keeps valuation/calculation logic unit-testable without a server or
  database.
- Cross-context imports go through a context's `index.ts` public exports only —
  reaching into another context's internals (e.g., `domain/trading` importing a
  non-exported type from `domain/portfolio/model.ts` directly) is treated as a
  bug, not a convenience.
- Server-only code (service-role Supabase clients, secrets) is clearly isolated into
  modules that cannot be imported from a Client Component. Prefer the `server-only`
  package to make this a build-time error, not a convention people can forget.

## Naming

- Files: `kebab-case.ts` / `kebab-case.tsx`.
- React components: `PascalCase` matching the file's default export.
- Functions/variables: `camelCase`. Types/interfaces: `PascalCase`.
- Booleans read as questions: `isActive`, `hasHoldings`, not `active`, `holdings`.
- No abbreviations that aren't immediately obvious (`txn` is acceptable if used
  consistently and defined once; avoid inventing new shorthand per file).

## Components & Server/Client Boundary

- Default to Server Components. Add `'use client'` only when a component genuinely
  needs interactivity, browser APIs, or React state/effects.
- Keep Client Components small and near the leaves of the tree — a client boundary
  should wrap the minimum interactive surface, not an entire page.
- Mutations go through Server Actions or Route Handlers, never direct client-side
  writes to Supabase using elevated privileges.

## Validation & Error Handling

- All external input (form submissions, route handler bodies, query params used for
  anything beyond display) is validated with a Zod schema before use.
- Errors are handled explicitly at boundaries: a failed validation or a Supabase
  error produces a clear, typed result the UI can act on — no silently swallowed
  errors, and no leaking raw database error messages to the client.
- Do not add speculative error handling for cases that cannot occur given the
  surrounding type guarantees; validate at the boundary and trust types afterward.

## Testing

- Domain logic (valuation, performance calculations, aggregation) requires unit
  test coverage as a condition of merging — this is the highest-risk code in the
  application.
- Critical user journeys (login, record a transaction, view portfolio value) are
  covered by Playwright end-to-end tests.
- Tests live alongside or in a structure mirroring the code they test, and are run
  in CI on every pull request (see `deployment-strategy.md`).

## Git & Review Workflow

- Work happens on feature branches off `main`; `main` is always deployable.
- Commit messages are written in the imperative mood and explain _why_, not just
  _what_, when the reason is not obvious from the diff.
- Every change affecting the database layer or authorization (RLS policies)
  receives deliberate self-review against `security-principles.md` before merging,
  given the sensitivity of the data involved.
- No direct commits to `main` for anything beyond trivial documentation fixes.

## Formatting & Linting

- Prettier is the single source of truth for formatting; no manual formatting
  debates. ESLint enforces correctness rules (unused vars, exhaustive hooks deps,
  no-floating-promises, etc.).
- CI fails on lint errors and type errors — these are not "warnings to fix later."

## Comments & Documentation

- Code should be self-explanatory through naming and structure. Comments explain
  _why_, not _what_ — a non-obvious constraint, a workaround, a deliberate
  trade-off.
- Every non-trivial module exporting domain logic (e.g., a valuation calculation)
  has a short comment describing the method/assumption used (e.g., "time-weighted
  return, geometrically linked across sub-periods") since financial calculation
  methodology is easy to get subtly wrong and hard to notice when wrong.

## Dependencies

- New dependencies are added deliberately, not reflexively — prefer the standard
  library or an existing dependency over adding a new package for a small utility.
  This keeps the dependency surface (and its associated security/maintenance
  burden) as small as reasonably possible over the life of the project.
- Dependency updates are reviewed, not auto-merged blindly, particularly for
  anything touching auth, database access, or cryptography.
