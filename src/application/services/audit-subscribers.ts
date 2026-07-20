import type { AuditService } from "@/domain/audit";
import type { SettingsChangedPayload } from "@/domain/settings";
import type { EventBus } from "@/domain/shared";
import type { TransactionRecordedPayload } from "@/domain/trading";

/**
 * Registers audit's reaction to other domains' events. This is what makes
 * "every SettingsChanged produces an audit record" a consequence of the
 * event already being raised for other reasons, rather than a manually
 * invoked step at every settings call site (docs/audit-strategy.md).
 *
 * Lives in application/ (composition), not in domain/audit itself: the
 * audit domain doesn't know settings exists (docs/domain-driven-design.md's
 * dependency rule) — this function is the one place that wires the two
 * together.
 */
export function registerAuditSubscriptions(eventBus: EventBus, auditService: AuditService): void {
  eventBus.subscribe<SettingsChangedPayload>("SettingsChanged", async (event) => {
    await auditService.record({
      actorId: event.actorId,
      eventType: "SettingsChanged",
      entityType: "user_settings",
      entityId: event.payload.userId,
      correlationId: event.correlationId,
      metadata: { changedFields: event.payload.changedFields },
      outcome: "success",
    });
  });

  // Every ledger write (buy/sell/dividend/fee/interest/tax/cash adjustment)
  // gets its own audit_events row keyed by transaction id — this is what
  // powers the Transaction detail view's "audit history" section
  // (Milestone 2.7 Part 1), distinct from the transaction row itself: the
  // ledger row is the financial fact, this is who/when it was recorded.
  eventBus.subscribe<TransactionRecordedPayload>("TransactionRecorded", async (event) => {
    await auditService.record({
      actorId: event.actorId,
      eventType: "TransactionRecorded",
      entityType: "transaction",
      entityId: event.payload.transactionId,
      correlationId: event.correlationId,
      metadata: {
        portfolioId: event.payload.portfolioId,
        companyId: event.payload.companyId,
        type: event.payload.type,
        amount: event.payload.amount,
      },
      outcome: "success",
    });
  });
}
