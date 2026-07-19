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
