/**
 * The internal event contract every bounded context publishes/subscribes
 * through. See docs/event-system.md for the full design (two-tier
 * in-request/outbox propagation) — this module defines the shared shape and
 * the EventBus interface only; concrete delivery lives in
 * infrastructure/events (dependency inversion, see docs/domain-driven-design.md).
 */

export interface DomainEvent<TPayload = unknown> {
  type: string;
  occurredAt: string;
  actorId: string | null;
  correlationId: string;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (
  event: DomainEvent<TPayload>
) => Promise<void> | void;

export interface EventBus {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): void;
}

/**
 * Builds a DomainEvent with a generated id-free, timestamped envelope around
 * a payload. Domain services use this instead of constructing the envelope
 * by hand, so every event is shaped identically.
 */
export function createDomainEvent<TPayload>(params: {
  type: string;
  actorId: string | null;
  correlationId: string;
  payload: TPayload;
}): DomainEvent<TPayload> {
  return {
    type: params.type,
    occurredAt: new Date().toISOString(),
    actorId: params.actorId,
    correlationId: params.correlationId,
    payload: params.payload,
  };
}
