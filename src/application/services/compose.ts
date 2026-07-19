import type { SupabaseClient } from "@supabase/supabase-js";

import { AuditService } from "@/domain/audit";
import { CompanyService } from "@/domain/company";
import { DecisionService } from "@/domain/decision";
import { JournalService } from "@/domain/journal";
import { PortfolioService } from "@/domain/portfolio";
import { ResearchService } from "@/domain/research";
import { SettingsService } from "@/domain/settings";
import { ThesisService } from "@/domain/thesis";
import { TradingService } from "@/domain/trading";
import { ValuationService } from "@/domain/valuation";
import {
  SupabaseAuditRepository,
  SupabaseCompanyRepository,
  SupabaseDecisionRepository,
  SupabaseHoldingRepository,
  SupabaseJournalRepository,
  SupabasePortfolioRepository,
  SupabaseResearchRepository,
  SupabaseSettingsRepository,
  SupabaseThesisRepository,
  SupabaseTransactionRepository,
  SupabaseValuationRepository,
  SupabaseVersionHistoryRepository,
} from "@/infrastructure/database";
import { InProcessEventBus } from "@/infrastructure/events";
import type { Database } from "@/types/database";

import { registerAuditSubscriptions } from "./audit-subscribers";

/**
 * The application's composition root: the one place that knows concrete
 * domain-service and repository classes exist (mirrors
 * docs/provider-architecture.md's "small composition module" pattern).
 * Server Actions and Route Handlers call this once per request rather than
 * constructing services themselves.
 *
 * A fresh event bus is built per request — see docs/event-system.md's
 * serverless-constraint explanation for why this cannot be a shared,
 * long-lived instance.
 */
export function composeAppServices(client: SupabaseClient<Database>) {
  const eventBus = new InProcessEventBus();
  const settingsService = new SettingsService(new SupabaseSettingsRepository(client));
  const auditService = new AuditService(new SupabaseAuditRepository(client));
  const companyService = new CompanyService(new SupabaseCompanyRepository(client));

  const versionHistoryRepository = new SupabaseVersionHistoryRepository(client);
  const researchService = new ResearchService(
    new SupabaseResearchRepository(client),
    versionHistoryRepository
  );
  const thesisService = new ThesisService(
    new SupabaseThesisRepository(client),
    versionHistoryRepository
  );
  const valuationService = new ValuationService(
    new SupabaseValuationRepository(client),
    versionHistoryRepository
  );
  const decisionService = new DecisionService(new SupabaseDecisionRepository(client));
  const portfolioRepository = new SupabasePortfolioRepository(client);
  const holdingRepository = new SupabaseHoldingRepository(client);
  const portfolioService = new PortfolioService(portfolioRepository, holdingRepository);
  const tradingService = new TradingService(
    new SupabaseTransactionRepository(client),
    holdingRepository,
    portfolioRepository
  );
  const journalService = new JournalService(new SupabaseJournalRepository(client));

  registerAuditSubscriptions(eventBus, auditService);

  return {
    eventBus,
    settingsService,
    auditService,
    companyService,
    researchService,
    thesisService,
    valuationService,
    decisionService,
    portfolioService,
    tradingService,
    journalService,
  };
}
