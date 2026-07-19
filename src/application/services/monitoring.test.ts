import { describe, expect, it } from "vitest";

import { type DecisionRepository, DecisionService } from "@/domain/decision";
import { type JournalRepository, JournalService } from "@/domain/journal";
import {
  type HoldingRepository,
  type PortfolioRepository,
  PortfolioService,
} from "@/domain/portfolio";
import { type ResearchRepository, ResearchService } from "@/domain/research";
import type { EntityVersion, RecordVersionInput, VersionHistoryRepository } from "@/domain/shared";
import { type ThesisRepository, ThesisService } from "@/domain/thesis";
import { type ValuationRepository, ValuationService } from "@/domain/valuation";

import { buildCompanyMonitoringSnapshot } from "./monitoring";

const OWNER = "user-1";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

class FakeVersionHistoryRepository implements VersionHistoryRepository {
  async recordVersion<T>(input: RecordVersionInput<T>): Promise<EntityVersion<T>> {
    return {
      id: "version-1",
      entityType: input.entityType,
      entityId: input.entityId,
      versionNumber: 1,
      snapshot: input.snapshot,
      changedBy: input.changedBy,
      changedAt: new Date().toISOString(),
      changeNote: input.changeNote ?? null,
    };
  }
  async listVersions() {
    return [];
  }
}

function buildResearchService() {
  const rows = new Map<string, Parameters<ResearchRepository["create"]>[1]>();
  const repo: ResearchRepository = {
    async getByCompanyId(_ownerId, companyId) {
      const row = rows.get(companyId);
      return row
        ? {
            ...row,
            id: `research-${companyId}`,
            ownerId: OWNER,
            createdAt: "now",
            updatedAt: "now",
          }
        : null;
    },
    async create(_ownerId, input) {
      rows.set(input.companyId, input);
      return {
        ...input,
        id: `research-${input.companyId}`,
        ownerId: OWNER,
        createdAt: "now",
        updatedAt: "now",
      };
    },
    async update(_ownerId, researchId, patch) {
      const companyId = researchId.replace("research-", "");
      const existing = rows.get(companyId)!;
      const merged = { ...existing, ...patch };
      rows.set(companyId, merged);
      return { ...merged, id: researchId, ownerId: OWNER, createdAt: "now", updatedAt: "now" };
    },
  };
  return new ResearchService(repo, new FakeVersionHistoryRepository());
}

function buildThesisService() {
  const repo: ThesisRepository = {
    async getByCompanyId() {
      return null;
    },
    async create(ownerId, companyId) {
      return {
        id: `thesis-${companyId}`,
        ownerId,
        companyId,
        statements: [],
        overallStatus: "stable",
        createdAt: "now",
        updatedAt: "now",
      };
    },
    async setStatements(ownerId, thesisId, statements, overallStatus) {
      return {
        id: thesisId,
        ownerId,
        companyId: COMPANY_ID,
        statements,
        overallStatus,
        createdAt: "now",
        updatedAt: "now",
      };
    },
  };
  return new ThesisService(repo, new FakeVersionHistoryRepository());
}

function buildValuationService() {
  const repo: ValuationRepository = {
    async getByCompanyId() {
      return null;
    },
    async create(ownerId, companyId, data) {
      return {
        id: `valuation-${companyId}`,
        ownerId,
        companyId,
        ...data,
        createdAt: "now",
        updatedAt: "now",
      };
    },
    async update(ownerId, valuationId, data) {
      return {
        id: valuationId,
        ownerId,
        companyId: COMPANY_ID,
        ...data,
        createdAt: "now",
        updatedAt: "now",
      };
    },
  };
  return new ValuationService(repo, new FakeVersionHistoryRepository());
}

function buildDecisionService(seedRating?: { rating: string; expectedReturn: number }) {
  const repo: DecisionRepository = {
    async create() {
      throw new Error("not used");
    },
    async getLatestByCompanyId(ownerId, companyId) {
      if (!seedRating) return null;
      return {
        id: "decision-1",
        ownerId,
        companyId,
        inputs: {
          businessQuality: 0.8,
          economicMoat: 0.8,
          financialStrength: 0.8,
          capitalAllocation: 0.8,
          growth: 0.8,
          riskLevel: 0.2,
          expectedReturn: seedRating.expectedReturn,
          marginOfSafety: 0.3,
        },
        qualityScore: 0.8,
        valuationScore: 0.7,
        overallScore: 0.76,
        conviction: 0.8,
        rating: seedRating.rating as never,
        conclusionSource: "deterministic_rules",
        generatedAt: "now",
      };
    },
    async listByCompanyId() {
      return [];
    },
  };
  return new DecisionService(repo);
}

function buildPortfolioService() {
  const portfolios: PortfolioRepository = {
    async getById() {
      return null;
    },
    async list() {
      return [];
    },
    async create() {
      throw new Error("not used");
    },
    async update() {
      throw new Error("not used");
    },
  };
  const holdings: HoldingRepository = {
    async getByCompanyId(ownerId, portfolioId, companyId) {
      return {
        id: "holding-1",
        ownerId,
        portfolioId,
        companyId,
        quantity: 10,
        averageCost: 50,
        targetAllocationPercent: 0.1,
        createdAt: "now",
        updatedAt: "now",
      };
    },
    async listByPortfolioId() {
      return [];
    },
    async upsertPosition() {
      throw new Error("not used");
    },
    async updateTargetAllocation() {
      throw new Error("not used");
    },
    async delete() {},
  };
  return new PortfolioService(portfolios, holdings);
}

function buildJournalService(openEntry: boolean) {
  const repo: JournalRepository = {
    async getById() {
      return null;
    },
    async listByCompanyId(ownerId, companyId) {
      if (!openEntry) return [];
      return [
        {
          id: "journal-1",
          ownerId,
          companyId,
          portfolioId: "portfolio-1",
          status: "open",
          purchaseDate: "now",
          purchasePrice: 50,
          fairValueAtPurchase: 75,
          expectedReturnAtPurchase: 0.2,
          positionSize: 500,
          convictionAtPurchase: 0.8,
          thesisSummary: "test",
          risks: "test",
          invalidationConditions: "test",
          saleDate: null,
          saleReason: null,
          lessonsLearned: null,
          createdAt: "now",
          updatedAt: "now",
        },
      ];
    },
    async listByPortfolioId() {
      return [];
    },
    async create() {
      throw new Error("not used");
    },
    async close() {
      throw new Error("not used");
    },
  };
  return new JournalService(repo);
}

describe("buildCompanyMonitoringSnapshot", () => {
  it("assembles thesis status, valuation figures, latest rating, and risks from their own domains", async () => {
    const snapshot = await buildCompanyMonitoringSnapshot(
      {
        researchService: buildResearchService(),
        thesisService: buildThesisService(),
        valuationService: buildValuationService(),
        decisionService: buildDecisionService({ rating: "buy", expectedReturn: 0.18 }),
        portfolioService: buildPortfolioService(),
        journalService: buildJournalService(true),
      },
      OWNER,
      COMPANY_ID
    );

    expect(snapshot.thesisStatus).toBe("stable");
    expect(snapshot.latestRating).toBe("buy");
    expect(snapshot.expectedReturn).toBe(0.18);
    expect(snapshot.openJournalEntry?.id).toBe("journal-1");
  });

  it("returns null valuationStatus when no current price is supplied", async () => {
    const snapshot = await buildCompanyMonitoringSnapshot(
      {
        researchService: buildResearchService(),
        thesisService: buildThesisService(),
        valuationService: buildValuationService(),
        decisionService: buildDecisionService(),
        portfolioService: buildPortfolioService(),
        journalService: buildJournalService(false),
      },
      OWNER,
      COMPANY_ID
    );

    expect(snapshot.valuationStatus).toBeNull();
    expect(snapshot.latestRating).toBeNull();
    expect(snapshot.openJournalEntry).toBeNull();
  });

  it("computes valuationStatus from the current price when supplied", async () => {
    const snapshot = await buildCompanyMonitoringSnapshot(
      {
        researchService: buildResearchService(),
        thesisService: buildThesisService(),
        valuationService: buildValuationService(),
        decisionService: buildDecisionService(),
        portfolioService: buildPortfolioService(),
        journalService: buildJournalService(false),
      },
      OWNER,
      COMPANY_ID,
      { currentPrice: 0 }
    );

    // Default (empty) valuation has blendedFairValue 0 -> degenerate -> overvalued
    expect(snapshot.valuationStatus).toBe("overvalued");
  });

  it("only fetches a holding when a portfolioId is supplied", async () => {
    const withPortfolio = await buildCompanyMonitoringSnapshot(
      {
        researchService: buildResearchService(),
        thesisService: buildThesisService(),
        valuationService: buildValuationService(),
        decisionService: buildDecisionService(),
        portfolioService: buildPortfolioService(),
        journalService: buildJournalService(false),
      },
      OWNER,
      COMPANY_ID,
      { portfolioId: "portfolio-1" }
    );
    expect(withPortfolio.holding?.quantity).toBe(10);

    const withoutPortfolio = await buildCompanyMonitoringSnapshot(
      {
        researchService: buildResearchService(),
        thesisService: buildThesisService(),
        valuationService: buildValuationService(),
        decisionService: buildDecisionService(),
        portfolioService: buildPortfolioService(),
        journalService: buildJournalService(false),
      },
      OWNER,
      COMPANY_ID
    );
    expect(withoutPortfolio.holding).toBeNull();
  });
});
