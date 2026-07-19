/**
 * Feature flag registry — Foundation implementation.
 *
 * docs/feature-flags.md specifies the full future design: a database-backed
 * registry with user-level overrides, resolved through the same layered
 * precedence chain as settings, behind a FeatureFlagProvider interface
 * (docs/provider-architecture.md). None of that is needed yet: Foundation
 * has a single user and exactly one flag turned on, so a static, typed,
 * local registry is the correct scope now (YAGNI,
 * docs/engineering-standards.md) — building the database table and
 * override machinery for a registry nobody can differ on yet would be
 * speculative.
 *
 * Flags represent product *capability availability* (is this module built
 * and released), not ordinary user preferences — see docs/feature-flags.md.
 *
 * Migration path when this needs to grow: introduce `feature_flags` /
 * `user_feature_flags` tables (docs/database-design.md already anticipates
 * their shape) and a FeatureFlagProvider implementation reading them,
 * without changing the FeatureFlagKey type or call sites — only
 * `isFeatureEnabled`'s implementation changes from a static lookup to a
 * database read.
 */

export const FEATURE_FLAGS = {
  INVESTMENT_OFFICE: "investmentOffice",
  RESEARCH_WORKSPACE: "researchWorkspace",
  DOCUMENT_REPOSITORY: "documentRepository",
  MARKET_DATA: "marketData",
  RULES_ENGINE: "rulesEngine",
  DECISION_ENGINE: "decisionEngine",
  AI_BRIEFING: "aiBriefing",
  BROKER_INTEGRATION: "brokerIntegration",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Only investmentOffice is enabled — every other module named here is
 * designed (see the relevant docs/*.md) but not built, per
 * docs/development-roadmap.md's phase sequence. Flip a flag to `true` only
 * once its phase actually ships; leaving one on ahead of its
 * implementation would expose a route/screen with nothing behind it.
 */
const FOUNDATION_FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  investmentOffice: true,
  researchWorkspace: false,
  documentRepository: false,
  marketData: false,
  rulesEngine: false,
  decisionEngine: false,
  aiBriefing: false,
  brokerIntegration: false,
};

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FOUNDATION_FLAG_DEFAULTS[flag];
}

export function getAllFeatureFlags(): Record<FeatureFlagKey, boolean> {
  return { ...FOUNDATION_FLAG_DEFAULTS };
}
