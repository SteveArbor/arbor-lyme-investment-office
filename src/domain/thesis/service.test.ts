import { describe, expect, it } from "vitest";

import {
  type EntityVersion,
  type RecordVersionInput,
  ValidationError,
  type VersionHistoryRepository,
} from "@/domain/shared";

import type { Thesis, ThesisStatement } from "./model";
import type { ThesisRepository } from "./repository";
import { ThesisService } from "./service";

let nextId = 1;

class FakeThesisRepository implements ThesisRepository {
  private readonly rows = new Map<string, Thesis>();

  async getByCompanyId(ownerId: string, companyId: string): Promise<Thesis | null> {
    for (const row of this.rows.values()) {
      if (row.ownerId === ownerId && row.companyId === companyId) return row;
    }
    return null;
  }

  async listByCompanyIds(ownerId: string, companyIds: string[]): Promise<Thesis[]> {
    return [...this.rows.values()].filter(
      (row) => row.ownerId === ownerId && companyIds.includes(row.companyId)
    );
  }

  async create(ownerId: string, companyId: string): Promise<Thesis> {
    const now = new Date().toISOString();
    const thesis: Thesis = {
      id: `thesis-${nextId++}`,
      ownerId,
      companyId,
      statements: [],
      overallStatus: "stable",
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(thesis.id, thesis);
    return thesis;
  }

  async setStatements(
    ownerId: string,
    thesisId: string,
    statements: ThesisStatement[],
    overallStatus: Thesis["overallStatus"]
  ): Promise<Thesis> {
    const existing = this.rows.get(thesisId);
    if (!existing || existing.ownerId !== ownerId) throw new Error("not found");
    const updated = { ...existing, statements, overallStatus, updatedAt: new Date().toISOString() };
    this.rows.set(thesisId, updated);
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

describe("ThesisService", () => {
  it("lazily creates an empty thesis with 'stable' overall status", async () => {
    const service = new ThesisService(
      new FakeThesisRepository(),
      new FakeVersionHistoryRepository()
    );

    const thesis = await service.getOrCreateThesis("user-1", "company-1");

    expect(thesis.statements).toEqual([]);
    expect(thesis.overallStatus).toBe("stable");
  });

  it("computes overall status server-side and ignores any client-supplied overallStatus", async () => {
    const service = new ThesisService(
      new FakeThesisRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateThesis("user-1", "company-1");

    const result = await service.updateStatements(
      "user-1",
      "company-1",
      {
        statements: [
          { description: "Strong moat", confidence: 0.9, status: "strengthening" },
          { description: "Margins improving", confidence: 0.8, status: "strengthening" },
        ],
      },
      "user-1",
      "corr-1"
    );

    expect(result.thesis.overallStatus).toBe("strengthening");
    expect(result.thesis.statements).toHaveLength(2);
    expect(result.thesis.statements[0].id).toBeTruthy();
  });

  it("flags overallStatusChanged correctly when the status actually changes", async () => {
    const service = new ThesisService(
      new FakeThesisRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateThesis("user-1", "company-1");

    const first = await service.updateStatements(
      "user-1",
      "company-1",
      { statements: [{ description: "a", confidence: 0.9, status: "strengthening" }] },
      "user-1",
      "corr-1"
    );
    expect(first.event.payload.overallStatusChanged).toBe(true); // stable -> strengthening

    const second = await service.updateStatements(
      "user-1",
      "company-1",
      { statements: [{ description: "a", confidence: 0.9, status: "strengthening" }] },
      "user-1",
      "corr-2"
    );
    expect(second.event.payload.overallStatusChanged).toBe(false); // strengthening -> strengthening
  });

  it("records a version snapshot before applying the new statement list", async () => {
    const versionHistory = new FakeVersionHistoryRepository();
    const service = new ThesisService(new FakeThesisRepository(), versionHistory);
    const created = await service.getOrCreateThesis("user-1", "company-1");

    await service.updateStatements(
      "user-1",
      "company-1",
      { statements: [{ description: "a", confidence: 0.5, status: "stable" }] },
      "user-1",
      "corr-1"
    );

    expect(versionHistory.recorded).toHaveLength(1);
    expect(versionHistory.recorded[0].entityType).toBe("thesis");
    expect(versionHistory.recorded[0].entityId).toBe(created.id);
  });

  it("rejects a statement with confidence out of range", async () => {
    const service = new ThesisService(
      new FakeThesisRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateThesis("user-1", "company-1");

    await expect(
      service.updateStatements(
        "user-1",
        "company-1",
        { statements: [{ description: "a", confidence: 1.5, status: "stable" }] },
        "user-1",
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
