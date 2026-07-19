# Feature Flag Framework

> **Implementation status: Partially implemented.** A static, local, typed
> registry (`src/domain/settings/feature-flags.ts`) is **Implemented**, with
> `investmentOffice` on and every other flag off — not the database-backed
> registry with per-user overrides described below, which is **Planned**
> (no genuine need for overrides exists yet with one user). See
> `docs/implementation/foundation.md`.

## Purpose

This system will grow modules (AI Briefing, Research Workspace, Document
Repository, Broker Integration, Property Module, Family Office, Tax Planning,
Portfolio Sharing, Commercial Features) at different rates, some of them
experimental or half-built at any given time. Feature flags let incomplete or
in-progress work merge to `main` continuously (per `deployment-strategy.md`'s
continuous-deployment approach) without being visible or usable until it is ready
— decoupling _deploy_ from _release_.

## Design Principle

This is a private application with a small user base, not a commercial SaaS
product. A third-party flag service (LaunchDarkly, Split, etc.) would add an
external dependency, cost, and network call for a problem this system's scale does
not require. Per YAGNI (`engineering-standards.md`), the default is a **simple,
database-backed flag registry**, wrapped behind a `FeatureFlagProvider` interface
(consistent with `provider-architecture.md`'s pattern) so that a third-party
service remains a drop-in future option if the flag needs ever become genuinely
complex (e.g., percentage rollouts across thousands of users) — which is not
anticipated, but the seam costs little to leave in place.

```ts
interface FeatureFlagProvider {
  isEnabled(flag: FeatureFlagKey, context: FlagContext): Promise<boolean>;
  getAllFlags(context: FlagContext): Promise<Record<FeatureFlagKey, boolean>>;
}
```

`FlagContext` carries the current user id (and, post multi-user, household/role),
so a flag can be scoped globally, per-user, or per-role without changing the
interface.

## Flag Registry

Flags are declared centrally in `domain/settings/feature-flags.ts` as a typed
enum/const — never as ad hoc string literals scattered through the codebase. This
means an unused or misspelled flag key is a compile-time error, and the full set of
flags in the system is always visible in one file.

```ts
const FEATURE_FLAGS = {
  AI_BRIEFING: "ai_briefing",
  RESEARCH_WORKSPACE: "research_workspace",
  DOCUMENT_REPOSITORY: "document_repository",
  BROKER_INTEGRATION: "broker_integration",
  PROPERTY_MODULE: "property_module",
  FAMILY_OFFICE: "family_office",
  TAX_PLANNING: "tax_planning",
  PORTFOLIO_SHARING: "portfolio_sharing",
  COMMERCIAL_FEATURES: "commercial_features",
} as const;
```

## Storage

A `feature_flags` table (system-level defaults) plus a `user_feature_flags`
override table (see `database-design.md` for the conceptual shape), following the
same layered-resolution model as `settings-engine.md`: a flag's effective value for
a given request is the most specific override available —
**user override → system default → hardcoded fallback in code.** The hardcoded
fallback (defined alongside the registry) ensures the application still behaves
sensibly if a flag row is ever missing, rather than crashing on an absent row.

## Evaluation

- Flags are read once per request (server-side, in the composition layer) and
  passed down explicitly to the components/services that need them — not read
  ad hoc from deep inside domain logic, which would violate the DDD dependency
  rule (`domain/*` must not reach out to a settings/flags data source directly;
  it receives flag state as an input).
- A disabled module is not merely hidden in the UI — routes for a disabled feature
  return a "not available" response server-side too, since a flag is a release
  control, not a design/security boundary on its own (real authorization still
  goes through RLS and the permission model, per `security-principles.md`).

## Flag Lifecycle

1. **Introduced** — a new module ships behind a flag, default `off`, visible only
   to the principal (or explicitly enabled testers) via a user-level override.
2. **Rolling out** — enabled progressively for more users as multi-user access
   grows (Phase 6 onward), by adding user-level overrides or flipping the system
   default.
3. **Graduated** — once a feature is stable and universally on, the flag is
   removed from the codebase entirely (call sites simplified to assume the
   feature exists) and the registry entry deleted. Flags are not left in the code
   indefinitely "just in case" — a permanent flag that is always `true` is dead
   weight and a source of confusion; this cleanup is treated as part of the
   Definition of Done for the work that graduates the flag (`engineering-standards.md`).
4. **Killed** — if a feature needs to be pulled back (a bug, a vendor issue), the
   system default flips to `off` without a deploy, which is the main operational
   value flags provide beyond release gating.

## Management

- In this phase, flags are managed via direct database updates (through
  Supabase's dashboard, or a simple internal admin screen — see
  `product-specification.md`'s Settings – Feature Flags screen) rather than a
  bespoke admin tool, consistent with keeping operational surface area small for a
  small team.
- Every flag change is captured as a `SettingsChanged` event and produces an audit
  record (`audit-strategy.md`), since enabling a commercial or financial-behavior
  module (e.g., Broker Integration) is a meaningful, traceable action.

## Relationship to Settings and Providers

Feature flags answer "is this module visible/usable at all." Provider selection
(`provider-architecture.md`) and configuration values (`settings-engine.md`)
answer "how does an enabled module behave." They are deliberately kept as separate
concepts — a feature can be enabled while still misconfigured (e.g., Research
Workspace enabled but no AI provider configured for its AI Summary section), and
the UI is expected to handle that distinction gracefully (feature visible, specific
capability degraded) rather than conflating the two.
