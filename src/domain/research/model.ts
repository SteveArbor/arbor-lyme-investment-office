import { z } from "zod";

/**
 * One ResearchNote per company (docs/research-workspace.md). Every section
 * is independently editable — the update schema is fully partial, so a
 * change to one section never touches another. Every update is versioned
 * (see domain/shared/versioning.ts) — never overwritten, per
 * docs/development-roadmap.md Phase 2, item 10.
 */

const researchSectionSchema = z.string().max(20_000).nullable();

export const researchSchema = z.object({
  companyId: z.string().uuid(),
  businessOverview: researchSectionSchema,
  investmentThesis: researchSectionSchema,
  economicMoat: researchSectionSchema,
  management: researchSectionSchema,
  financialStrength: researchSectionSchema,
  capitalAllocation: researchSectionSchema,
  growthDrivers: researchSectionSchema,
  risks: researchSectionSchema,
  monitoringMetrics: researchSectionSchema,
  notes: researchSectionSchema,
});

export type ResearchInput = z.infer<typeof researchSchema>;

export interface ResearchNote extends ResearchInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const researchUpdateSchema = researchSchema.omit({ companyId: true }).partial();
export type ResearchUpdate = z.infer<typeof researchUpdateSchema>;

export const EMPTY_RESEARCH_SECTIONS: Omit<ResearchInput, "companyId"> = {
  businessOverview: null,
  investmentThesis: null,
  economicMoat: null,
  management: null,
  financialStrength: null,
  capitalAllocation: null,
  growthDrivers: null,
  risks: null,
  monitoringMetrics: null,
  notes: null,
};
