import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/domain/shared";

import type { JournalEntry, JournalEntryCloseInput, JournalEntryOpenInput } from "./model";
import type { JournalRepository } from "./repository";
import { JournalService } from "./service";

let nextId = 1;

class FakeJournalRepository implements JournalRepository {
  public readonly rows: JournalEntry[] = [];

  async getById(ownerId: string, entryId: string): Promise<JournalEntry | null> {
    return this.rows.find((row) => row.ownerId === ownerId && row.id === entryId) ?? null;
  }

  async listByCompanyId(ownerId: string, companyId: string): Promise<JournalEntry[]> {
    return this.rows.filter((row) => row.ownerId === ownerId && row.companyId === companyId);
  }

  async listByPortfolioId(ownerId: string, portfolioId: string): Promise<JournalEntry[]> {
    return this.rows.filter((row) => row.ownerId === ownerId && row.portfolioId === portfolioId);
  }

  async create(ownerId: string, input: JournalEntryOpenInput): Promise<JournalEntry> {
    const now = new Date().toISOString();
    const entry: JournalEntry = {
      id: `journal-${nextId++}`,
      ownerId,
      status: "open",
      ...input,
      saleDate: null,
      saleReason: null,
      lessonsLearned: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(entry);
    return entry;
  }

  async close(
    ownerId: string,
    entryId: string,
    input: JournalEntryCloseInput
  ): Promise<JournalEntry> {
    const index = this.rows.findIndex((row) => row.ownerId === ownerId && row.id === entryId);
    if (index === -1) throw new NotFoundError("JournalEntry", entryId);
    this.rows[index] = {
      ...this.rows[index],
      status: "closed",
      ...input,
      updatedAt: new Date().toISOString(),
    };
    return this.rows[index];
  }
}

const validOpenInput = {
  companyId: "11111111-1111-4111-8111-111111111111",
  portfolioId: "22222222-2222-4222-8222-222222222222",
  purchaseDate: new Date().toISOString(),
  purchasePrice: 50,
  fairValueAtPurchase: 75,
  expectedReturnAtPurchase: 0.2,
  positionSize: 1_000,
  convictionAtPurchase: 0.8,
  thesisSummary: "Durable moat, strong management, undervalued.",
  risks: "Regulatory risk in core market.",
  invalidationConditions: "Loss of key customer contract.",
};

describe("JournalService", () => {
  it("opens an entry capturing the decision-time snapshot", async () => {
    const service = new JournalService(new FakeJournalRepository());
    const result = await service.openEntry("user-1", validOpenInput, "corr-1");

    expect(result.entry.status).toBe("open");
    expect(result.entry.purchasePrice).toBe(50);
    expect(result.entry.saleDate).toBeNull();
    expect(result.event.type).toBe("JournalEntryOpened");
  });

  it("rejects an entry with no thesis summary", async () => {
    const service = new JournalService(new FakeJournalRepository());
    await expect(
      service.openEntry("user-1", { ...validOpenInput, thesisSummary: "" }, "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("closes an open entry, recording sale fields", async () => {
    const service = new JournalService(new FakeJournalRepository());
    const opened = await service.openEntry("user-1", validOpenInput, "corr-1");

    const closed = await service.closeEntry(
      "user-1",
      opened.entry.id,
      {
        saleDate: new Date().toISOString(),
        saleReason: "Thesis played out, took profits.",
        lessonsLearned: "Should have sized the position larger given conviction.",
      },
      "corr-2"
    );

    expect(closed.entry.status).toBe("closed");
    expect(closed.entry.saleReason).toBe("Thesis played out, took profits.");
    // The decision-time snapshot is untouched by closing the entry.
    expect(closed.entry.purchasePrice).toBe(validOpenInput.purchasePrice);
    expect(closed.event.type).toBe("JournalEntryClosed");
  });

  it("rejects closing an entry that is already closed", async () => {
    const service = new JournalService(new FakeJournalRepository());
    const opened = await service.openEntry("user-1", validOpenInput, "corr-1");
    const closeInput = {
      saleDate: new Date().toISOString(),
      saleReason: "Exited.",
      lessonsLearned: "None.",
    };
    await service.closeEntry("user-1", opened.entry.id, closeInput, "corr-2");

    await expect(
      service.closeEntry("user-1", opened.entry.id, closeInput, "corr-3")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for an unknown entry", async () => {
    const service = new JournalService(new FakeJournalRepository());
    await expect(service.getEntry("user-1", "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
