# Vercel Preparation

This documents what's needed to deploy on Vercel and how deployment should
be structured. **No Vercel project has been created or connected during
this milestone** — this is preparation and documentation only, per explicit
instruction.

## Required Environment Variables

Set per-environment in Vercel's **Project Settings → Environment
Variables**, scoped to Production / Preview / Development as appropriate —
never committed (`.env.example` documents names only):

| Variable                        | Scope            | Notes                                                                                                                                                                                |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | All environments | Production points at the production Supabase project; Preview/Development point at the development project (`docs/local-supabase-strategy.md`) — never the same project across both. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All environments | Same environment-separation rule as above.                                                                                                                                           |
| `NEXT_PUBLIC_APP_URL`           | All environments | The deployment's own URL — Vercel's `VERCEL_URL` could auto-derive this for previews, but an explicit value is clearer and matches what auth redirect links need to be stable.       |

Not set in any environment this milestone: `SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET` — unused by any Foundation code path (`.env.example`
explains why). Add them only when a phase that actually uses them ships.

## Preview Environment Approach

- Every pull request gets an automatic Vercel preview deployment, built
  against the **development** Supabase project's environment variables —
  never production data.
- Preview deployments are where a reviewer verifies a change actually
  works (`deployment-strategy.md`'s CI/CD section), not just that it
  compiles.
- **Protection:** Vercel's preview deployments should have **Deployment
  Protection** enabled (Vercel Authentication or a shared password,
  depending on plan) so preview URLs — which are guessable/discoverable —
  are not an unauthenticated back door to an otherwise-protected
  application. This is a Vercel project setting to enable when the project
  is created, not something configurable from application code.

## Production Environment Approach

- Production deploys automatically from the `main` branch (per
  `deployment-strategy.md`'s continuous-deployment approach), using the
  production Supabase project's credentials.
- A custom domain (when one is configured — **not done this milestone**)
  is attached to the production deployment only; preview deployments keep
  their `*.vercel.app` URLs.

## Deployment Checks

Before a merge to `main` reaches production, the same checks CI already
runs (`.github/workflows/ci.yml`) must pass: format, lint, typecheck, unit
tests, build. Vercel's own build step re-runs `pnpm build` as part of
deployment — a build that passed in CI but somehow fails on Vercel would
indicate an environment difference worth investigating (e.g., a missing
environment variable in Vercel that CI's build step supplied as a
placeholder), not a code problem.

## Custom Domain Approach

Not configured this milestone (explicitly out of scope — no live domain is
set up). When ready: attach the domain in Vercel's **Project Settings →
Domains**, pointing its DNS at Vercel per their instructions, with the
production `main` branch as the target. HTTPS is automatic via Vercel's
managed certificates.

## Rollback Approach

Vercel retains every previous deployment. If a production deploy causes a
problem, the prior deployment can be promoted back to production
instantly from the Vercel dashboard (or `vercel rollback` via the CLI) —
no code revert or redeploy is required for an immediate rollback; a code
fix follows separately at normal pace. This is consistent with
`deployment-strategy.md`'s rollback strategy, restated here in
Vercel-specific terms.

## What Remains a Manual, Explicitly-Approved Step

Creating the actual Vercel project, connecting it to the GitHub
repository, and configuring the environment variables above are all
outside this milestone's scope — genuinely external-service actions
requiring your explicit go-ahead, not something to do unilaterally.
