# Deployment Strategy

## Environments

Three distinct environments, kept strictly separate:

| Environment | Purpose                                   | Data                           |
| ----------- | ----------------------------------------- | ------------------------------ |
| Development | Local development, per-PR Vercel previews | Synthetic/seed data only       |
| Staging     | Pre-production validation                 | Synthetic/anonymized data only |
| Production  | Real usage                                | Real financial data            |

- Development and staging use a separate Supabase project from production. Real
  financial data never flows into a non-production environment, per
  `security-principles.md`.
- Each environment has its own set of environment variables/secrets in Vercel,
  scoped so that a preview deployment can never accidentally use production
  credentials.

## Hosting

- **Vercel** hosts the Next.js application.
  - **Production deployment:** triggered by merges to `main`.
  - **Preview deployments:** automatically created for every pull request, using
    the development Supabase project — this lets a change be reviewed against a
    real, running instance of the app before merging.
- **Supabase** hosts the database, auth, and storage as a managed service — no
  self-managed database infrastructure.

## CI/CD Pipeline

On every pull request:

1. Install dependencies (`pnpm install`).
2. Type-check (`tsc --noEmit`).
3. Lint (`eslint`).
4. Run unit/integration tests (`vitest`).
5. Run end-to-end tests (`playwright`) against the PR's preview deployment, for
   critical user journeys at minimum.
6. Vercel builds and publishes a preview deployment.

Merging to `main` requires all of the above to pass. Production deployment happens
automatically on merge, deploying the same build artifact that was validated in
preview — there is no separate manual production build step that could introduce
drift.

## Database Migrations in the Pipeline

- Migrations are applied via the Supabase CLI as an explicit step, kept in lockstep
  with the application code that depends on them — a migration merges in the same
  pull request as the code that requires it, and is applied to each environment as
  that environment is updated.
- Migrations run against staging (or the development Supabase project) as part of
  the standard PR/preview flow before ever running against production.
- Production migrations are applied deliberately as part of the release step, not
  silently on every deploy without visibility — especially for any migration that
  is not purely additive.

## Rollback Strategy

- **Application code:** Vercel retains prior deployments; a bad production release
  can be rolled back to the previous deployment immediately via Vercel's
  dashboard/CLI.
- **Database:** because migrations are additive-first (per `database-design.md`),
  most schema changes do not require a corresponding "down" migration to roll back
  application code safely. Destructive migrations are scheduled separately from the
  application-code change that stops using the old structure, so a code rollback
  never lands against an already-incompatible schema.

## Backups & Disaster Recovery

This section documents the **intended approach**. No paid backup tier is
purchased or enabled during the Foundation milestone — Foundation relies on
Supabase's free-tier default retention only, and the targets below are stated as
goals to configure against once a paid tier is deliberately approved.

### Database Backup Strategy

- Supabase automated daily backups are the baseline, upgraded to Point-in-Time
  Recovery (PITR) once a paid Supabase plan is approved — PITR is materially more
  important here than for a typical CRUD app because transaction/holding history
  is financial record-keeping data, not replaceable from an external source.
- Backup scope explicitly includes the `audit_log`/`audit_events` table — given
  its append-only, compliance-relevant nature (`audit-strategy.md`), its loss
  would be a more serious gap than losing a cache or derived table.
- Backups are classified **Confidential**, inheriting the classification of their
  contents (`data-classification.md`), and require access control equivalent to
  the live database — not a lesser standard just because they're "just a backup."

### Recovery Objectives

| Metric                             | Target                                                        | Rationale                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO (Recovery Point Objective)** | ≤ 24 hours on daily backups; ≤ 5 minutes once PITR is enabled | Financial transaction data loss is high-consequence; PITR is the target state, daily backup is the honest current-capability floor.                                                 |
| **RTO (Recovery Time Objective)**  | ≤ 4 hours for a full database restore                         | Reflects a private, single/small-user application — not a 24/7 commercial service — where a few hours of unavailability during recovery is tolerable but a multi-day outage is not. |

These are targets to design and test against, not yet-verified guarantees —
restore testing (below) is what converts a target into a verified capability.

### Restore Testing

- A restore is tested by actually restoring a backup to a separate/staging
  Supabase project and verifying data integrity (row counts, spot-checked
  records, RLS policies intact) — a backup that has never been restored is not a
  verified backup, and "Supabase says backups are enabled" is not sufficient
  evidence on its own.
- Restore testing occurs at minimum once per major roadmap phase
  (`development-roadmap.md`), and always before real financial data is first
  entered into production (i.e., before Phase 2 goes live for real use).

### Export of User-Owned Data

- Independent of platform backups, the user can export their own data
  (settings, and in later phases, holdings/transactions/research) in a portable
  format (e.g., JSON/CSV) — this is both a resilience measure (a copy outside the
  platform entirely) and, once multi-user ships, a reasonable data-portability
  expectation for any user's own data.
- Not built in Foundation (no financial data exists yet to export); the
  `user_settings` export path is straightforward to add once Foundation's
  Settings feature is in active use, and is noted here as planned, not
  implemented.

### Retention Approach

- Financial data backups: retained per Supabase's plan-level retention window,
  targeting the longest practical window once a paid tier is approved — consistent
  with `audit-strategy.md`'s indefinite-retention stance on the live audit log
  itself.
- Non-financial/operational data (logs): short rolling retention, per
  `data-classification.md` — no benefit to long retention, only expanded exposure.

### Environment Recovery Scenarios

| Scenario                                                      | Intended Response                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Loss of an external market/AI provider**                    | Not applicable to Foundation (no provider integrated yet). Future design: `provider-architecture.md`'s interface abstraction allows switching to an alternate implementation; cached/last-known data is served with clear staleness indication rather than the application failing outright.                                                     |
| **Loss of Vercel access**                                     | Source code is fully preserved in the GitHub repository independent of Vercel; a new Vercel project can be reconnected to the same repository and redeployed. No application state lives in Vercel itself (it is stateless compute), so this is a redeploy, not a data-recovery event.                                                           |
| **Loss of Supabase access**                                   | The higher-impact scenario, since Supabase holds all persistent data. Mitigated by: PITR/backups (once enabled) restorable to a new project; documented schema-as-migrations (`database-design.md`) means the schema itself can be rebuilt from version control even independent of a backup, though data would rely on the backup specifically. |
| **Compromised credentials** (service-role key, admin account) | Immediate rotation of the affected credential (`security-principles.md`); Supabase Auth session invalidation for the affected user; audit log review for the affected window to assess impact (`audit-strategy.md`).                                                                                                                             |

### What Is Explicitly Deferred

Enabling PITR, configuring a paid backup retention tier, and performing a live
restore drill against production are all deferred until explicitly approved —
this section documents intent and target metrics only, per the Foundation
milestone's constraint against purchasing or enabling paid functionality.

## Feature Flags Across Environments

- Feature flag defaults (`feature-flags.md`) are set per environment: new/
  in-progress modules default `off` in production while available for testing in
  development/staging, letting incomplete work merge continuously
  (`deployment-strategy.md`'s CI/CD section) without being deployed-and-visible
  simultaneously in production.

## Monitoring

- Sentry captures and alerts on unhandled errors in both client and server code in
  production.
- Vercel's built-in logs and analytics provide request-level visibility.
- Supabase's dashboard provides database-level metrics (connections, query
  performance) reviewed periodically, especially before/after schema changes.

## Domain & Access

- A custom domain is configured in Vercel for production once the application is
  ready for regular use, with automatic HTTPS.
- Access to the Vercel project, Supabase project, and domain registrar is limited
  to the principal (and, as the team grows, to explicitly trusted collaborators) —
  this is infrastructure-level access control, distinct from but as important as
  the application's own authentication/authorization model.

## Release Cadence

Given the small team and private nature of the application, there is no fixed
release train. Changes ship to production when they pass CI and are merged to
`main` — continuous deployment, not batched releases — which keeps each production
change small, reviewable, and easy to roll back if needed.
