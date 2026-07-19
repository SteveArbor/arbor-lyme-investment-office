import { describe, expect, it } from "vitest";

import {
  type EntityVersion,
  type RecordVersionInput,
  ValidationError,
  type VersionHistoryRepository,
} from "@/domain/shared";

import type { Valuation } from "./model";
import type { ValuationRepository, ValuationWriteData } from "./repository";
import { ValuationService } from "./service";

let nextId = 1;

class FakeValuationRepository implements ValuationRepository {
  private readonly rows = new Map<string, Valuation>();

  async getByCompanyId(ownerId: string, companyId: string): Promise<Valuation | null> {
    for (const row of this.rows.values()) {
      if (row.ownerId === ownerId && row.companyId === companyId) return row;
    }
    return null;
  }

  async create(ownerId: string, companyId: string, data: ValuationWriteData): Promise<Valuation> {
    const now = new Date().toISOString();
    const valuation: Valuation = {
      id: `valuation-${nextId++}`,
      ownerId,
      companyId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(valuation.id, valuation);
    return valuation;
  }

  async update(ownerId: string, valuationId: string, data: ValuationWriteData): Promise<Valuation> {
    const existing = this.rows.get(valuationId);
    if (!existing || existing.ownerId !== ownerId) throw new Error("not found");
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    this.rows.set(valuationId, updated);
    return updated;
  }
}

class FakeVersionHistoryRepository implements VersionHistoryRepository {
  public readonly recorded: RecordVersionInput<unknown>[] = [];

  async recordVersion<TSnapshot>(
    input: RecordVersionInput<TSnapshot>
  ): Promise<EntityVersion<TSnapshot>> {
    this.recorded.push(input);
    return {
      id: `version-${this.recorded.length}`,
      entityType: input.entityType,
      entityId: input.entityId,
      versionNumber: this.recorded.length,
      snapshot: input.snapshot,
      changedBy: input.changedBy,
      changedAt: new Date().toISOString(),
      changeNote: input.changeNote ?? null,
    };
  }

  async listVersions<TSnapshot>(): Promise<EntityVersion<TSnapshot>[]> {
    return [];
  }
}

describe("ValuationService", () => {
  it("creates a default valuation with neutral (non-company-specific) assumptions", async () => {
    const service = new ValuationService(
      new FakeValuationRepository(),
      new FakeVersionHistoryRepository()
    );

    const valuation = await service.getOrCreateValuation("user-1", "company-1");

    expect(
      valuation.bear.probability + valuation.base.probability + valuation.bull.probability
    ).toBeCloseTo(1, 5);
    expect(valuation.blendedFairValue).toBeDefined();
  });

  it("recalculates fair values server-side when scenario assumptions change", async () => {
    const service = new ValuationService(
      new FakeValuationRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateValuation("user-1", "company-1");

    const result = await service.updateValuation(
      "user-1",
      "company-1",
      {
        base: {
          epsAssumption: 10,
          growthRateAssumption: 0.1,
          terminalMultiple: 15,
          discountRate: 0.1,
          probability: 1 / 3,
        },
      },
      "user-1",
      "corr-1"
    );

    expect(result.valuation.base.fairValue).toBeCloseTo(150.0, 0);
    expect(result.event.payload.changedFields).toEqual(["base"]);
  });

  it("rejects an update where the merged scenario probabilities no longer sum to 1", async () => {
    const service = new ValuationService(
      new FakeValuationRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateValuation("user-1", "company-1");

    await expect(
      service.updateValuation(
        "user-1",
        "company-1",
        {
          base: {
            epsAssumption: 10,
            growthRateAssumption: 0.1,
            terminalMultiple: 15,
            discountRate: 0.1,
            probability: 0.9, // bear + bull already sum to 2/3, pushes total over 1
          },
        },
        "user-1",
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records a version snapshot before applying an update", async () => {
    const versionHistory = new FakeVersionHistoryRepository();
    const service = new ValuationService(new FakeValuationRepository(), versionHistory);
    const created = await service.getOrCreateValuation("user-1", "company-1");

    await service.updateValuation(
      "user-1",
      "company-1",
      { requiredReturn: 0.12 },
      "user-1",
      "corr-1"
    );

    expect(versionHistory.recorded).toHaveLength(1);
    expect(versionHistory.recorded[0].entityType).toBe("valuation");
    expect(versionHistory.recorded[0].entityId).toBe(created.id);
  });

  it("rejects a discount rate outside the valid 0-1 range", async () => {
    const service = new ValuationService(
      new FakeValuationRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateValuation("user-1", "company-1");

    await expect(
      service.updateValuation(
        "user-1",
        "company-1",
        {
          base: {
            epsAssumption: 10,
            growthRateAssumption: 0.1,
            terminalMultiple: 15,
            discountRate: 1.5,
            probability: 1 / 3,
          },
        },
        "user-1",
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
