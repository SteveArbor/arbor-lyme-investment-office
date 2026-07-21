import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/config/env.server";
import { AuditService } from "@/domain/audit";
import { CompanyService } from "@/domain/company";
import { DecisionService } from "@/domain/decision";
import { JournalService } from "@/domain/journal";
import type { SecurityPriceProviderMap } from "@/domain/market";
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
  SupabaseFxRateRepository,
  SupabaseHoldingRepository,
  SupabaseJournalRepository,
  SupabasePortfolioRepository,
  SupabaseQuoteRepository,
  SupabaseResearchRepository,
  SupabaseSettingsRepository,
  SupabaseThesisRepository,
  SupabaseTransactionRepository,
  SupabaseValuationRepository,
  SupabaseVersionHistoryRepository,
} from "@/infrastructure/database";
import { InProcessEventBus } from "@/infrastructure/events";
import {
  EcbFxRateProvider,
  RoutingPriceEngine,
  TwelveDataMarketStatusProvider,
  TwelveDataPriceProvider,
} from "@/infrastructure/market-data";
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

  // Price Engine (ADR 0030/0031, Stage 1). Twelve Data is assigned to
  // every exchange-traded slot (equity/etf/investment_trust share the
  // same real-world quote shape); `fund` is deliberately left unset —
  // Stage 2 hasn't wired a fund provider yet, and `RoutingPriceEngine`
  // throws a clear error naming the missing type rather than silently
  // returning nothing if something ever asks it for one.
  const twelveDataApiKey = getServerEnv().TWELVE_DATA_API_KEY;
  const twelveDataPriceProvider = new TwelveDataPriceProvider(twelveDataApiKey);
  const securityPriceProviders: SecurityPriceProviderMap = {
    equity: twelveDataPriceProvider,
    etf: twelveDataPriceProvider,
    investment_trust: twelveDataPriceProvider,
  };
  const priceEngine = new RoutingPriceEngine(securityPriceProviders);
  const marketStatusProvider = new TwelveDataMarketStatusProvider(twelveDataApiKey);
  const quoteRepository = new SupabaseQuoteRepository(client);

  // FX conversion (ADR 0032). The ECB's daily reference-rate feed is free,
  // needs no API key, and answers every currency pair from one HTTP call
  // — see docs/adr/0032-fx-conversion-and-live-quote-propagation.md for
  // the provider evaluation. `fxRateRepository` mirrors `quoteRepository`:
  // owner-scoped, "last known good" persistence, never deleted on a
  // failed refresh.
  const fxRateProvider = new EcbFxRateProvider();
  const fxRateRepository = new SupabaseFxRateRepository(client);

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
    priceEngine,
    marketStatusProvider,
    quoteRepository,
    fxRateProvider,
    fxRateRepository,
  };
}
