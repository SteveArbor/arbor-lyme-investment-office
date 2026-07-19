import { describe, expect, it } from "vitest";

import { type AuditRecord, type AuditRepository, AuditService } from "@/domain/audit";
import {
  FOUNDATION_DEFAULT_SETTINGS,
  type Settings,
  type SettingsRepository,
  SettingsService,
  type SettingsUpdate,
} from "@/domain/settings";
import { InProcessEventBus } from "@/infrastructure/events";

import { registerAuditSubscriptions } from "./audit-subscribers";

class FakeSettingsRepository implements SettingsRepository {
  private readonly rows = new Map<string, Settings>();
  seed(userId: string) {
    this.rows.set(userId, FOUNDATION_DEFAULT_SETTINGS);
  }
  async getByUserId(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async update(userId: string, patch: SettingsUpdate) {
    const existing = this.rows.get(userId)!;
    const updated = { ...existing, ...patch };
    this.rows.set(userId, updated);
    return updated;
  }
}

class FakeAuditRepository implements AuditRepository {
  public readonly inserted: AuditRecord[] = [];
  async insert(record: AuditRecord) {
    this.inserted.push(record);
  }
}

describe("settings -> event bus -> audit wiring", () => {
  it("produces an audit record when settings are updated, without settings knowing audit exists", async () => {
    const settingsRepo = new FakeSettingsRepository();
    settingsRepo.seed("user-1");
    const settingsService = new SettingsService(settingsRepo);

    const auditRepo = new FakeAuditRepository();
    const auditService = new AuditService(auditRepo);

    const eventBus = new InProcessEventBus();
    registerAuditSubscriptions(eventBus, auditService);

    const { event } = await settingsService.updateSettings(
      "user-1",
      { baseCurrency: "USD" },
      "corr-1"
    );
    await eventBus.publish(event);

    expect(auditRepo.inserted).toHaveLength(1);
    expect(auditRepo.inserted[0]).toMatchObject({
      actorId: "user-1",
      eventType: "SettingsChanged",
      entityType: "user_settings",
      entityId: "user-1",
      correlationId: "corr-1",
      outcome: "success",
      metadata: { changedFields: ["baseCurrency"] },
    });
  });
});
