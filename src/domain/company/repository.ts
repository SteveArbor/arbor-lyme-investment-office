import type { Company, CompanyInput, CompanyStatus, CompanyUpdate } from "./model";

export interface CompanyListFilter {
  status?: CompanyStatus;
  watchlistOnly?: boolean;
  search?: string; // matches name or ticker
}

/** Interface only — implemented in infrastructure/database. */
export interface CompanyRepository {
  getById(ownerId: string, companyId: string): Promise<Company | null>;
  getByTicker(ownerId: string, ticker: string): Promise<Company | null>;
  list(ownerId: string, filter?: CompanyListFilter): Promise<Company[]>;
  create(ownerId: string, input: CompanyInput): Promise<Company>;
  update(ownerId: string, companyId: string, patch: CompanyUpdate): Promise<Company>;
}
