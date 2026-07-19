# Threat Model

## Approach

This uses a **practical, asset-centric threat model** rather than a full
STRIDE-per-data-flow-diagram exercise: for a single-developer-maintained private
application at this stage, enumerating every threat against every element of
`data-flow.md` would produce more paperwork than security value. Instead, each
threat below is evaluated directly against the asset it endangers, in the same
structure — asset at risk, threat scenario, existing/planned control, residual
risk, required validation — so the model stays a living, checkable document
rather than a one-time exercise. See ADR 0017 for why this approach was chosen
over a heavier framework.

This document is reviewed and extended at the end of every roadmap phase
(`development-roadmap.md`), and immediately whenever a new external integration
or data category is introduced — not on a fixed calendar cadence.

**Control status key:** ✅ Implemented (Foundation) · 🔜 Planned (documented,
not yet built) · 🧭 Design-level only (mitigated by architecture, not a specific
control)

---

## 1. Unauthorised Account Access

- **Asset at risk:** the user's entire financial data set.
- **Threat scenario:** an attacker obtains or guesses credentials and signs in as
  the legitimate user.
- **Control:** Supabase Auth handles credential verification (`security-principles.md`);
  no public sign-up in the Foundation UI ✅; MFA available (not yet enforced) 🔜;
  generic authentication error messages (no user-enumeration signal) ✅.
- **Residual risk:** password-based auth remains vulnerable to weak user password
  choice until MFA is enforced.
- **Required validation:** confirm sign-up route is genuinely inaccessible in
  production build; confirm error messages don't leak account existence
  (`testing-foundation`).

## 2. Session Theft

- **Asset at risk:** an authenticated session, usable to impersonate the user
  without knowing their password.
- **Threat scenario:** session cookie exfiltrated via XSS, network interception,
  or a shared/compromised device.
- **Control:** httpOnly, secure, SameSite cookies via `@supabase/ssr`'s standard
  handling ✅; HTTPS enforced by Vercel ✅; short-lived access tokens with refresh
  rotation (Supabase default) ✅.
- **Residual risk:** a successful XSS (see §4) could still exfiltrate a session
  indirectly via an authenticated fetch even with httpOnly cookies; device-level
  compromise is outside this system's control.
- **Required validation:** verify cookie flags in a real response (not assumed
  from library defaults) as part of the Foundation validation pass.

## 3. Credential Stuffing

- **Asset at risk:** user account, via reused/leaked password lists.
- **Threat scenario:** automated repeated sign-in attempts using breached
  credential lists.
- **Control:** Supabase Auth's built-in rate limiting on auth endpoints ✅
  (vendor-managed); application-level rate limiting on the sign-in route is
  designed but not backed by infrastructure this phase (`security-foundation`,
  §21) 🔜.
- **Residual risk:** until application-level rate limiting is implemented, the
  system relies entirely on Supabase's vendor-side throttling.
- **Required validation:** document Supabase's current rate-limit behaviour;
  revisit once dedicated rate limiting ships.

## 4. Cross-Site Scripting (XSS)

- **Asset at risk:** session integrity, ability to act as the user in-browser.
- **Threat scenario:** attacker-controlled content (e.g., a research note, a
  future AI response) is rendered as executable HTML/script.
- **Control:** React's default escaping of rendered content ✅; no use of
  `dangerouslySetInnerHTML` in Foundation code ✅; Content-Security-Policy header
  restricting script sources ✅ (`security-foundation`).
- **Residual risk:** any future feature introducing rich-text rendering (e.g.,
  formatted research notes) must be revisited specifically for safe rendering —
  flagged for Phase 4/8 design, not resolved here.
- **Required validation:** CSP header presence checked in the Foundation
  validation pass; a lint rule / code-review checklist item against
  `dangerouslySetInnerHTML` going forward.

## 5. Cross-Site Request Forgery (CSRF)

- **Asset at risk:** ability to trigger state-changing actions (settings
  changes, future transactions) without the user's intent.
- **Threat scenario:** a malicious site causes the user's browser to submit a
  request to this application using their existing session.
- **Control:** Next.js Server Actions include built-in CSRF protection (origin
  checking) for mutations ✅; cookies are `SameSite=Lax` by default via Supabase's
  SSR helpers ✅.
- **Residual risk:** low, given Server Actions are the primary mutation path in
  Foundation; any future Route Handler accepting state-changing `POST` requests
  from a form must be individually reviewed for equivalent protection.
- **Required validation:** confirm Server Action origin-checking is active
  (framework default, verified not assumed) as part of the Foundation validation
  pass.

## 6. Injection Attacks (SQL, etc.)

- **Asset at risk:** database integrity and confidentiality.
- **Threat scenario:** unsanitized input reaches a raw SQL query.
- **Control:** Supabase client library uses parameterized queries throughout ✅;
  no raw string-concatenated SQL in application code ✅; Zod validation at every
  external input boundary ✅ (`coding-standards.md`).
- **Residual risk:** low, contingent on this discipline holding as the codebase
  grows — a future contributor introducing raw SQL would reopen this.
- **Required validation:** code-review checklist item (`engineering-standards.md`);
  no automated SQL-injection scanner in Foundation scope.

## 7. Insecure Direct Object References (IDOR)

- **Asset at risk:** any user-scoped record (settings, audit events, and every
  future financial record).
- **Threat scenario:** a user manipulates a record ID in a request to access
  another user's data.
- **Control:** Row-Level Security enforced at the database layer for every
  user-scoped table, independent of application-layer ID handling ✅
  (`security-principles.md`) — this is the primary control, specifically because
  it holds even if application code has an IDOR-shaped bug.
- **Residual risk:** low for RLS-covered tables; any future table that omits RLS
  (by mistake) reopens this — mitigated by the stated policy that no user-scoped
  table ships without RLS (`database-design.md`).
- **Required validation:** every new table's RLS policy includes a negative test
  (an unauthorized user cannot access it) before being considered complete
  (`database-design.md`); Foundation tables (`profiles`, `user_settings`,
  `audit_events`) are verified this way.

## 8. Row-Level Security Failures

- **Asset at risk:** all user-owned data, if RLS is misconfigured or bypassed.
- **Threat scenario:** a policy is missing, too permissive, or an operation
  inadvertently uses a privilege that bypasses RLS (service-role key).
- **Control:** RLS enabled by default on every user-scoped table ✅; explicit
  per-operation policies (not one broad policy) ✅; service-role key usage
  confined to the narrowest possible set of operations and never exposed to the
  browser ✅ (`provider-architecture.md`'s `AuthenticationProvider` notes).
- **Residual risk:** RLS policy logic errors are a real, non-zero risk class —
  policies are code and can have bugs like any other code.
- **Required validation:** negative-path tests per table (see §7); RLS policy
  review is called out explicitly as a required part of code review for any
  schema change (`engineering-standards.md`).

## 9. Exposed Service-Role Credentials

- **Asset at risk:** complete bypass of RLS across the entire database if leaked.
- **Threat scenario:** the Supabase service-role key is accidentally included in
  client-bundled code, logged, or committed to Git.
- **Control:** service-role key never referenced in any file reachable from the
  browser bundle ✅ (verified in the Foundation validation pass, §32); a service-
  role client is not even created in Foundation unless a genuine need exists
  (`supabase-client-foundation`) — the smallest possible blast radius is the
  default; `.env.example` contains names only, never values ✅.
- **Residual risk:** human error remains possible (e.g., pasting a real key into
  a chat, commit, or log during future development) — this is the single highest-
  impact credential in the system.
- **Required validation:** secret-scanning as part of the Foundation validation
  pass (§32); recommend enabling GitHub secret scanning / push protection on the
  repository (external setup, documented separately).

## 10. Malicious Document Uploads

- **Asset at risk:** storage integrity, and any future viewer/processing
  pipeline (`document-management.md`).
- **Threat scenario:** an uploaded file contains malware, a zip bomb, or content
  crafted to exploit a document viewer/parser.
- **Control:** 🧭 design-level for now — `document-management.md` specifies
  type/size validation and that documents are never executed or rendered as
  HTML. Not yet built (document upload is out of Foundation scope entirely).
- **Residual risk:** full, until Phase 9 implementation — tracked here so it is
  designed for deliberately when that phase begins, not discovered as a gap then.
- **Required validation:** deferred to Phase 9; this entry exists to ensure the
  threat is designed against from that phase's first commit.

## 11. Supply Chain Compromise

- **Asset at risk:** the entire application, via a compromised dependency.
- **Threat scenario:** a package (direct or transitive) is compromised and
  executes malicious code at build or runtime.
- **Control:** dependencies added deliberately, not reflexively
  (`coding-standards.md`); lockfile committed, ensuring reproducible installs ✅;
  `pnpm` frozen-lockfile install in CI ✅ (`github-actions`, §26); Dependabot
  configured for update visibility 🔜.
- **Residual risk:** no runtime dependency-integrity verification (e.g., Sigstore/
  provenance checking) is in place — accepted as disproportionate tooling for
  this project's current scale.
- **Required validation:** `pnpm audit` (or equivalent) run as part of the
  Foundation validation pass and CI.

## 12. Dependency Vulnerabilities

- **Asset at risk:** any part of the system relying on a vulnerable package
  version.
- **Threat scenario:** a known CVE in a dependency is exploitable in this
  application's usage of it.
- **Control:** Dependabot alerts configured 🔜; `pnpm audit` in CI ✅; dependency
  updates reviewed, not blindly auto-merged, especially for auth/database/crypto
  packages (`coding-standards.md`).
- **Residual risk:** a zero-day in a dependency between scans is not detectable
  in advance — accepted, standard residual risk for any software project.
- **Required validation:** `pnpm audit` output reviewed as part of Foundation
  validation (§32); zero high/critical findings required to pass.

## 13. Secrets Committed to Git

- **Asset at risk:** any credential accidentally added to version control.
- **Threat scenario:** a developer commits a `.env.local` file, a hardcoded key,
  or a credential pasted into a comment.
- **Control:** `.gitignore` excludes all `.env*` files except `.env.example` ✅;
  `.env.example` contains variable names only ✅; manual review for secrets as
  part of the Foundation validation pass before any commit is proposed ✅
  (§32/§33).
- **Residual risk:** no automated pre-commit secret-scanning hook is configured
  yet — reviewed manually this phase; recommended as a near-term follow-up.
- **Required validation:** explicit grep-based review for credential-shaped
  strings before every proposed commit in this milestone.

## 14. Excessive Logging of Financial Data

- **Asset at risk:** confidentiality of holdings/transactions/cash values, if
  logged in plaintext to a system with weaker access control than the primary
  database.
- **Threat scenario:** a developer logs a full request/response payload
  containing financial figures for debugging, and it persists in log
  infrastructure indefinitely.
- **Control:** structured logging uses an explicit allow-list of loggable fields
  per event, not a deny-list ✅ (`data-classification.md`, `engineering-standards.md`);
  audit records are separately sanitized at the handler level ✅.
- **Residual risk:** relies on the allow-list discipline being followed for every
  new log call — a code-review responsibility, not a technical guarantee in
  Foundation.
- **Required validation:** log output reviewed manually for the Foundation
  routes implemented (auth, settings) as part of validation (§32).

## 15. AI Prompt Injection Through Imported Content

- **Asset at risk:** integrity of future AI-generated recommendations/briefings,
  if attacker-controlled content (e.g., a malicious research document or market
  data field) manipulates an AI prompt's behaviour.
- **Threat scenario:** imported text (a document, a vendor field) contains
  instructions designed to hijack an `AIProvider` call's behaviour.
- **Control:** 🧭 design-level — `decision-engine.md`'s explicit rule that AI never
  computes financial figures directly limits the damage a hijacked prompt can do
  (it can produce misleading narrative, never a fabricated balance); no AI
  feature exists in Foundation scope, so no live exposure yet.
- **Residual risk:** full, deferred to Phase 6/10 design — tracked here so
  prompt-construction code is written defensively (e.g., clear separation of
  system instructions from untrusted content) from its first implementation.
- **Required validation:** deferred; required before any AI feature ships.

## 16. AI Data Leakage

- **Asset at risk:** Confidential financial/personal data, if sent to a
  third-party AI vendor inappropriately.
- **Threat scenario:** portfolio or personal data is included in a prompt sent to
  an external AI provider without the user's awareness/consent.
- **Control:** explicit Foundation-phase constraint — **no portfolio or personal
  data is sent to any AI provider during this milestone**, because no AI feature
  exists yet ✅; `data-classification.md` classifies AI prompts/responses as
  Confidential in advance, so future AI features are designed against this
  constraint from day one, not retrofitted.
- **Residual risk:** deferred to Phase 6/10 — the constraint exists now
  specifically to prevent this risk from being discovered late.
- **Required validation:** deferred; a specific design review is required before
  any AI feature that transmits user data ships.

## 17. Market Data Manipulation or Stale Data

- **Asset at risk:** correctness of any recommendation or alert based on price
  data.
- **Threat scenario:** a market data vendor returns manipulated, delayed, or
  stale data, and the system acts on it as current.
- **Control:** 🧭 design-level — every stored price retains `sourceTimestamp`
  (`data-flow.md` §4); a "market data is stale" rule is explicitly catalogued
  (`rules-engine.md`) to detect this; no market data integration exists in
  Foundation scope.
- **Residual risk:** full, deferred to Phase 3 — tracked here to ensure staleness
  handling is not an afterthought when that phase begins.
- **Required validation:** deferred to Phase 3 implementation.

## 18. Incorrect Financial Calculations

- **Asset at risk:** trust in the entire system — the core risk this application
  exists to avoid (`vision.md`).
- **Threat scenario:** a bug in valuation/performance calculation produces a
  wrong figure the user relies on for a real decision.
- **Control:** 🧭 design-level — money handled via `numeric`/decimal types, never
  floating point (`database-design.md`); domain calculation logic requires unit
  test coverage as a condition of merging (`engineering-standards.md`); AI never
  performs authoritative financial calculations (`decision-engine.md`). No
  calculation logic exists yet in Foundation scope.
- **Residual risk:** full, deferred to Phase 4 — the highest-consequence risk in
  the entire system, which is why the controls above are stated as hard
  requirements rather than guidelines.
- **Required validation:** deferred to Phase 4; will require the highest test-
  coverage bar in the codebase when implemented.

## 19. Audit Log Tampering

- **Asset at risk:** the integrity of the system's own accountability record.
- **Threat scenario:** an attacker (or a bug) modifies or deletes audit records
  to hide unauthorized activity.
- **Control:** `audit_events` is append-only, enforced by RLS/policy denying
  `UPDATE`/`DELETE` for all roles including the service role ✅ (`audit-strategy.md`,
  ADR 0008) — implemented as part of Foundation, see §15/§17.
- **Residual risk:** a sufficiently privileged direct-database-console action
  (outside the application entirely, e.g., via the Supabase dashboard with
  project owner access) could still alter data — this is a platform-level trust
  boundary accepted as inherent to using a managed database, mitigated only by
  restricting who holds that platform access.
- **Required validation:** a negative test confirming `UPDATE`/`DELETE` on
  `audit_events` is rejected, included in the Foundation test suite.

## 20. Backup Exposure

- **Asset at risk:** the same data as the live database, via a less-protected
  copy.
- **Threat scenario:** a backup is stored or accessed with weaker controls than
  production, or retained longer than necessary in an unmonitored location.
- **Control:** 🧭 design-level — `deployment-strategy.md`'s backup/recovery
  section specifies backups inherit production-equivalent access control and
  explicitly includes `audit_events` in backup scope; no paid backup
  functionality is enabled during Foundation (per explicit instruction) — current
  reliance is on Supabase's platform-managed backups.
- **Residual risk:** full evaluation of Supabase's backup access model is
  deferred until a paid backup tier is actually configured (a future,
  explicitly-approved action, not part of this milestone).
- **Required validation:** deferred; revisit when backup configuration moves
  beyond documentation.

## 21. Administrative Misuse

- **Asset at risk:** any data reachable by the Owner/operator role, if that
  access is used inappropriately (relevant even to a single-user system, since
  the "administrator" and "user" are the same person today, and will diverge
  post multi-user).
- **Threat scenario:** post multi-user, an Owner views or modifies another
  household member's data beyond what their stated role should allow, or a
  future admin capability (e.g., feature flag toggling, §19) is misused.
- **Control:** 🧭 design-level — role model (Owner/Editor/Viewer) defined
  (`product-specification.md`); every settings/flag change is audited
  (`audit-strategy.md`) specifically so administrative actions are visible after
  the fact, not just prevented in advance.
- **Residual risk:** full prevention isn't the goal for a system's own Owner
  role (an Owner necessarily has broad access) — the control is _visibility_
  (audit trail), not restriction, which is an accepted, deliberate design choice
  for this system's scale.
- **Required validation:** confirm settings changes produce correct audit
  records (Foundation test suite); role-scoped access control tested when
  multi-user ships (Phase 6/multi-user roadmap phase).

---

## Summary of Foundation-Phase Coverage

Of the 21 threats above, **9 have concrete, implemented controls in this
milestone** (§1, 2, 4, 5, 6, 7, 8, 9, 19 — auth, session, XSS, CSRF, injection,
IDOR, RLS, service-role handling, audit immutability), reflecting that these are
the threats actually reachable by Foundation-scope functionality
(authentication, settings, audit). The remaining threats are either
**design-level mitigations already reflected in the approved architecture**
(§10, 15, 16, 17, 18, 20, 21) or **fully deferred with no current exposure**
because the feature they concern does not exist yet. This split is intentional
and is the reason this document is revisited every phase — a threat marked
deferred here must be re-evaluated with a concrete control the moment its
feature is built, not left permanently as "planned."
