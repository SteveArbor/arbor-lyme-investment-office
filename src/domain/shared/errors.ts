/**
 * Base error types shared across domain contexts. Per
 * docs/engineering-standards.md, domain errors are typed and specific, never
 * generic `Error` instances — each bounded context defines its own error
 * subclasses extending these where it needs to.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** Thrown when input fails validation at a domain boundary. */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Thrown when a requested record does not exist or is not visible to the caller. */
export class NotFoundError extends DomainError {
  constructor(entityType: string, entityId: string) {
    super(`${entityType} not found: ${entityId}`);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when an optimistic-concurrency write is rejected because the
 * record changed between when it was read and when the write was applied
 * (Phase 2 Architecture Review finding 4.2, ADR 0025). A framework-agnostic
 * signal — infrastructure translates the underlying database's specific
 * conflict error into this type, so callers in the domain/application
 * layers can decide whether to retry without knowing anything about
 * Postgres error codes.
 */
export class ConcurrentModificationError extends DomainError {
  constructor(entityType: string) {
    super(`${entityType} was modified concurrently — retry with fresh data`);
    this.name = "ConcurrentModificationError";
  }
}
