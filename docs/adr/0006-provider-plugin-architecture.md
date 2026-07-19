# 0006. Provider Plugin Architecture for External Integrations

**Status:** Accepted

## Context

The system depends on multiple categories of external vendor (market data, AI,
notifications, document processing, storage, authentication), each with several
plausible providers and no certainty that today's choice remains the right one for
a multi-year project. Coupling domain logic directly to a specific vendor's SDK
would make switching vendors a rewrite rather than a swap.

## Decision

Define vendor-neutral interfaces (`MarketDataProvider`, `AIProvider`,
`NotificationProvider`, `DocumentProvider`, `StorageProvider`,
`AuthenticationProvider`) owned by the domain layer, implemented by
`infrastructure/`, and selected at composition time based on
`settings-engine.md` configuration — detailed in `provider-architecture.md`. No
implementations are built as part of this decision.

## Consequences

- Vendor selection becomes a configuration/composition concern, not a code change
  scattered through domain logic.
- Domain unit tests use lightweight fake implementations instead of mocking vendor
  HTTP APIs.
- Adds an interface layer even where a near-term vendor switch is unlikely (e.g.,
  `AuthenticationProvider`, where Supabase Auth is a firm choice per ADR 0002) —
  justified there primarily by testability rather than realistic swap likelihood,
  and explicitly noted as such to avoid over-claiming the benefit.
- Requires every provider implementation to map vendor-shaped errors/responses
  into domain-defined types at the boundary — a small but real recurring cost paid
  once per implementation, not per call site.

## Alternatives Considered

- **Direct vendor SDK calls from domain/application code** — rejected: the
  original motivation for this decision; would tie business logic to
  vendor-specific shapes throughout the codebase.
- **A generic plugin registry/marketplace pattern** — rejected as unnecessary
  abstraction; this system needs "one active implementation per interface,
  selectable via settings," not a dynamic plugin ecosystem.

## Future Review Criteria

Revisit per-interface if a specific abstraction proves to leak (i.e., the
interface doesn't actually accommodate a second real implementation without
modification) — at that point, the interface itself needs redesign, which is a
normal and expected outcome of designing an interface before more than one
implementation exists.
