# Domain-Driven Design

## Why DDD, and Why Now

The original architecture (`architecture.md`, Phase 0) proposed a flat split between
`app/` and a single `lib/` or `domain/` folder. That was adequate for a system with
one concern (portfolio CRUD). It stops being adequate the moment the domain grows to
include trading, market data, analytics, research, AI-generated content, alerts, and
documents — each with its own vocabulary, its own rules, and its own rate of change.
Without an explicit boundary between them, a "domain" folder becomes a junk drawer:
research logic ends up importing portfolio internals because they happen to sit in
the same directory, and a change to one silently breaks another.

Domain-Driven Design is adopted specifically to prevent that. It is not adopted for
its own sake — a project this size does not need the full weight of DDD tactical
patterns (specifications, factories, repositories-as-a-pattern-for-everything). What
is adopted is the part of DDD that earns its cost here: **explicit bounded contexts,
a domain layer with zero framework dependencies, and dependency inversion at the
infrastructure boundary.**

## Bounded Contexts

Each subfolder under `domain/` is a bounded context: a self-contained area of the
business with its own model, its own language, and a deliberately narrow, explicit
interface to every other context. A bounded context does not reach into another
context's internals — it depends only on that context's public exports (types and
functions intended for external use) or communicates via the event system
(`event-system.md`).

| Context     | Responsibility                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `portfolio` | Portfolios, accounts, holdings/positions, cost basis                                                                         |
| `trading`   | Transactions (buys, sells, transfers, dividends, fees) — the ledger                                                          |
| `market`    | Market data: prices, instruments/assets, reference data                                                                      |
| `analytics` | Performance, valuation, allocation, and risk calculations derived from `portfolio`/`trading`/`market`                        |
| `research`  | Investment theses, notes, review history (see `research-workspace.md`)                                                       |
| `ai`        | AI-generated content: briefs, summaries, opportunity generation — orchestrates `AIProvider` (see `provider-architecture.md`) |
| `alerts`    | Alert rules, alert generation, dismissal state                                                                               |
| `documents` | Document metadata, tagging, versioning, relationships to other contexts (see `document-management.md`)                       |
| `settings`  | The centralised settings engine (see `settings-engine.md`)                                                                   |
| `audit`     | The immutable audit log (see `audit-strategy.md`)                                                                            |

`settings` and `audit` are not "features" bolted on the side — they are bounded
contexts in their own right, because they have their own model (an audit record is
not a portfolio record) and their own invariants (an audit record, once written, is
never mutated). Treating them as first-class contexts from the start avoids the
common mistake of scattering `if (auditEnabled)` checks through unrelated code.

## Folder Structure

```
src/
  app/                       Next.js App Router — routes, layouts, pages only.
                              No business logic. Composes domain + infrastructure.
  components/                Shared, presentational UI components. Domain-agnostic
                              where possible (a Button doesn't know what a Portfolio is).

  domain/
    portfolio/
      model.ts                Entities, value objects (Portfolio, Account, Holding)
      service.ts               Domain services (pure business operations)
      repository.ts             Interface only — e.g. PortfolioRepository
      events.ts                 Domain events this context raises
      index.ts                  Public exports — the context's only legal surface
    trading/
    market/
    analytics/
    research/
    ai/
    alerts/
    documents/
    settings/
    audit/

  infrastructure/
    database/                  Supabase/Postgres implementations of repository
                                interfaces defined in domain/*/repository.ts
    auth/                      AuthenticationProvider implementation(s)
    ai/                        AIProvider implementations (OpenAI, Anthropic, Gemini)
    market-data/                MarketDataProvider implementations
    storage/                   StorageProvider implementations
    notifications/              NotificationProvider implementations
    events/                    The event bus implementation (event-system.md)

  lib/                        Generic, domain-agnostic utilities (date formatting,
                              money/decimal helpers, id generation). If it needs to
                              know what a "Holding" is, it does not belong in lib/.
  hooks/                      Shared React hooks (client-side), UI-facing only.
  types/                      Cross-cutting shared types only — most types live with
                              their owning domain context, not here.
```

## Dependency Rule

Dependencies point in one direction only:

```
app/  ──depends on──▶  domain/  ◀──implements interfaces from──  infrastructure/
components/, hooks/  ──depends on──▶  domain/ (types only) and app/ (via props)
```

- `domain/*` never imports from `app/`, `infrastructure/`, `components/`, or
  Next.js itself. A domain module should be importable and testable in a plain
  Node/Vitest process with no framework running. This is the single rule that most
  protects long-term maintainability: business logic that cannot accidentally
  couple itself to a web framework, a specific database, or a specific AI vendor.
- `infrastructure/*` implements interfaces _defined by_ `domain/*` (e.g.,
  `domain/portfolio/repository.ts` defines `PortfolioRepository`;
  `infrastructure/database/portfolio-repository.ts` implements it against
  Supabase). This is dependency inversion (see `engineering-standards.md`) applied
  concretely: the domain defines the contract, infrastructure fulfills it — not the
  other way around.
- `app/*` is composition. Route handlers, Server Components, and Server Actions
  wire a concrete `infrastructure/*` implementation to a `domain/*` service and
  call it. `app/*` contains no business rules of its own.
- Cross-context communication happens through (a) a context's public `index.ts`
  exports for direct, synchronous needs (e.g., `analytics` reading `portfolio`'s
  public types), or (b) the internal event system for reactive, decoupled needs
  (e.g., `alerts` reacting to a `PriceUpdated` event without `market` knowing
  `alerts` exists). Rule of thumb: if context A needs to _ask_ context B for
  something, use a direct call to B's public interface; if context A needs to
  _react_ when something happens in B, use an event.

## Aggregates

Within each context, one entity is the aggregate root — the only entity external
code is allowed to load, modify, or hold a reference to. Changes to entities inside
the aggregate happen only through the root, which is what keeps invariants (e.g., "a
transaction cannot leave a position with negative quantity for an asset that
disallows short positions") enforceable in one place instead of scattered across
every call site that happens to touch the data.

| Context   | Aggregate Root | Notes                                                                 |
| --------- | -------------- | --------------------------------------------------------------------- |
| portfolio | `Portfolio`    | Owns `Account` and `Holding` entities                                 |
| trading   | `Transaction`  | Immutable once created (append-only ledger, see `database-design.md`) |
| research  | `ResearchNote` | Owns thesis sections and review history entries                       |
| documents | `Document`     | Owns version history                                                  |
| alerts    | `Alert`        |                                                                       |

Contexts without a clear multi-entity cluster (`market`, `analytics`, `settings`,
`ai`) are effectively single-entity or stateless/derived and do not need a formal
aggregate — imposing one would be DDD for its own sake, which this project
explicitly avoids (see YAGNI in `engineering-standards.md`).

## What This Buys Us, Concretely

- **Testability:** every domain service is testable with plain unit tests — no
  database, no HTTP server, no mocked Next.js runtime.
- **Replaceability:** swapping Supabase for another Postgres host, or OpenAI for
  Anthropic, touches `infrastructure/` only. `domain/` is untouched. This is the
  same guarantee the plugin architecture formalizes for providers specifically
  (`provider-architecture.md`).
- **Comprehensibility at scale:** a new contributor (or an AI coding agent) working
  on `research` can understand that context fully without first understanding
  `trading` or `alerts`. The blast radius of a change is legible from the folder
  it's in.
- **Honest boundaries prevent silent coupling.** The most common way monoliths rot
  is not a single bad decision — it's a thousand small "I'll just import that one
  helper from the other module" decisions. The dependency rule above makes that
  specific shortcut structurally awkward to take by accident.

## What This Does Not Mean

- It does not mean a separate database schema or microservice per context. All
  contexts share one PostgreSQL database (`database-design.md`); the boundary is in
  the code, not the infrastructure. Splitting the database is a future option, not
  a current requirement, and nothing here should be read as a mandate to do so.
- It does not mean every context needs identical internal structure. `market` (a
  read-mostly, externally-sourced context) will naturally look different from
  `trading` (a write-heavy, invariant-enforcing ledger). The folder skeleton above
  is a default, not a template to fill in uniformly regardless of fit.
