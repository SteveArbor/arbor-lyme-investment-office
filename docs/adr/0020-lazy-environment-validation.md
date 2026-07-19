# 0020. Lazy (Not Eager) Environment Variable Validation

**Status:** Accepted

## Context

`security-foundation`/`environment-validation` (Foundation brief §13)
requires environment variables to fail safely and clearly when absent, and
separately requires that ordinary quality checks — including the
production build — must not require production secrets. During
implementation, an eager top-level `export const publicEnv =
loadPublicEnv()` (validated once, at module import time) caused `pnpm
build` to fail outright: Next.js imports route/layout modules to collect
their configuration during the build's "Collecting page data" phase, even
for routes that are dynamically rendered at request time — merely
importing the Supabase client factory (which imports the env module)
triggered validation and threw, with no real request or credentials
present.

## Decision

Environment validation (`src/config/env.public.ts`,
`src/config/env.server.ts`) is lazy: a memoized `getPublicEnv()` /
`getServerEnv()` function validates on first call, not at module import
time. Every call site (`createSupabaseBrowserClient`,
`createSupabaseServerClient`, `updateSession`) calls the getter inside its
own function body, which only executes when a real request actually needs
a Supabase client — never merely because a module was imported during
build-time analysis.

## Consequences

- `pnpm build` succeeds without any real Supabase credentials, satisfying
  the explicit Foundation requirement that ordinary quality checks not
  require production secrets — verified directly (the build failed before
  this change, succeeded after).
- Validation still fails fast and clearly the moment a request actually
  needs the values (e.g., the proxy/middleware's first invocation per
  server instance) — "lazy" here means "on first genuine use," not "never
  validated" or "validated deep inside an unrelated error."
- Every future server-only or public environment variable must follow the
  same getter pattern, not a top-level `export const` — a convention now
  established by this ADR and the inline comments in both env modules,
  worth remembering since the eager form works fine in simpler contexts
  (a standalone Node script) and the failure mode here is specific to
  Next.js's build-time module collection behaviour.

## Alternatives Considered

- **Keep eager validation; set placeholder env vars during `next build` in
  CI/locally** — rejected: pushes a workaround onto every environment that
  ever runs a build (CI, local dev, Vercel's own build step) instead of
  fixing the actual design flaw once, and a developer running a bare
  `pnpm build` locally without prior knowledge of this requirement would
  still hit the failure.
- **A `SKIP_ENV_VALIDATION` escape-hatch environment variable** (a common
  pattern in other Next.js projects facing this exact issue) — rejected:
  an escape hatch that must be remembered and set is worse than a design
  that doesn't need one; lazy validation solves the root cause directly.

## Future Review Criteria

None anticipated — this is now the established pattern for all
environment access in this codebase; revisit only if a future Next.js
version changes how/when route modules are imported during build in a way
that reintroduces the original failure mode.
