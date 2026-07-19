# Local Supabase Strategy

## Recommendation: Hosted Development Project, Not Local CLI/Docker

**Use a hosted Supabase development project, not `supabase start` (the local
CLI's Docker-based stack).**

## Reasoning

- This is a single developer working with Claude Code, not a team needing
  fully isolated local databases per branch — the coordination problem local
  Supabase primarily solves doesn't apply here.
- The Foundation brief explicitly instructs: "Do not require Docker unless
  it is clearly justified and the user approves it." Local Supabase's CLI
  stack runs Postgres, GoTrue (Auth), PostgREST, Realtime, and Storage as
  Docker containers — a genuine, non-trivial dependency to require for a
  project that doesn't need per-branch database isolation.
- A hosted dev project is reliable (no "works on my machine" container
  drift), requires no local resource overhead, and is directly reachable
  from Vercel preview deployments — a local Supabase instance is not
  reachable from a Vercel preview at all, which would otherwise force a
  second, different configuration for previews vs. local development.
- Migrations (`supabase/migrations/*.sql`, already written and validated —
  see `docs/implementation/foundation.md`) apply identically to a hosted
  project via the Supabase CLI's `supabase db push` / `supabase
migration up` against a linked remote project — no functional loss
  versus local development.

## What This Milestone Did _Not_ Do

Per explicit instruction, **no Supabase account or project was created**
during Foundation. Migrations were validated against a throwaway _native_
(Homebrew-installed, non-Docker) local PostgreSQL instance instead — see
`docs/implementation/foundation.md` for exactly what that validated and its
limits (no real Supabase Auth, a hand-written stub of `auth.uid()`).

## Setup Steps (For When You're Ready)

These are prepared instructions, not actions taken on your behalf:

1. Create a Supabase account and a new project at
   [supabase.com](https://supabase.com) (a personal decision — this project
   deliberately stops here and does not create one for you).
2. From the project's **Settings → API** page, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Create `.env.local` from `.env.example` and fill in those two values plus
   `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
4. Install the Supabase CLI (`pnpm dlx supabase --version` to run it without
   a global install, or `brew install supabase/tap/supabase`).
5. Link the CLI to your project: `supabase link --project-ref <your-ref>`.
6. Apply the Foundation migrations: `supabase db push`.
7. Confirm the `on_auth_user_created` trigger and RLS policies are active
   by inspecting the **Table Editor** and **Authentication → Policies**
   pages in the Supabase dashboard.
8. Run `pnpm dev` and sign in — there is no public sign-up UI (deliberate,
   see `docs/implementation/foundation.md`), so create your first user via
   the Supabase dashboard's **Authentication → Users → Add user** (or
   `supabase.auth.admin.createUser` via the CLI/SQL) rather than a
   self-service form.

## Production and Staging

The same hosted-project approach extends naturally: a separate Supabase
project for production (never sharing data with the development project),
consistent with `deployment-strategy.md`'s environment separation
principle. Creating that production project is likewise not done by this
milestone — it is a deliberate, explicitly-approved action for whenever
real deployment begins.

## When to Reconsider Local Docker-Based Supabase

Revisit this recommendation if: multiple contributors join and need
isolated per-branch databases, offline development becomes a real
requirement, or CI needs to run integration tests against a full Supabase
stack rather than the throwaway native-Postgres approach used for migration
validation in this milestone. None of these apply yet.
