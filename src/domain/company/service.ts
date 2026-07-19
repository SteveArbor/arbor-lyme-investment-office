import {
  createDomainEvent,
  type DomainEvent,
  NotFoundError,
  ValidationError,
} from "@/domain/shared";

import { type Company, companySchema, companyUpdateSchema } from "./model";
import type { CompanyListFilter, CompanyRepository } from "./repository";

export interface CompanyCreatedPayload {
  companyId: string;
  ticker: string;
}

export interface CompanyUpdatedPayload {
  companyId: string;
  before: Company;
  after: Company;
  changedFields: string[];
}

/**
 * Business logic for the Company aggregate. Framework-independent — no
 * Next.js, no Supabase (docs/domain-driven-design.md's dependency rule).
 */
export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  async getCompany(ownerId: string, companyId: string): Promise<Company> {
    const company = await this.repository.getById(ownerId, companyId);
    if (!company) {
      throw new NotFoundError("Company", companyId);
    }
    return company;
  }

  async listCompanies(ownerId: string, filter?: CompanyListFilter): Promise<Company[]> {
    return this.repository.list(ownerId, filter);
  }

  /** Batch read for multi-company views (e.g. a portfolio's holdings) — one query, not one per company. */
  async getCompanies(ownerId: string, companyIds: string[]): Promise<Company[]> {
    return this.repository.getByIds(ownerId, companyIds);
  }

  async createCompany(
    ownerId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ company: Company; event: DomainEvent<CompanyCreatedPayload> }> {
    const parsed = companySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid company data",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const existing = await this.repository.getByTicker(ownerId, parsed.data.ticker);
    if (existing) {
      throw new ValidationError("A company with this ticker already exists", {
        ticker: ["This ticker is already tracked"],
      });
    }

    const company = await this.repository.create(ownerId, parsed.data);

    const event = createDomainEvent<CompanyCreatedPayload>({
      type: "CompanyCreated",
      actorId: ownerId,
      correlationId,
      payload: { companyId: company.id, ticker: company.ticker },
    });

    return { company, event };
  }

  async updateCompany(
    ownerId: string,
    companyId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ company: Company; event: DomainEvent<CompanyUpdatedPayload> }> {
    const parsed = companyUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid company update",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("No fields provided to update", {});
    }

    const before = await this.getCompany(ownerId, companyId);
    const after = await this.repository.update(ownerId, companyId, parsed.data);
    const changedFields = Object.keys(parsed.data);

    const event = createDomainEvent<CompanyUpdatedPayload>({
      type: "CompanyUpdated",
      actorId: ownerId,
      correlationId,
      payload: { companyId, before, after, changedFields },
    });

    return { company: after, event };
  }
}
