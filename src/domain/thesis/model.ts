import { z } from "zod";

/**
 * The Thesis Engine (docs/development-roadmap.md Phase 2, item 3).
 * Sibling to `research`, not nested inside it — see
 * docs/domain-driven-design.md's bounded-context table for why.
 */

export const THESIS_STATEMENT_STATUS_OPTIONS = [
  "strengthening",
  "stable",
  "weakening",
  "broken",
] as const;

export type ThesisStatementStatus = (typeof THESIS_STATEMENT_STATUS_OPTIONS)[number];

export const thesisStatementSchema = z.object({
  id: z.string().uuid().optional(), // absent when creating a new statement
  description: z.string().min(1, "Description is required").max(2000),
  confidence: z.number().min(0).max(1),
  status: z.enum(THESIS_STATEMENT_STATUS_OPTIONS),
});

export type ThesisStatementInput = z.infer<typeof thesisStatementSchema>;

export type ThesisStatement = Required<ThesisStatementInput>;

export interface Thesis {
  id: string;
  ownerId: string;
  companyId: string;
  statements: ThesisStatement[];
  overallStatus: ThesisStatementStatus;
  createdAt: string;
  updatedAt: string;
}

export const thesisStatementsUpdateSchema = z.object({
  statements: z.array(thesisStatementSchema).max(50),
});

export type ThesisStatementsUpdate = z.infer<typeof thesisStatementsUpdateSchema>;

const STATUS_SCORE: Record<Exclude<ThesisStatementStatus, "broken">, number> = {
  strengthening: 1,
  stable: 0,
  weakening: -1,
};

/**
 * Deterministic, explainable overall-status calculation
 * (docs/development-roadmap.md Phase 2, item 3: "Overall thesis status
 * should be calculated automatically"):
 *
 * 1. Any single "broken" statement breaks the whole thesis — a
 *    conservative rule appropriate for investment risk management (one
 *    failed pillar is enough to invalidate the case).
 * 2. Otherwise, a confidence-weighted average of the remaining
 *    strengthening(+1)/stable(0)/weakening(-1) statements determines the
 *    result, with a small deadband around zero to avoid flipping status
 *    on marginal, low-confidence signals.
 */
export function calculateOverallThesisStatus(statements: ThesisStatement[]): ThesisStatementStatus {
  if (statements.length === 0) return "stable";
  if (statements.some((statement) => statement.status === "broken")) return "broken";

  const totalWeight = statements.reduce((sum, statement) => sum + statement.confidence, 0);
  if (totalWeight === 0) return "stable";

  const weightedScore =
    statements.reduce(
      (sum, statement) =>
        sum +
        STATUS_SCORE[statement.status as Exclude<ThesisStatementStatus, "broken">] *
          statement.confidence,
      0
    ) / totalWeight;

  const DEADBAND = 0.15;
  if (weightedScore > DEADBAND) return "strengthening";
  if (weightedScore < -DEADBAND) return "weakening";
  return "stable";
}
