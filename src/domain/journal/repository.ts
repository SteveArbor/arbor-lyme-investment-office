import type { JournalEntry, JournalEntryCloseInput, JournalEntryOpenInput } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface JournalRepository {
  getById(ownerId: string, entryId: string): Promise<JournalEntry | null>;
  listByCompanyId(ownerId: string, companyId: string): Promise<JournalEntry[]>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<JournalEntry[]>;
  create(ownerId: string, input: JournalEntryOpenInput): Promise<JournalEntry>;
  close(ownerId: string, entryId: string, input: JournalEntryCloseInput): Promise<JournalEntry>;
}
