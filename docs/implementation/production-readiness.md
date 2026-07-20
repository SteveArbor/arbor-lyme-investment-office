# Implementation Record: Phase 2.5 — Production Readiness

**Date:** 2026-07-20
**Branch:** `foundation`
**Status:** Complete. A real Supabase project exists, all 16 migrations are
live on it, the demonstration portfolio is seeded, and every objective in
the milestone brief — including the full manual click-through — was
exercised against that live project, not a stand-in.

## 1. The one step that needed you

Creating a Supabase account/project is something this project's own prior
documentation (`docs/local-supabase-strategy.md`, `docs/vercel-preparation.md`)
already established as "a personal decision," not something to do
unilaterally — restated at the start of this milestone, and correctly held
to: I have no Supabase credentials of my own. You generated a Personal
Access Token and provided it; from there the rest of this record is what
was actually done with it, live, against a real project — not a
throwaway/stand-in.

## 2. Live project provisioning (objective 1 — complete)

- Installed the Supabase CLI (`brew install supabase/tap/supabase`,
  v2.109.1).
- Authenticated (`supabase login --token`), created organization "Arbor
  Lyme Capital", and created project **arbor-lyme-capital-dev**
  (ref `uwkebdvgclsczocwlrrx`, region `us-east-1`, status
  `ACTIVE_HEALTHY`) via `supabase projects create` with a generated
  strong database password.
- Linked the repo (`supabase link`) and ran **`supabase db push`** — all
  16 migrations applied cleanly to the live project in order, no manual
  intervention. This is the real validation the earlier throwaway-Postgres
  passes were always a stand-in for.
- Retrieved the project's URL and publishable (anon) key
  (`supabase projects api-keys`) and wrote `.env.local` (gitignored,
  confirmed via `git check-ignore`).
- Created the first real user via the Auth Admin API (`POST
/auth/v1/admin/users` with the service-role key, `email_confirm: true`)
  — there is still no self-service sign-up, deliberately, per Foundation.
  Confirmed the `handle_new_user` trigger fired correctly on the **real**
  Supabase Auth service: a `profiles` row and a `user_settings` row (with
  the correct defaults — `appearance: system`, `monthly_income_target:
4000`) were both provisioned automatically, live.

This closes the one thing the prior migration re-validation pass explicitly
couldn't confirm: real Supabase Auth, the real `postgres`/pooler role
configuration, and PostgREST's actual request handling all behave as
designed.

## 3. Demonstration data (objective 2 — complete)

`supabase/seed.sql`: a "Core Growth Portfolio" — NVIDIA, Microsoft, Amazon,
Meta, Alphabet, TSMC, ASML, plus cash — with realistic, **internally
consistent** transactions, valuations, theses, decision journal entries,
and research notes for every company. "Internally consistent" isn't a
throwaway claim: every derived figure was computed with the application's
own formulas, not invented independently of them —

- **Valuations**: all 21 bear/base/bull scenario fair values and all 7
  blended fair values were computed with `calculateScenarioFairValue`/
  `calculateBlendedFairValue`'s exact formula (a Python script mirroring
  `domain/valuation/model.ts`, not hand arithmetic).
- **Decision recommendations**: quality/valuation/overall scores,
  conviction, and rating were computed with `calculateQualityScore`/
  `calculateValuationScore`/`calculateOverallScore`/
  `calculateInvestmentRating` (`domain/decision/model.ts`) from the stored
  `inputs` — NVIDIA lands on `strong_buy`, the other six on `buy`.
- **Theses**: each `overall_status` was computed by hand-applying
  `calculateOverallThesisStatus`'s confidence-weighted algorithm (deadband
  included) to the seeded statements — NVIDIA and Amazon land on
  `strengthening`, the rest on `stable`, each with at least one
  `weakening` statement.
- **Transactions/holdings**: 12 transactions (9 buys, 1 sell, 1 dividend, 1
  cash contribution) produce holdings whose quantity/average cost were
  hand-computed with `calculateWeightedAverageCost`/`calculateRealisedGain`
  (the same functions the real atomic RPCs use — ADR 0025), and the
  resulting portfolio cash (**$289,124.50** from a $600,000 opening
  balance) is the exact sum of all 12 transactions' signed amounts.
- **Journal entries**: one open entry per position, snapshotting the
  decision-time state, with a concrete, testable invalidation condition
  per company.

Applied to the **live project** via `psql` against the pooler connection
(`supabase/seed.sql`'s `-v owner_id=...` mechanism, using the real user's
UUID) and verified byte-for-byte against the hand-computed expected values
— every holding, cash figure, rating, and thesis status matched exactly.
Idempotent — re-run at the end of this milestone (see §4) to restore this
exact state after manual testing.

Figures are illustrative, not live market data — this application has no
market-data provider by design.

## 4. Manual click-through, against the live project (objective 3 — complete)

Ran `pnpm dev` against `.env.local` (the live project) and drove it with a
real Chrome browser, not a code read-through. Every objective-3 item was
exercised, several with an actual database check afterward to confirm the
write landed correctly, not just that the UI looked right:

- **Sign in** — real Supabase Auth, real session, redirect to dashboard.
- **Dashboard** — Monitoring Dashboard rendered all 7 companies with the
  exact seeded fair values, thesis statuses, and ratings.
- **Company creation** — created "Broadcom Inc." (AVGO) through the actual
  form; redirected correctly to its Overview page. This also **live-verified
  the "Not yet valued" fix from §5 below**: the fresh company correctly
  showed "Not yet valued." rather than a fabricated "Fair value: 0.00".
- **Research editing** — edited NVIDIA's business overview and saved;
  the app confirmed "Research saved. Previous version preserved in
  history."
- **Valuation workflow** — viewed NVIDIA's full bear/base/bull scenario
  form; blended fair value (273.34) and each scenario's individual fair
  value matched the seeded/computed figures exactly.
- **Portfolio updates** — portfolio detail page showed all 7 holdings with
  correct quantity/average cost/cost basis/target allocation (this is also
  where the N+1 fix from §5 was exercised live).
- **Trading workflow** — recorded a real buy (50 GOOGL @ 170) through the
  transaction form. Verified directly against the live database afterward:
  cash debited by exactly $8,500 (289124.50 → 280624.50), and the holding's
  average cost recalculated correctly server-side
  (300 @ 165.00 + 50 @ 170.00 → 350 @ **165.714286**, matching
  `calculateWeightedAverageCost`'s formula exactly) — the atomic RPC from
  the prior hardening milestone confirmed working end-to-end on real
  infrastructure, not just against a throwaway instance.
- **Decision journal** — closed NVIDIA's open journal entry through the
  actual close-entry form (sale date/reason/lessons learned); the
  cross-company `/journal` view correctly moved it from "Open positions
  (7)" to "Closed positions (1)" with the recorded reason. Also exercised
  the **error path**: attempted to sell 999,999 GOOGL shares (far more
  than the 350 held) and got a clean, specific, immediate error —
  "Holding has 350, cannot sell 999999" — confirming the `ConflictError`
  path from the hardening milestone surfaces correctly to a real user, not
  just in unit tests.
- **Monitoring Dashboard** — covered above; also re-checked after the live
  buy and journal close to confirm the dashboard reflects state changes
  immediately (no caching/staleness issue).

One real (browser-automation, not application) issue hit along the way:
native `<input type="date">` fields don't accept typed `MM/DD/YYYY` text
reliably via simulated keystrokes — worth knowing if a future automated
e2e test drives these forms; not an application defect.

**Data restored to pristine state afterward** — re-ran `supabase/seed.sql`
against the live project (idempotent by design: deletes the owner's
existing companies/portfolios first), which also cleaned up the Broadcom
test company. Final state verified directly against the database: exactly
7 companies, correct portfolio cash ($289,124.50), all 7 journal entries
open — confirmed via `psql` and a final dashboard screenshot.

## 5. Code-level UX and performance review (objectives 4 & 5 — complete)

An independent review of every page under `(protected)/**` (not a repeat
of already-known gaps), followed by fixes for the highest-impact findings,
then confirmed live in §4 above where applicable.

### Fixed

1. **No `loading.tsx` anywhere in the app** — a slow query on a direct
   load/refresh rendered a blank page with no feedback. Added a shared
   `PageSkeleton` component and `loading.tsx` for the six heaviest routes:
   dashboard, companies list, company detail (and its sub-tabs), portfolio
   list, portfolio detail, journal.
2. **The root error boundary was a dead end for protected pages** —
   `src/app/error.tsx` has no navigation, and since there was no nested
   error boundary inside `(protected)`, any error on any protected page
   took out the entire header/nav, leaving only the browser back button.
   Added `src/app/(protected)/error.tsx`: Next.js positions an
   `error.tsx`'s boundary around its segment's _page_ content, not its
   sibling `layout.tsx`, so `(protected)/layout.tsx`'s header/nav/sign-out
   now keeps rendering around a page-level error, with a "Back to
   dashboard" link. The root boundary also gained a "Start over" link for
   errors outside `(protected)`.
3. **The Company Overview page showed a fabricated "Fair value: 0.00"**
   for any company never valued — `getOrCreateValuation` correctly creates
   a real default row on first view (ADR 0024 blesses this), but that
   default has `blendedFairValue: 0`, rendered identically to a genuine $0
   valuation. Fixed: `blendedFairValue > 0` now gates whether the real
   figure or "Not yet valued." renders. **Live-verified in §4.**
4. **N+1 company lookups on the portfolio detail page** — one `getCompany`
   call per holding, while the sibling transactions page already used a
   single `listCompanies` + lookup map. Portfolio detail now matches the
   already-correct sibling pattern, and its three independent reads
   (`getPortfolio`/`listHoldings`/`listCompanies`) now run via
   `Promise.all`. **Live-verified in §4.**

### Identified, not fixed this pass (documented backlog, not overlooked)

- Validation errors collapse to one generic, unlabeled banner on every
  multi-field form (8–9 fields on rating generation/journal entry) — real,
  but fixing it well means touching the shared error-mapping pattern
  across ~10 Server Action files, a larger change than this pass's scope.
- `companies/[id]/layout.tsx` and `companies/[id]/page.tsx` both fetch the
  same company row on every Overview visit — one extra single-row,
  RLS-scoped, primary-key read. Real, but small; properly deduplicating it
  needs request-level memoization (React `cache()` through the composition
  root), a broader pattern change than this specific duplicate justifies.
- `settings-form.tsx` doesn't use the shared `form-styles.ts` tokens every
  other form does — cosmetic drift risk, not a functional bug.
- No focus management / `aria-live` announcement after a Server Action
  succeeds.
- No inline "cancel" affordance on `companies/new` or the transaction
  forms beyond the persistent top nav.

## 6. Full validation

`pnpm check` (format, lint, typecheck, 170/170 unit tests) — clean.
`pnpm build` — clean, full route table plus the new `loading.tsx`/
`error.tsx` segments. Migration validation — 16/16 applied cleanly to the
**live** project via `supabase db push` (§2). Seed data — verified
byte-for-byte against hand-computed expected values, on the live database,
twice (before and after manual testing, §3–4). Manual click-through — every
objective-3 item exercised against the live project with database-level
confirmation where it mattered (§4).

## 7. Remaining technical debt

Everything already tracked in `docs/implementation/staff-engineer-review.md`'s
Medium/Low sections and `docs/implementation/security-hardening.md`'s §10
remains open and unchanged by this milestone (two copies of the
weighted-average-cost formula, click-level idempotency, Server Action
boilerplate, no pagination on list queries, no component tests,
`proxy.ts`'s stale route matcher, CI not running e2e). Newly identified
this pass: the five items in §5's "not fixed" list.

## 8. Deployment readiness assessment

**Ready:** schema/migrations (now validated against a real live project,
not just throwaway instances), real Supabase Auth end-to-end (sign-in,
trigger-based provisioning, RLS), the financial-integrity hardening from
the prior milestone (live-tested on real infrastructure, including the
atomic RPC's server-side computation and the `ConflictError` path), code
quality gates (format/lint/typecheck/tests all enforced and clean), a
full manual click-through of every core workflow, demo data loaded and
verified.

**Not yet done, deliberately out of this milestone's scope:** a Vercel
project (`docs/vercel-preparation.md` is still preparation-only — no
project created, no staging deployment run), a custom domain, and this
milestone's own remaining backlog items (§7).

**Recommendation before public release**, in order: (1) close the
click-level idempotency gap (`docs/implementation/security-hardening.md`
§10) before any real trading activity by someone other than you;
(2) create the Vercel project and do a full staging deployment against
this same development Supabase project before ever creating a separate
production project; (3) address the per-field validation-error gap
(§5) if this will ever have more than one user, since it's the kind of
thing that's invisible until someone else hits it; (4) only then consider
this application ready for anyone other than you.
