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

/**
 * Common base for the two domain error types a Server Action can safely
 * show to the user verbatim (as opposed to an unexpected error, which must
 * be logged server-side and replaced with a generic message — see
 * docs/implementation/staff-engineer-review.md finding H5). `fieldErrors`
 * is optional structure a form can highlight; `message` alone is always
 * safe to render.
 */
export abstract class UserFacingError extends DomainError {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {}
  ) {
    super(message);
  }
}

/** Thrown when input fails validation at a domain boundary. */
export class ValidationError extends UserFacingError {
  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message, fieldErrors);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when an otherwise well-formed operation conflicts with the
 * current persisted state — insufficient cash, insufficient holding
 * quantity, a ticker that already exists, a journal entry that's already
 * closed. Distinct from `ValidationError` (malformed input) per
 * docs/implementation/staff-engineer-review.md's review: a caller — a
 * Server Action today, a future HTTP API tomorrow — can map this to a
 * 409-style response instead of a 422-style one without string-matching
 * the message.
 */
export class ConflictError extends UserFacingError {
  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message, fieldErrors);
    this.name = "ConflictError";
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
 * The three provider-failure types every `provider-architecture.md`
 * implementation is meant to map a vendor's own error shape into (named
 * there and in `docs/data-flow.md` since ADR 0006, first actually needed by
 * ADR 0030's Price Engine). Living here, not in a single domain, because
 * they're deliberately reusable across every future provider-backed
 * context (market data today; AI, notifications, documents later) — the
 * whole point of naming them once, centrally, is that a caller reacts to
 * "the vendor is rate-limiting us" the same way regardless of which
 * interface or which concrete vendor raised it.
 */

/** Thrown when a provider's own request-rate ceiling has been hit. Callers should back off, not fail the whole operation as if the request were invalid. */
export class ProviderRateLimitError extends DomainError {
  constructor(
    public readonly providerName: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(
      `${providerName} rate limit exceeded` +
        (retryAfterSeconds !== undefined ? ` — retry after ${retryAfterSeconds}s` : "")
    );
    this.name = "ProviderRateLimitError";
  }
}

/** Thrown when a provider is unreachable, times out, or returns a server-side failure unrelated to the specific request made. */
export class ProviderUnavailableError extends DomainError {
  constructor(
    public readonly providerName: string,
    cause?: string
  ) {
    super(`${providerName} is unavailable` + (cause ? `: ${cause}` : ""));
    this.name = "ProviderUnavailableError";
  }
}

/** Thrown when a provider rejects the credentials it was called with (expired/invalid/revoked API key). Distinct from rate-limit/unavailable because retrying immediately never helps — the configuration itself needs fixing. */
export class ProviderAuthError extends DomainError {
  constructor(public readonly providerName: string) {
    super(`${providerName} rejected the configured credentials`);
    this.name = "ProviderAuthError";
  }
}
