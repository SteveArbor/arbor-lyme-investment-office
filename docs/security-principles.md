# Security Principles

Arbor Lyme Capital handles private financial data. Security is treated as a
first-class requirement from Phase 1 onward, not a pass applied later.

## Threat Model (Summary)

- **Primary asset to protect:** the confidentiality and integrity of financial
  records (holdings, transactions, valuations) and the credentials that gain access
  to them.
- **Primary actors:** the principal (and later, a small number of trusted invited
  users). This is not a public-facing system, so the threat model is dominated by
  credential compromise, misconfigured access control, and dependency/supply-chain
  risk — not by anonymous public abuse at scale.
- **Acceptable risk framing:** given the small user base, the priority is
  preventing unauthorized _access_ and preventing _data loss/corruption_ — not
  building defenses sized for a high-traffic public product.

## Authentication

- All authentication is delegated to Supabase Auth — no custom password storage or
  session handling is implemented in application code.
- Sessions use Supabase's standard secure, HTTP-only cookie-based session handling
  for server-rendered pages.
- Multi-factor authentication is enabled for the principal's account at minimum,
  and made available to all users once multi-user support ships (Phase 4).
- Password policy (if password auth is used) follows current best practice (length
  over complexity rules); magic-link or OAuth is preferred where it reduces
  credential-handling surface entirely.

## Authorization

- **Row-Level Security (RLS) is the source of truth for authorization**, enforced
  in PostgreSQL itself, not only in application code. Every table containing
  user-scoped data has RLS enabled with explicit policies; there is no table that
  relies solely on the application "remembering" to filter by user.
- The Supabase **service-role key** (which bypasses RLS) is never exposed to the
  client and is used only in trusted server-side contexts where its use is
  deliberate and justified (e.g., a specific administrative operation) — the
  default server-side client uses the same RLS-respecting path as the client where
  possible.
- Authorization logic (who can see/edit what) is expressed in terms of the
  membership/role model described in `architecture.md`, and changes to it are
  treated as security-sensitive changes requiring careful review.

## Data Protection

- All traffic is served over HTTPS (enforced by Vercel by default).
- Data at rest is encrypted by Supabase's managed Postgres infrastructure; no
  additional application-level encryption is required for standard fields, but
  particularly sensitive fields (if any emerge, e.g., external account numbers) are
  evaluated for column-level encryption on a case-by-case basis.
- Backups are enabled on the Supabase project, with restore procedures documented
  and periodically tested (see `deployment-strategy.md`).
- Production and development/staging use **separate Supabase projects** — synthetic
  or anonymized data only in non-production environments; real financial data never
  flows into a development database.

## Secrets Management

- Secrets (Supabase service-role key, API keys for third-party services) are stored
  only in Vercel's environment variable configuration (scoped per environment:
  development/preview/production) and in local `.env.local` files that are
  git-ignored and never committed.
- No secret is ever logged, included in error messages surfaced to the client, or
  committed to the repository — including in commit history. A secret-scanning
  pre-commit hook or CI check is adopted once the repository is initialized.
- Secrets are rotated immediately if there is any suspicion of exposure, and
  periodically as routine hygiene.

## Input Handling

- Every external input is validated at the boundary with Zod (see
  `coding-standards.md`) before it reaches domain logic or the database.
- Parameterized queries only — the Supabase client library handles this by default;
  no raw string-concatenated SQL is introduced.
- File uploads (Supabase Storage) are restricted by type/size and are never
  executed or interpreted as code.

## Auditability

- **Revised from the original Phase 4 framing:** an immutable audit trail is built
  from Phase 1 (`development-roadmap.md`), not deferred to multi-user. Even a
  single user benefits from a trustworthy record of what changed and when, and
  retrofitting auditability after real financial data exists is materially more
  expensive than building it alongside the domain scaffolding. The full design —
  record shape, database-enforced immutability, event-driven capture, retention,
  and querying — is specified in **`audit-strategy.md`** (ADR 0008); this section
  states the principle, that document is authoritative on the mechanism.
- Authentication events (login, failed login, password reset) are retained via
  Supabase Auth's logs and mirrored into the same audit log for a unified query
  surface.

## Dependency & Supply Chain Hygiene

- Dependencies are kept current, with security advisories monitored (e.g., via
  `pnpm audit` or GitHub Dependabot alerts once the repository is on GitHub).
- New dependencies are vetted for maintenance status and necessity before being
  added, per `coding-standards.md`.

## Least Privilege

- Application components request the minimum access they need: the browser client
  uses Supabase's `anon` key plus RLS, never the service-role key.
- Any future third-party integration (e.g., a brokerage API) is scoped to
  read-only/minimum-necessary permissions unless a specific feature requires more.

## Incident Response (Lightweight, Given Scale)

- Error tracking (Sentry) provides visibility into unexpected failures, including
  authorization errors, so anomalies are noticed rather than silently occurring.
- In the event of suspected credential compromise: rotate affected secrets/keys
  immediately, review Supabase Auth logs for the affected account, and force a
  session invalidation for that user.

## Review Cadence

- Security posture is explicitly reviewed at the end of each roadmap phase (see
  `development-roadmap.md`, with a dedicated pass in Phase 7 — Hardening &
  Polish), with particular attention to RLS policy correctness whenever the
  schema or membership model changes.
