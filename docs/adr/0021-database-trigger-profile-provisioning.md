# 0021. Database-Trigger-Based Profile/Settings Provisioning, No Service-Role Client

**Status:** Accepted

## Context

Every new user needs a `profiles` row and a `user_settings` row (populated
with Foundation defaults) as soon as their `auth.users` record is created.
The application code that could create these rows has no authenticated
session to do so as the new user (they haven't signed in yet at the moment
their account is created), which would normally motivate a privileged
service-role client that bypasses RLS. The Foundation brief explicitly
instructs: "Do not create a service role client unless a current
Foundation requirement genuinely needs it."

## Decision

Provision `profiles` and `user_settings` via a `SECURITY DEFINER` Postgres
trigger function (`handle_new_user()`,
`supabase/migrations/20260719000004_profile_creation_trigger.sql`) fired
`AFTER INSERT ON auth.users`, with `search_path` explicitly pinned
(`set search_path = public, pg_temp`) to close the standard
`SECURITY DEFINER` privilege-escalation vector. **No service-role client
exists anywhere in the Foundation codebase** — every Supabase interaction
in application code uses the anon key plus the caller's session, scoped by
RLS.

## Consequences

- Removes the single highest-impact credential category
  (`docs/threat-model.md` §9) from the application entirely for this
  milestone — there is no service-role key to leak from application code,
  because none is used.
- Profile/settings creation is guaranteed atomic with user creation (same
  trigger transaction) rather than depending on a follow-up application
  call that could fail or be skipped.
- This pattern generalizes: any future privileged operation should first
  be evaluated for whether a `SECURITY DEFINER` database function solves
  it before reaching for a service-role client in application code — the
  service-role client remains available in `provider-architecture.md`'s
  design for cases that genuinely need to bypass RLS from application
  code (none exist yet), but this ADR establishes that it is not the
  default tool.
- Adds a small amount of PL/pgSQL to maintain instead of TypeScript — a
  reasonable trade for the security property gained, and consistent with
  "the database enforces its own invariants" (`docs/database-design.md`).

## Alternatives Considered

- **A service-role client used only for profile creation, called from a
  Supabase Auth webhook or the sign-up flow** — rejected: introduces the
  highest-impact credential into the codebase for a need a database
  trigger meets without it; also more moving parts (a webhook endpoint,
  its own auth) than a trigger.
- **No automatic provisioning; require the user to fill in a "complete
  your profile" form after first sign-in** — rejected: adds a manual step
  and a window where `user_settings` doesn't exist yet (every settings
  read would need a null-check/fallback path), for no benefit over
  automatic provisioning with sensible defaults.

## Future Review Criteria

Revisit if a genuine Foundation-or-later requirement needs to bypass RLS
from application code in a way no database trigger/function can express
(e.g., a scheduled job aggregating across all users for a system-level
report) — at that point, a service-role client is introduced deliberately,
scoped as narrowly as possible, per `provider-architecture.md`'s existing
guidance, not as a default.
