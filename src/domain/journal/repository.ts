import type { JournalEntry, JournalEntryCloseInput, JournalEntryOpenInput } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface JournalRepository {
  getById(ownerId: string, entryId: string): Promise<JournalEntry | null>;
  listByCompanyId(ownerId: string, companyId: string): Promise<JournalEntry[]>;
  /** Batch read for multi-company views — one query instead of one per company. */
  listByCompanyIds(ownerId: string, companyIds: string[]): Promise<JournalEntry[]>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<JournalEntry[]>;
  /** Every entry across every company/portfolio the owner has — the cross-company Journal view. */
  listByOwnerId(ownerId: string): Promise<JournalEntry[]>;
  create(ownerId: string, input: JournalEntryOpenInput): Promise<JournalEntry>;
  close(ownerId: string, entryId: string, input: JournalEntryCloseInput): Promise<JournalEntry>;
}
