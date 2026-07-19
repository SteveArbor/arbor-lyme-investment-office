import {
  createDomainEvent,
  type DomainEvent,
  NotFoundError,
  ValidationError,
} from "@/domain/shared";

import { type JournalEntry, journalEntryCloseSchema, journalEntryOpenSchema } from "./model";
import type { JournalRepository } from "./repository";

export interface JournalEntryOpenedPayload {
  entryId: string;
  companyId: string;
  portfolioId: string;
}

export interface JournalEntryClosedPayload {
  entryId: string;
  companyId: string;
  saleReason: string;
}

/**
 * Business logic for the Decision Journal (docs/development-roadmap.md
 * Phase 2, item 8). Framework-independent. The fields captured by
 * openEntry are never edited afterwards — only closeEntry ever touches an
 * existing row, and only to add the sale-time fields.
 */
export class JournalService {
  constructor(private readonly repository: JournalRepository) {}

  async getEntry(ownerId: string, entryId: string): Promise<JournalEntry> {
    const entry = await this.repository.getById(ownerId, entryId);
    if (!entry) {
      throw new NotFoundError("JournalEntry", entryId);
    }
    return entry;
  }

  async listEntriesForCompany(ownerId: string, companyId: string): Promise<JournalEntry[]> {
    return this.repository.listByCompanyId(ownerId, companyId);
  }

  async listEntriesForPortfolio(ownerId: string, portfolioId: string): Promise<JournalEntry[]> {
    return this.repository.listByPortfolioId(ownerId, portfolioId);
  }

  async openEntry(
    ownerId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ entry: JournalEntry; event: DomainEvent<JournalEntryOpenedPayload> }> {
    const parsed = journalEntryOpenSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid journal entry",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const entry = await this.repository.create(ownerId, parsed.data);

    const event = createDomainEvent<JournalEntryOpenedPayload>({
      type: "JournalEntryOpened",
      actorId: ownerId,
      correlationId,
      payload: { entryId: entry.id, companyId: entry.companyId, portfolioId: entry.portfolioId },
    });

    return { entry, event };
  }

  async closeEntry(
    ownerId: string,
    entryId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ entry: JournalEntry; event: DomainEvent<JournalEntryClosedPayload> }> {
    const parsed = journalEntryCloseSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid journal entry closure",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const existing = await this.getEntry(ownerId, entryId);
    if (existing.status === "closed") {
      throw new ValidationError("This journal entry is already closed", {
        status: ["An entry can only be closed once"],
      });
    }

    const entry = await this.repository.close(ownerId, entryId, parsed.data);

    const event = createDomainEvent<JournalEntryClosedPayload>({
      type: "JournalEntryClosed",
      actorId: ownerId,
      correlationId,
      payload: {
        entryId: entry.id,
        companyId: entry.companyId,
        saleReason: parsed.data.saleReason,
      },
    });

    return { entry, event };
  }
}
