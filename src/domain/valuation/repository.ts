import type { Valuation, ValuationScenario } from "./model";

export interface ValuationWriteData {
  projectionYears: number;
  requiredReturn: number;
  marginOfSafety: number;
  bear: ValuationScenario;
  base: ValuationScenario;
  bull: ValuationScenario;
  blendedFairValue: number;
}

/** Interface only — implemented in infrastructure/database. */
export interface ValuationRepository {
  getByCompanyId(ownerId: string, companyId: string): Promise<Valuation | null>;
  /** Batch read for multi-company views — never creates a row as a side effect. */
  listByCompanyIds(ownerId: string, companyIds: string[]): Promise<Valuation[]>;
  create(ownerId: string, companyId: string, data: ValuationWriteData): Promise<Valuation>;
  update(ownerId: string, valuationId: string, data: ValuationWriteData): Promise<Valuation>;
}
