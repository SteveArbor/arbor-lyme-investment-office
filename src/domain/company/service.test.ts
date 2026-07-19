import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/domain/shared";

import type { Company, CompanyInput, CompanyUpdate } from "./model";
import type { CompanyListFilter, CompanyRepository } from "./repository";
import { CompanyService } from "./service";

let nextId = 1;

class FakeCompanyRepository implements CompanyRepository {
  private readonly rows = new Map<string, Company>();

  async getById(ownerId: string, companyId: string): Promise<Company | null> {
    const row = this.rows.get(companyId);
    return row && row.ownerId === ownerId ? row : null;
  }

  async getByIds(ownerId: string, companyIds: string[]): Promise<Company[]> {
    return [...this.rows.values()].filter(
      (row) => row.ownerId === ownerId && companyIds.includes(row.id)
    );
  }

  async getByTicker(ownerId: string, ticker: string): Promise<Company | null> {
    for (const row of this.rows.values()) {
      if (row.ownerId === ownerId && row.ticker === ticker) return row;
    }
    return null;
  }

  async list(ownerId: string, filter?: CompanyListFilter): Promise<Company[]> {
    return [...this.rows.values()].filter((row) => {
      if (row.ownerId !== ownerId) return false;
      if (filter?.status && row.status !== filter.status) return false;
      if (filter?.watchlistOnly && !row.watchlist) return false;
      return true;
    });
  }

  async create(ownerId: string, input: CompanyInput): Promise<Company> {
    const now = new Date().toISOString();
    const company: Company = {
      ...input,
      id: `company-${nextId++}`,
      ownerId,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(company.id, company);
    return company;
  }

  async update(ownerId: string, companyId: string, patch: CompanyUpdate): Promise<Company> {
    const existing = this.rows.get(companyId);
    if (!existing || existing.ownerId !== ownerId) throw new Error("not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.rows.set(companyId, updated);
    return updated;
  }
}

const validInput = {
  name: "Example Corp",
  ticker: "exmp",
  exchange: "NASDAQ",
  sector: "Technology",
  industry: "Software",
  currency: "usd",
  status: "researching" as const,
  watchlist: false,
  notes: null,
  profile: null,
};

describe("CompanyService", () => {
  it("creates a company, uppercasing ticker/currency, and returns a CompanyCreated event", async () => {
    const service = new CompanyService(new FakeCompanyRepository());

    const result = await service.createCompany("user-1", validInput, "corr-1");

    expect(result.company.ticker).toBe("EXMP");
    expect(result.company.currency).toBe("USD");
    expect(result.event.type).toBe("CompanyCreated");
    expect(result.event.payload.ticker).toBe("EXMP");
  });

  it("rejects a duplicate ticker for the same owner", async () => {
    const service = new CompanyService(new FakeCompanyRepository());
    await service.createCompany("user-1", validInput, "corr-1");

    await expect(service.createCompany("user-1", validInput, "corr-2")).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("allows the same ticker for a different owner", async () => {
    const service = new CompanyService(new FakeCompanyRepository());
    await service.createCompany("user-1", validInput, "corr-1");

    await expect(service.createCompany("user-2", validInput, "corr-2")).resolves.toBeDefined();
  });

  it("rejects an invalid currency code", async () => {
    const service = new CompanyService(new FakeCompanyRepository());

    await expect(
      service.createCompany("user-1", { ...validInput, currency: "US" }, "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for a company owned by someone else", async () => {
    const service = new CompanyService(new FakeCompanyRepository());
    const { company } = await service.createCompany("user-1", validInput, "corr-1");

    await expect(service.getCompany("user-2", company.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates a company and returns a CompanyUpdated event with before/after", async () => {
    const service = new CompanyService(new FakeCompanyRepository());
    const { company } = await service.createCompany("user-1", validInput, "corr-1");

    const result = await service.updateCompany(
      "user-1",
      company.id,
      { status: "monitoring", watchlist: true },
      "corr-2"
    );

    expect(result.company.status).toBe("monitoring");
    expect(result.company.watchlist).toBe(true);
    expect(result.event.payload.changedFields).toEqual(["status", "watchlist"]);
    expect(result.event.payload.before.status).toBe("researching");
    expect(result.event.payload.after.status).toBe("monitoring");
  });

  it("filters the list by status and watchlist", async () => {
    const repo = new FakeCompanyRepository();
    const service = new CompanyService(repo);
    await service.createCompany("user-1", { ...validInput, ticker: "AAA", watchlist: true }, "c1");
    await service.createCompany(
      "user-1",
      { ...validInput, ticker: "BBB", status: "monitoring" },
      "c2"
    );

    const watchlisted = await service.listCompanies("user-1", { watchlistOnly: true });
    expect(watchlisted).toHaveLength(1);
    expect(watchlisted[0].ticker).toBe("AAA");

    const monitoring = await service.listCompanies("user-1", { status: "monitoring" });
    expect(monitoring).toHaveLength(1);
    expect(monitoring[0].ticker).toBe("BBB");
  });

  it("getCompanies batch-reads only the requested companies for the requesting owner", async () => {
    const repo = new FakeCompanyRepository();
    const service = new CompanyService(repo);
    const a = await service.createCompany("user-1", { ...validInput, ticker: "AAA" }, "c1");
    const b = await service.createCompany("user-1", { ...validInput, ticker: "BBB" }, "c2");
    await service.createCompany("user-1", { ...validInput, ticker: "CCC" }, "c3");

    const companies = await service.getCompanies("user-1", [
      a.company.id,
      b.company.id,
      "missing-id",
    ]);

    expect(companies.map((company) => company.ticker).sort()).toEqual(["AAA", "BBB"]);
  });

  it("getCompanies returns nothing for a company owned by someone else", async () => {
    const repo = new FakeCompanyRepository();
    const service = new CompanyService(repo);
    const a = await service.createCompany("user-1", validInput, "c1");

    const companies = await service.getCompanies("user-2", [a.company.id]);

    expect(companies).toHaveLength(0);
  });
});
