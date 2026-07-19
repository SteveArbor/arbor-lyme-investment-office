# Internal Event System

> **Implementation status:** the **in-request tier only** is **Implemented**
> (`src/domain/shared/events.ts`, `src/infrastructure/events/in-process-event-bus.ts`),
> proven working end-to-end via the `SettingsChanged` → audit wiring
> (`src/application/services/audit-subscribers.ts`). The **outbox/durable
> tier** described below is **Planned**, not built — Foundation has no event
> that needs cross-request delivery yet. See `docs/implementation/foundation.md`.

## Purpose

Many actions in this system have effects that are not the concern of the code
performing the original action. When a transaction is recorded, the portfolio's
valuation should be recalculated, an alert rule might need evaluating, and an audit
record must be written — but `domain/trading` should not need to know that
`analytics`, `alerts`, and `audit` exist, let alone call each of them directly.
That kind of direct coupling is exactly what `domain-driven-design.md` establishes
bounded contexts to prevent.

The internal event system is the mechanism for expressing "this happened" once, and
letting any interested part of the system react, without the originator knowing who
is listening. This is a deliberate, scoped architectural pattern — an in-process
publish/subscribe mechanism, not a message broker. No Kafka, RabbitMQ, or other
external messaging infrastructure is introduced, per explicit direction: at this
scale, that would add operational burden without a matching benefit (see YAGNI,
`engineering-standards.md`).

## Design

### Event shape

Every event is a plain, typed object:

```ts
interface DomainEvent<TPayload = unknown> {
  type: string; // e.g. "TransactionCreated"
  occurredAt: string; // ISO timestamp
  actorId: string | null; // the user who caused it, if any
  correlationId: string; // ties related events from one request together
  payload: TPayload;
}
```

### Publishing

Aggregates/domain services raise events as part of an operation; they do not call
the event bus directly mid-operation. Instead, a service method returns (or
accumulates) the events it produced, and a single composition point — the Server
Action or Route Handler that invoked the service — publishes them after the
originating database write commits successfully. This avoids the classic bug of
publishing an event for a change that then fails to commit.

```ts
const result = await transactionService.recordTransaction(input);
await eventBus.publishAll(result.events);
```

### Subscribing

Handlers register interest in specific event types at application bootstrap
(`infrastructure/events/`), each handler living in the context that cares about the
event, not in the context that raises it:

```ts
eventBus.subscribe("TransactionCreated", recalculatePortfolioHandler); // analytics
eventBus.subscribe("TransactionCreated", auditTransactionHandler); // audit
eventBus.subscribe("PriceUpdated", evaluateAlertRulesHandler); // alerts
```

A single event can have multiple independent subscribers; subscribers do not know
about each other, and a failure in one subscriber must not prevent others from
running (each is invoked and its errors captured/logged independently, not thrown
through a shared chain).

## Propagation: the Serverless Constraint

This matters enough to call out explicitly, because it is a real architectural
constraint, not a detail: Vercel's Next.js runtime is stateless and serverless —
there is no long-lived process to hold an in-memory event bus across requests. The
event system is therefore split into two tiers, deliberately:

1. **In-request (synchronous) propagation.** Within a single Server Action or Route
   Handler invocation, the event bus is a simple in-process dispatcher (a typed
   `EventEmitter`-style object constructed per request). Handlers that must
   complete before the response is returned to the user — e.g., recalculating the
   portfolio total shown on the very next screen — subscribe here and run
   synchronously (or awaited) within that request. This covers the majority of the
   listed events (`HoldingCreated`, `TransactionCreated` → recalculation,
   `SettingsChanged`).

2. **Durable (cross-request) propagation via transactional outbox.** For effects
   that do not need to complete before the response returns — sending a
   notification, generating an AI brief, running a heavier alert evaluation — the
   event is additionally persisted to an `events` outbox table in the same
   transaction as the originating write (the "transactional outbox" pattern: the
   event cannot be lost because it is written atomically alongside the data change
   it describes). A scheduled job (a Vercel Cron-triggered Route Handler or Supabase
   Edge Function, run periodically) polls unprocessed rows in `events`, invokes the
   relevant durable handlers, and marks them processed. This is still "internal" —
   it is our own table and our own polling job, not third-party messaging
   infrastructure — but it survives the fact that no process stays alive between
   requests.

A handler declares which tier it needs when it registers. The default is
in-request; a handler opts into the outbox only when its work is genuinely
deferrable, since the outbox path has higher latency (bounded by the poll
interval) and more moving parts.

```
Request ──▶ domain service ──▶ commit DB write + outbox row (1 transaction)
                                        │
                          in-request handlers run synchronously ──▶ response returned
                                        │
                          (async) scheduled job polls outbox ──▶ durable handlers run
```

## Event Catalog

| Event                  | Raised by   | Example subscribers                                             | Tier                         |
| ---------------------- | ----------- | --------------------------------------------------------------- | ---------------------------- |
| `TransactionCreated`   | `trading`   | `analytics` (recalculate), `audit`, `alerts`                    | in-request + outbox          |
| `TransactionUpdated`   | `trading`   | `analytics`, `audit`                                            | in-request + outbox          |
| `HoldingCreated`       | `portfolio` | `analytics`, `audit`                                            | in-request + outbox          |
| `HoldingUpdated`       | `portfolio` | `analytics`, `audit`                                            | in-request + outbox          |
| `PortfolioCalculated`  | `analytics` | UI cache invalidation, `alerts`                                 | in-request                   |
| `PriceUpdated`         | `market`    | `analytics`, `alerts`                                           | outbox (batch price updates) |
| `OpportunityGenerated` | `ai`        | `alerts`, `audit`                                               | outbox                       |
| `AlertCreated`         | `alerts`    | `notifications` (via `NotificationProvider`), `audit`           | outbox                       |
| `BriefGenerated`       | `ai`        | `notifications`, `audit`                                        | outbox                       |
| `ResearchUpdated`      | `research`  | `audit`                                                         | in-request                   |
| `DocumentUploaded`     | `documents` | `documents` (text extraction via `DocumentProvider`), `audit`   | outbox                       |
| `SettingsChanged`      | `settings`  | `audit`, provider re-composition (if provider settings changed) | in-request                   |

This table is the authoritative event list for this phase; new events are added
here as new domains are implemented, following the same `PastTenseVerb` naming
convention (an event names something that already happened, never a command).

## Why This Pattern, Specifically

- **Decoupling without infrastructure cost.** Contexts stay ignorant of each other
  (satisfying the DDD boundary) without requiring a message broker, its
  operational overhead, or its failure modes, which would be disproportionate for
  a single-database application at this scale.
- **The audit trail becomes a natural consequence, not a bolt-on.** Because
  significant domain actions already emit events, `audit-strategy.md`'s handler is
  simply one more subscriber — audit logging does not need to be manually invoked
  from every call site that changes data.
- **Honest about serverless.** A design that assumed a persistent in-memory bus
  would quietly fail in production the first time two requests hit different
  serverless instances. Naming the two tiers explicitly prevents that class of bug
  from being discovered the hard way.

## What This Is Not

- Not an event-sourcing system. The database tables (`database-design.md`) remain
  the source of truth for current state; events describe _changes that already
  happened to that state_, they do not replace it. Rebuilding state purely by
  replaying events is not a goal here.
- Not a queue with guaranteed ordering/exactly-once delivery across arbitrary
  scale. The outbox+poll approach gives at-least-once delivery, which is
  sufficient for this system's volume; idempotent handlers (safe to run twice) are
  required precisely because of this, and is a stated expectation for any outbox
  handler.
