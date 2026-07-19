/**
 * Shared version-history contract, used by every domain the Phase 2 brief
 * requires never to overwrite historical data (Research, Valuation,
 * Thesis, Assumptions — docs/development-roadmap.md Phase 2, item 10).
 * Built once here rather than four times, per the project's own
 * "avoid duplicated logic" architecture rule.
 */

export interface EntityVersion<TSnapshot = unknown> {
  id: string;
  entityType: string;
  entityId: string;
  versionNumber: number;
  snapshot: TSnapshot;
  changedBy: string;
  changedAt: string;
  changeNote: string | null;
}

export interface RecordVersionInput<TSnapshot> {
  ownerId: string;
  entityType: string;
  entityId: string;
  snapshot: TSnapshot;
  changedBy: string;
  changeNote?: string | null;
}

/** Interface only — implemented in infrastructure/database. */
export interface VersionHistoryRepository {
  recordVersion<TSnapshot>(input: RecordVersionInput<TSnapshot>): Promise<EntityVersion<TSnapshot>>;
  listVersions<TSnapshot>(
    ownerId: string,
    entityType: string,
    entityId: string
  ): Promise<EntityVersion<TSnapshot>[]>;
}
