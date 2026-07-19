import type { DomainEvent, EventBus, EventHandler } from "@/domain/shared";
import { logger } from "@/lib/logger";

/**
 * In-process implementation of the EventBus contract defined in
 * domain/shared/events.ts. This is the "in-request tier" described in
 * docs/event-system.md: handlers registered on an instance run
 * synchronously (awaited in registration order) within the same request.
 *
 * Deliberately NOT a persistent/cross-request bus — Vercel's serverless
 * runtime has no long-lived process to hold one (docs/event-system.md's
 * "Propagation: the Serverless Constraint" section explains why). A fresh
 * instance is constructed per request by the composition layer
 * (src/application); the durable outbox tier described in
 * docs/event-system.md is future work (Phase 2+, once TransactionCreated
 * and similar events need cross-request delivery) and is not built here.
 *
 * One handler's failure does not prevent other handlers for the same event
 * from running — each is invoked independently and failures are collected,
 * never thrown through a shared chain. This is what lets the audit
 * subscriber fail without breaking the primary action it's observing
 * (docs/audit-strategy.md's fail-open-but-logged requirement).
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): void {
    const existing = this.handlers.get(type) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(type, existing);
  }

  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        // A handler failure must never break the primary action that
        // published the event (docs/audit-strategy.md) — surfaced via the
        // structured logger rather than silently swallowed or rethrown.
        logger.error(`Event handler failed for "${event.type}"`, {
          category: "event-bus",
          correlationId: event.correlationId,
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
