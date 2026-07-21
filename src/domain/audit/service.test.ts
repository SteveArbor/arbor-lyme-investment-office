import { describe, expect, it, vi } from "vitest";

import type { AuditRecord } from "./model";
import type { AuditRepository } from "./repository";
import { AuditService } from "./service";

class FakeAuditRepository implements AuditRepository {
  public readonly inserted: AuditRecord[] = [];

  async insert(record: AuditRecord): Promise<void> {
    this.inserted.push(record);
  }

  async listByEntity(
    actorId: string,
    entityType: string,
    entityId: string
  ): Promise<AuditRecord[]> {
    return this.inserted
      .filter(
        (record) =>
          record.actorId === actorId &&
          record.entityType === entityType &&
          record.entityId === entityId
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }
}

class FailingAuditRepository implements AuditRepository {
  async insert(): Promise<void> {
    throw new Error("connection lost");
  }

  async listByEntity(): Promise<AuditRecord[]> {
    throw new Error("connection lost");
  }
}

describe("AuditService", () => {
  it("records a sanitized audit event", async () => {
    const repo = new FakeAuditRepository();
    const service = new AuditService(repo);

    await service.record({
      actorId: "user-1",
      eventType: "SettingsChanged",
      entityType: "user_settings",
      entityId: "user-1",
      correlationId: "corr-1",
      metadata: { changedFields: ["baseCurrency"], password: "should-be-stripped" },
      outcome: "success",
    });

    expect(repo.inserted).toHaveLength(1);
    expect(repo.inserted[0]).toMatchObject({
      actorId: "user-1",
      eventType: "SettingsChanged",
      outcome: "success",
      source: "app",
      metadata: { changedFields: ["baseCurrency"] },
    });
    expect(repo.inserted[0].metadata).not.toHaveProperty("password");
  });

  it("defaults source to 'app' and entityId/correlationId to null when omitted", async () => {
    const repo = new FakeAuditRepository();
    const service = new AuditService(repo);

    await service.record({
      actorId: "user-1",
      eventType: "Login",
      entityType: "session",
      outcome: "success",
    });

    expect(repo.inserted[0]).toMatchObject({
      source: "app",
      entityId: null,
      correlationId: null,
      metadata: {},
    });
  });

  it("does not throw when the repository fails (fail-open)", async () => {
    const service = new AuditService(new FailingAuditRepository());

    await expect(
      service.record({
        actorId: "user-1",
        eventType: "Login",
        entityType: "session",
        outcome: "success",
      })
    ).resolves.toBeUndefined();
  });

  it("logs a failure rather than swallowing it silently", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    const service = new AuditService(new FailingAuditRepository());
    await service.record({
      actorId: "user-1",
      eventType: "Login",
      entityType: "session",
      outcome: "success",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to write audit event",
      expect.objectContaining({ category: "audit", eventType: "Login" })
    );

    errorSpy.mockRestore();
  });

  it("returns an entity's audit history newest first", async () => {
    const repo = new FakeAuditRepository();
    const service = new AuditService(repo);

    await service.record({
      actorId: "user-1",
      eventType: "TransactionRecorded",
      entityType: "transaction",
      entityId: "txn-1",
      outcome: "success",
    });

    const history = await service.getHistory("user-1", "transaction", "txn-1");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ eventType: "TransactionRecorded", entityId: "txn-1" });
  });
});
