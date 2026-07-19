import { describe, expect, it } from "vitest";

import {
  type EntityVersion,
  type RecordVersionInput,
  ValidationError,
  type VersionHistoryRepository,
} from "@/domain/shared";

import {
  EMPTY_RESEARCH_SECTIONS,
  type ResearchInput,
  type ResearchNote,
  type ResearchUpdate,
} from "./model";
import type { ResearchRepository } from "./repository";
import { ResearchService } from "./service";

let nextId = 1;

class FakeResearchRepository implements ResearchRepository {
  private readonly rows = new Map<string, ResearchNote>();

  async getByCompanyId(ownerId: string, companyId: string): Promise<ResearchNote | null> {
    for (const row of this.rows.values()) {
      if (row.ownerId === ownerId && row.companyId === companyId) return row;
    }
    return null;
  }

  async create(ownerId: string, input: ResearchInput): Promise<ResearchNote> {
    const now = new Date().toISOString();
    const note: ResearchNote = {
      ...input,
      id: `research-${nextId++}`,
      ownerId,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(note.id, note);
    return note;
  }

  async update(ownerId: string, researchId: string, patch: ResearchUpdate): Promise<ResearchNote> {
    const existing = this.rows.get(researchId);
    if (!existing || existing.ownerId !== ownerId) throw new Error("not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.rows.set(researchId, updated);
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

describe("ResearchService", () => {
  it("lazily creates an empty research note the first time it's needed", async () => {
    const service = new ResearchService(
      new FakeResearchRepository(),
      new FakeVersionHistoryRepository()
    );

    const note = await service.getOrCreateResearch("user-1", "company-1");

    expect(note.companyId).toBe("company-1");
    expect(note.businessOverview).toBeNull();
    expect(note).toMatchObject(EMPTY_RESEARCH_SECTIONS);
  });

  it("returns the same note on a second call rather than creating a duplicate", async () => {
    const repo = new FakeResearchRepository();
    const service = new ResearchService(repo, new FakeVersionHistoryRepository());

    const first = await service.getOrCreateResearch("user-1", "company-1");
    const second = await service.getOrCreateResearch("user-1", "company-1");

    expect(second.id).toBe(first.id);
  });

  it("updates only the specified section, leaving others untouched", async () => {
    const service = new ResearchService(
      new FakeResearchRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateResearch("user-1", "company-1");

    const result = await service.updateResearch(
      "user-1",
      "company-1",
      { businessOverview: "A great business." },
      "user-1",
      "corr-1"
    );

    expect(result.research.businessOverview).toBe("A great business.");
    expect(result.research.economicMoat).toBeNull();
    expect(result.event.payload.changedFields).toEqual(["businessOverview"]);
  });

  it("records a version snapshot of the PRE-update state before applying the update", async () => {
    const repo = new FakeResearchRepository();
    const versionHistory = new FakeVersionHistoryRepository();
    const service = new ResearchService(repo, versionHistory);

    const created = await service.getOrCreateResearch("user-1", "company-1");
    await service.updateResearch(
      "user-1",
      "company-1",
      { risks: "Competitive pressure." },
      "user-1",
      "corr-1"
    );

    expect(versionHistory.recorded).toHaveLength(1);
    expect(versionHistory.recorded[0]).toMatchObject({
      ownerId: "user-1",
      entityType: "research_note",
      entityId: created.id,
      changedBy: "user-1",
    });
    // The snapshot captured is the state BEFORE the risks field was set —
    // i.e. never overwritten, the old state is preserved exactly.
    expect((versionHistory.recorded[0].snapshot as ResearchNote).risks).toBeNull();
  });

  it("rejects an empty update payload", async () => {
    const service = new ResearchService(
      new FakeResearchRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateResearch("user-1", "company-1");

    await expect(
      service.updateResearch("user-1", "company-1", {}, "user-1", "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a section exceeding the maximum length", async () => {
    const service = new ResearchService(
      new FakeResearchRepository(),
      new FakeVersionHistoryRepository()
    );
    await service.getOrCreateResearch("user-1", "company-1");

    await expect(
      service.updateResearch(
        "user-1",
        "company-1",
        { notes: "x".repeat(20_001) },
        "user-1",
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
