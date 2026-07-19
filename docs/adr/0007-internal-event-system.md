# 0007. Internal Application Event System

**Status:** Accepted

## Context

Actions in one bounded context frequently need to trigger effects in others (a
transaction affecting portfolio valuation, alerts, and the audit log) without those
contexts calling each other directly, which would violate the bounded-context
isolation established in ADR 0005. The application also runs on Vercel's stateless
serverless model (ADR 0004), which rules out a naive in-memory pub/sub bus that
assumes a long-lived process.

## Decision

Adopt an internal, two-tier event system, detailed in `event-system.md`: an
in-process synchronous dispatcher for effects needed before a request's response
returns, and a transactional-outbox-plus-polling-job pattern for effects that can
be deferred across requests. No external message broker (Kafka, RabbitMQ, etc.) is
introduced.

## Consequences

- Contexts remain decoupled: `trading` raises `TransactionCreated` without knowing
  `analytics`, `alerts`, or `audit` exist.
- The audit log (ADR 0008) becomes a natural subscriber rather than a manually
  invoked step at every call site, reducing the chance of a missed audit record.
- The outbox tier adds a real operational component (a scheduled polling job) and
  at-least-once delivery semantics, which requires outbox handlers to be
  idempotent — an explicit, non-optional design constraint on any handler using
  that tier.
- Deferred effects are bounded by the poll interval, not instant — acceptable for
  the listed use cases (notifications, AI brief generation), which are not
  latency-critical.

## Alternatives Considered

- **Direct cross-context function calls** — rejected: reintroduces the coupling
  this system is designed to avoid.
- **A managed message queue (e.g., Kafka, RabbitMQ, SQS)** — explicitly rejected
  per project direction and on merits: disproportionate operational overhead for
  this system's scale and a single-database application.
- **Naive in-memory `EventEmitter` shared across requests** — rejected: would
  silently fail on Vercel's serverless model, where no guarantee exists that two
  requests share a process.

## Future Review Criteria

Revisit the outbox polling approach if event volume or latency requirements
outgrow a polling model (e.g., a genuine need for sub-second cross-context
reaction time) — at that point, a push-based mechanism (e.g., Supabase Realtime on
the outbox table) is the natural next step, still without introducing external
broker infrastructure.
