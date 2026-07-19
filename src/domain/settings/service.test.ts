import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/domain/shared";

import { FOUNDATION_DEFAULT_SETTINGS, type Settings, type SettingsUpdate } from "./model";
import type { SettingsRepository } from "./repository";
import { SettingsService } from "./service";

class FakeSettingsRepository implements SettingsRepository {
  private readonly rows = new Map<string, Settings>();

  seed(userId: string, settings: Settings = FOUNDATION_DEFAULT_SETTINGS) {
    this.rows.set(userId, settings);
  }

  async getByUserId(userId: string): Promise<Settings | null> {
    return this.rows.get(userId) ?? null;
  }

  async update(userId: string, patch: SettingsUpdate): Promise<Settings> {
    const existing = this.rows.get(userId);
    if (!existing) throw new Error("not seeded");
    const updated = { ...existing, ...patch };
    this.rows.set(userId, updated);
    return updated;
  }
}

describe("SettingsService", () => {
  it("returns a user's settings", async () => {
    const repo = new FakeSettingsRepository();
    repo.seed("user-1");
    const service = new SettingsService(repo);

    const settings = await service.getSettings("user-1");

    expect(settings).toEqual(FOUNDATION_DEFAULT_SETTINGS);
  });

  it("throws NotFoundError when settings do not exist for the user", async () => {
    const repo = new FakeSettingsRepository();
    const service = new SettingsService(repo);

    await expect(service.getSettings("missing-user")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates settings and returns a SettingsChanged event describing the change", async () => {
    const repo = new FakeSettingsRepository();
    repo.seed("user-1");
    const service = new SettingsService(repo);

    const result = await service.updateSettings(
      "user-1",
      { baseCurrency: "USD", monthlyIncomeTarget: 4500 },
      "corr-1"
    );

    expect(result.settings.baseCurrency).toBe("USD");
    expect(result.settings.monthlyIncomeTarget).toBe(4500);
    // Unchanged fields are preserved, not wiped out by the partial update.
    expect(result.settings.timeZone).toBe(FOUNDATION_DEFAULT_SETTINGS.timeZone);

    expect(result.event.type).toBe("SettingsChanged");
    expect(result.event.actorId).toBe("user-1");
    expect(result.event.correlationId).toBe("corr-1");
    expect(result.event.payload.changedFields).toEqual(["baseCurrency", "monthlyIncomeTarget"]);
    expect(result.event.payload.before.baseCurrency).toBe("GBP");
    expect(result.event.payload.after.baseCurrency).toBe("USD");
  });

  it("rejects an update with an invalid enum value", async () => {
    const repo = new FakeSettingsRepository();
    repo.seed("user-1");
    const service = new SettingsService(repo);

    await expect(
      service.updateSettings("user-1", { baseCurrency: "JPY" }, "corr-2")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a negative income target", async () => {
    const repo = new FakeSettingsRepository();
    repo.seed("user-1");
    const service = new SettingsService(repo);

    await expect(
      service.updateSettings("user-1", { monthlyIncomeTarget: -100 }, "corr-3")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an empty update payload", async () => {
    const repo = new FakeSettingsRepository();
    repo.seed("user-1");
    const service = new SettingsService(repo);

    await expect(service.updateSettings("user-1", {}, "corr-4")).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
