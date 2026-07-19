# Settings Engine

> **Implementation status: Partially implemented.** The Foundation-scope
> subset (currency, time zone, appearance, the two income targets) is
> **Implemented** as a flat per-user model (`src/domain/settings/`,
> `user_settings` table) — not the full layered
> user/household/system/hardcoded resolution chain described below, which
> remains **Planned** until a second user exists to differ from the first.
> See `docs/implementation/foundation.md`.

## Purpose

Configuration for this system spans display preferences (currency, timezone,
theme), financial preferences (income targets, risk preferences), operational
choices (which AI/market-data provider is active), and release control (feature
flags). Without a single, deliberate design, these accumulate as scattered
`localStorage` reads, environment variables, and one-off table columns — each with
different override rules and no consistent way to reason about "what value is
actually in effect for this user right now." The settings engine exists to make
that question always have one clear answer.

## Design

### Layered resolution

Every setting resolves through the same precedence chain, evaluated in order:

```
1. User-level override      (most specific — a single user's explicit choice)
2. Household/org-level default   (post multi-user; e.g., a shared household currency)
3. System-level default      (operator-configured, applies to all users)
4. Hardcoded application default  (in code — guarantees a value always exists)
```

This mirrors `feature-flags.md`'s resolution model deliberately — flags are, in
effect, a boolean-typed subset of settings, and reusing one mental model for both
reduces the number of concepts a contributor has to hold at once.

### Schema-driven, not stringly-typed

Every setting is declared once, centrally, with a Zod schema defining its type,
default, and valid range/options — never read as a raw untyped string from the
database:

```ts
const SETTINGS_SCHEMA = {
  currency: z.enum(["GBP", "USD", "EUR"]).default("GBP"),
  timeZone: z.string().default("Europe/London"),
  dashboardLayout: DashboardLayoutSchema.default(DEFAULT_DASHBOARD_LAYOUT),
  incomeTargets: IncomeTargetsSchema.optional(),
  riskPreferences: RiskPreferencesSchema.optional(),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  notificationPreferences: NotificationPreferencesSchema.default(DEFAULT_NOTIFICATION_PREFS),
  aiProvider: z.enum(["openai", "anthropic", "gemini"]).default("anthropic"),
  marketDataProvider: z.enum(["alpha_vantage", "polygon", "twelve_data", "yahoo_finance"]),
} satisfies Record<string, ZodType>;
```

New settings (for future modules — Property Module, Tax Planning, etc.) are added
by extending this schema, which is also what makes "Future Modules" a first-class,
anticipated case rather than a special one: a module's settings namespace is just
another key in the same schema, resolved through the same chain, surfaced through
the same UI pattern (`product-specification.md`'s Settings screens).

### Access pattern

- **Server-side:** a `SettingsService` (in `domain/settings/`) resolves settings
  per-request, given the authenticated user, and is the only path other domain
  code uses to read configuration — no context reaches into the `settings` table
  directly, for the same dependency-direction reason established in
  `domain-driven-design.md`.
- **Client-side:** resolved settings relevant to the UI (theme, dashboard layout,
  currency/locale formatting) are provided via a React context populated once per
  page load from the server-resolved values — avoiding a client-side waterfall of
  settings fetches, and avoiding divergence between what the server rendered and
  what the client displays.

### Writing settings

Settings are updated through a single `updateSetting`/`updateSettings` service
method, never a direct table write from a route handler — this is what allows
every settings change to validate against the schema, emit a `SettingsChanged`
event (`event-system.md`), and produce an audit record (`audit-strategy.md`)
uniformly, regardless of which specific setting changed.

## Covered Configuration Domains (Current)

| Setting                  | Scope levels available        | Notes                                                                                               |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Currency                 | user, household, system       | Drives display formatting across the app                                                            |
| Time Zone                | user                          | Drives date/time display and report period boundaries                                               |
| Dashboard Layout         | user                          | Widget arrangement, persisted per user                                                              |
| Income Targets           | user, household               | Used by `analytics`/`alerts`                                                                        |
| Risk Preferences         | user, household               | Used by `analytics`/`ai` opportunity generation                                                     |
| Theme                    | user                          | Light/dark/system                                                                                   |
| Notification Preferences | user                          | Channel choices, consumed by `NotificationProvider` selection                                       |
| AI Provider              | system (user override future) | Consumed by provider composition (`provider-architecture.md`)                                       |
| Market Data Provider     | system                        | Consumed by provider composition                                                                    |
| Feature Flags            | user, system                  | See `feature-flags.md` — modeled as boolean-typed settings                                          |
| Future Modules           | (extends schema per module)   | Property Module, Tax Planning, Family Office settings namespace, added when those modules are built |

## Why a Household/Org Scope Exists Before Multi-User Ships

`architecture.md`'s multi-user evolution path establishes that ownership is
modeled from day one even in the single-user phase, specifically to avoid a schema
rewrite later. The settings engine follows the same discipline: the resolution
chain includes a household/org level now, even though only the system and user
levels are populated in Phase 1–2. When multi-user ships, "shared household
currency" becomes a matter of writing to an existing scope level, not inventing
one.

## Non-Goals

- Not a general-purpose config/experimentation platform. There is no A/B testing
  mechanism here — that would be solving a problem this application does not have
  (see YAGNI, `engineering-standards.md`).
- Not a place for secrets. API keys and service credentials remain in environment
  variables per `security-principles.md` — the settings engine stores which
  provider is selected, never the credential that authenticates to it.
