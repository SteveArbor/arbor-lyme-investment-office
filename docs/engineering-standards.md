# Engineering Standards

This document states the engineering principles that govern how code is written,
reviewed, and maintained on this project, independent of any specific feature.
Where `coding-standards.md` covers concrete conventions (naming, repo layout),
this document covers the _judgment_ behind those conventions — the reasoning a
contributor (human or AI) should apply when a situation isn't explicitly covered
elsewhere.

## Design Principles

### SOLID

- **Single Responsibility** — a domain service does one thing (e.g.,
  `TransactionService` records transactions; it does not also compute portfolio
  performance). A module having more than one reason to change is a signal it
  should split.
- **Open/Closed** — the provider architecture (`provider-architecture.md`) is the
  clearest expression of this: adding a new `MarketDataProvider` never requires
  modifying `domain/market`.
- **Liskov Substitution** — any implementation of a provider interface must be
  fully substitutable for another; if `AnthropicProvider` needs special-case
  handling in calling code that `OpenAIProvider` doesn't, the interface is wrong
  and should be fixed, not worked around at the call site.
- **Interface Segregation** — provider interfaces expose only what domain code
  needs (e.g., `MarketDataProvider` does not expose vendor account-management
  methods no domain code calls).
- **Dependency Inversion** — the organizing rule of `domain-driven-design.md`:
  domain code depends on interfaces it owns; infrastructure implements them.

### DRY (Don't Repeat Yourself)

Applied to _knowledge_, not to _incidental textual similarity_. Two pieces of code
that happen to look alike but represent different business rules (e.g., a
portfolio-level validation and a research-note validation that both check "is this
string non-empty") should not be merged into one shared abstraction just because
they're similar today — that couples two unrelated concepts and will need
splitting apart again the first time either rule changes independently. Extract a
shared abstraction only when the same _rule_, not just similar code, is genuinely
duplicated.

### KISS (Keep It Simple)

The simplest design that correctly satisfies the actual requirement wins. This
project favors "boring," well-understood patterns (see `technology-stack.md`'s
framing) over clever ones. If a reviewer needs an explanation to understand why a
piece of code is structured the way it is, that is a signal to simplify, not a
signal to add a comment explaining the cleverness.

### YAGNI (You Aren't Gonna Need It)

Explicitly invoked throughout this documentation set — the event system rejects a
message broker, feature flags reject a third-party service, document search
rejects a dedicated search engine — all for the same reason: build the thing that
solves the actual, current requirement, extend it when a real need arrives, and
prefer designs (like the provider interfaces) that make that later extension cheap
rather than trying to guess and build it now.

### Composition Over Inheritance

React composition (children, props, hooks) is preferred over class hierarchies or
deep component inheritance. Domain services compose smaller functions/services
rather than extending base classes. Where variation is needed (e.g., different
provider implementations), it is expressed through interfaces and composition
(`provider-architecture.md`), not inheritance hierarchies.

### Dependency Inversion (Applied)

Restated concretely because it is the single most load-bearing principle in this
codebase's architecture: high-level modules (domain logic) must not depend on
low-level modules (a specific database client, a specific AI SDK); both depend on
abstractions the high-level module defines. Every provider interface and every
repository interface in `domain-driven-design.md` is this principle in practice.

## Security by Default

- Every new table gets Row-Level Security policies as part of its creation, not as
  a follow-up task (`security-principles.md`, `database-design.md`).
- Every external input is validated at the boundary before use (Zod).
- Secrets are never logged, never sent to the client, never committed.
- The default posture for any new capability is "deny unless explicitly
  permitted," not "allow unless a problem is found."

## Accessibility

- All interactive UI is keyboard-navigable and screen-reader compatible; the
  headless/accessible primitive libraries chosen in `technology-stack.md`
  (Radix-based) exist specifically to make this the path of least resistance
  rather than something bolted on afterward.
- Color is never the sole means of conveying information (relevant for
  gain/loss indicators, alert severity) — paired with text/iconography.
- Target WCAG 2.1 AA as the baseline for all user-facing screens
  (`product-specification.md`).

## Performance Budgets

- Server-rendered pages target a sub-1-second Time to First Byte on typical
  broadband/mobile conditions; this is achievable by default given the
  Server-Components-first approach and should be treated as a regression if a new
  page falls materially outside it.
- Client-side JavaScript per route is kept minimal by defaulting to Server
  Components (`architecture.md`) — a new Client Component boundary should have a
  specific interactivity reason, not be the default.
- Database queries backing a dashboard/list view are expected to use appropriate
  indexes (`database-design.md`) from the point they're written, not retrofitted
  after a slow-query report.

## Testing Philosophy

- Domain logic (valuation, performance calculations, aggregation, audit/event
  handlers) requires unit test coverage as a condition of merging — this is the
  highest-risk code given the financial domain (`coding-standards.md`).
- Tests assert behavior (given this input, this output/state change), not
  implementation details — a refactor that preserves behavior should not break
  tests.
- Critical user journeys (login, record a transaction, view portfolio value,
  upload a document) are covered end-to-end (Playwright).
- A bug fix includes a regression test reproducing the bug before the fix, where
  practical — proof the fix actually addresses the reported behavior.

## Error Handling

- Errors are handled at the boundary that has enough context to respond
  meaningfully — a validation error is handled where the input was validated; a
  provider error (`provider-architecture.md`'s `ProviderRateLimitError`, etc.) is
  handled where the provider was called, not re-thrown blindly up an arbitrary
  number of layers.
- No silent failure. An error is either handled meaningfully (with a clear
  user-facing message) or surfaced to error tracking (Sentry) — never swallowed.
- Domain errors are typed and specific (e.g., `InsufficientHoldingQuantityError`),
  not generic `Error` instances, so calling code can react to specific failure
  modes where it matters.

## Logging Strategy

- Structured logging (not `console.log` string concatenation) on the server, with
  consistent fields (correlation ID, actor ID, context) across all log lines —
  the same `correlationId` used by the event system (`event-system.md`) threads
  through logs, making a single user action traceable end to end.
- Logs are for operational debugging; they are not a substitute for the audit log
  (`audit-strategy.md`), which exists specifically for compliance-grade,
  immutable, queryable history. The two serve different purposes and are not
  interchangeable.
- No sensitive data (secrets, full financial account numbers if ever handled) in
  log output.

## Observability

- Error tracking (Sentry) captures unhandled exceptions client- and server-side
  from Phase 1 onward, per `deployment-strategy.md`.
- Key business events (e.g., `PortfolioCalculated` taking unexpectedly long) are
  candidates for lightweight metrics/alerting as the system matures — introduced
  when a real operational need is identified, not speculatively instrumented
  everywhere up front.

## Code Review Expectations

- Every change affecting the database schema, RLS policies, or authorization logic
  receives deliberate scrutiny against `security-principles.md` before merging —
  this is the highest-stakes category of change in the codebase.
- A reviewer should be able to understand _why_ a change was made from its
  description and commit messages, not only _what_ changed.
- Disagreements about approach are resolved by referring back to this document and
  the relevant ADR (`docs/adr/`) — architectural decisions are not
  re-litigated informally in a PR thread; if a PR reveals a decision needs
  revisiting, that becomes a new ADR.

## Git Workflow

- Feature branches off `main`; `main` is always deployable
  (`deployment-strategy.md`).
- Commits are atomic and in the imperative mood; the message explains _why_ when
  not obvious from the diff.
- No direct commits to `main` beyond trivial documentation fixes.
- Squash or preserve history per the nature of the branch — a large feature with
  meaningful incremental commits may preserve them; a branch with "fix typo" /
  "actually fix it" commits is squashed on merge.

## Definition of Done

A change is not "done" until:

1. It satisfies the stated requirement, including edge cases reasonably implied
   by it (not edge cases that cannot occur — see YAGNI).
2. It has test coverage appropriate to its risk (domain logic: unit tests;
   critical journeys: e2e).
3. It passes type-checking, linting, and all existing tests in CI.
4. It respects the dependency direction rules in `domain-driven-design.md`.
5. Any new table has RLS policies; any new significant action raises the
   appropriate domain event and is reflected in the audit catalog
   (`audit-strategy.md`) if applicable.
6. Any feature flag it introduces is registered per `feature-flags.md`, and any
   flag it graduates is removed, not left dangling.
7. Documentation affected by the change (this set, or `product-specification.md`)
   is updated in the same change — documentation drift is treated as a defect, not
   a follow-up task.
8. It has been manually exercised (not just passed automated checks) for
   user-facing changes, per this project's verification practice.
