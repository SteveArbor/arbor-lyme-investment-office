# 0019. Pin TypeScript to 6.0.x, Not the Newly-Released 7.0

**Status:** Accepted

## Context

TypeScript 7.0 reached general availability on 8 July 2026 (11 days before this
decision), introducing a ground-up native (Go-based) compiler with substantial
performance gains. However, at time of writing, TypeScript 7.0 does not yet ship
a stable programmatic compiler API — `typescript-eslint` has explicitly closed
TS7 support as "not planned" until this lands (expected in TypeScript 7.1), which
means ESLint's TypeScript-aware linting (a required part of this project's code
quality tooling, `engineering-standards.md`, `coding-standards.md`) is not
currently compatible with TypeScript 7.

## Decision

Pin the project to **TypeScript 6.0.3**, the latest fully stable 6.x release with
complete `typescript-eslint`/ESLint ecosystem compatibility, rather than
TypeScript 7.0.x.

## Consequences

- Full compatibility with the ESLint-based linting required by this project's
  code quality standards, with no compatibility shims needed.
- Forgoes TypeScript 7's compiler performance improvements for now — acceptable,
  since this project's codebase is small at this milestone and compile time is
  not currently a bottleneck.
- Creates a known, deliberate future upgrade: once `typescript-eslint` ships
  stable TypeScript 7 support (expected alongside TypeScript 7.1's stable
  compiler API), upgrading becomes a normal dependency bump, tracked via
  Dependabot (`github-actions`, §26) rather than an urgent migration.

## Alternatives Considered

- **Use TypeScript 7.0 with the `@typescript/typescript6` compatibility shim for
  ESLint only** — rejected for this milestone: adds a second TypeScript version
  and a compatibility-shim dependency to the toolchain for a benefit (compiler
  speed) that doesn't matter yet at this codebase's size; unnecessary complexity
  per YAGNI (`engineering-standards.md`).
- **Use TypeScript 7.0 and disable/relax TypeScript-aware ESLint rules** —
  rejected: would weaken the code quality bar this project explicitly commits to
  (`engineering-standards.md`, `coding-standards.md`) for a brand-new major
  version's ecosystem to catch up.

## Future Review Criteria

Revisit once `typescript-eslint` ships stable TypeScript 7.x support (tracked via
their release notes / Dependabot updates) — upgrade at that point is expected to
be routine, not exceptional.
