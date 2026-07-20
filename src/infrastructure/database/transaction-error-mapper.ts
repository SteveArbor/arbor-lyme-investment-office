import { ConflictError, NotFoundError, ValidationError } from "@/domain/shared";
import { logger } from "@/lib/logger";

/**
 * Translates the atomic transaction RPCs' errcodes (see
 * supabase/migrations/20260719000015_transaction_integrity_hardening.sql's
 * header comment for the full range) into the same typed domain errors
 * `TradingService`'s own pre-flight checks throw, so a Server Action never
 * needs to know whether a rejection came from the pre-flight check or from
 * the database's authoritative re-check under concurrency
 * (docs/implementation/staff-engineer-review.md findings H1/H2).
 *
 * Anything not in the known ALC0x range is logged here — server-side,
 * structured, with enough context to find the failing call — and replaced
 * with a generic message before it reaches the caller
 * (docs/implementation/staff-engineer-review.md finding H5): a raw
 * Postgres error can contain schema/column detail that shouldn't reach a
 * user, and silently dropping it instead would make a real production
 * failure invisible.
 */
export function mapTransactionRpcError(
  error: { code?: string; message?: string } | null | undefined,
  context: { operation: string; ownerId: string; portfolioId: string }
): never {
  const code = error?.code;

  if (code === "ALC01") {
    throw new NotFoundError("Portfolio", context.portfolioId);
  }
  if (code === "ALC02") {
    throw new ConflictError("Insufficient holding to sell", {
      quantity: ["The requested quantity exceeds the current holding."],
    });
  }
  if (code === "ALC03") {
    throw new ConflictError(
      error?.message ?? "This operation conflicts with the current portfolio state"
    );
  }
  if (code === "ALC06") {
    throw new ValidationError(error?.message ?? "Invalid transaction input");
  }

  logger.error("Unexpected transaction RPC failure", {
    category: "trading",
    ...context,
    code,
    message: error?.message,
  });
  throw new Error("Unable to complete this transaction. Please try again.");
}
