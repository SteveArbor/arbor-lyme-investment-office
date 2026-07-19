# Research Workspace

## Purpose

Investment decisions are currently informed by reasoning that lives in someone's
head, an email, or a scattered note — and is lost or unfindable by the time it
would be most useful (revisiting a position eighteen months later and asking "why
did we buy this, and does that reasoning still hold"). The Research Workspace makes
investment reasoning a durable, structured, queryable part of the system, on equal
footing with the transactions and holdings it justifies.

This document is a design specification for the `research` bounded context
(`domain-driven-design.md`). No application code is introduced at this stage.

## Core Entity: `ResearchNote`

Every investment (an `Asset`, from the `market` context) may have an associated
`ResearchNote` — the aggregate root of the `research` context. A note is
structured, not a single freeform text blob, so that each section can be
individually reviewed, versioned, and (for the AI Summary) regenerated without
disturbing the rest.

```ts
interface ResearchNote {
  id: string;
  assetId: string; // references market.Asset
  ownerId: string;
  thesis: string;
  bullCase: string;
  bearCase: string;
  catalysts: string;
  risks: string;
  competitorAnalysis: string;
  managementAssessment: string;
  valuationNotes: string;
  personalNotes: string;
  aiSummary: AISummarySection | null;
  documents: DocumentRef[]; // see document-management.md
  reviewHistory: ResearchReviewEntry[];
  createdAt: string;
  updatedAt: string;
}
```

Each free-text field above is deliberately its own named section rather than a
single "notes" field — this is what lets the UI (`product-specification.md`) render
a consistent structure across every investment, and what lets future AI tooling
target a specific section (e.g., "regenerate only the Bear Case given the last
quarter's results") without a fragile parse of unstructured text.

## AI Summary

`aiSummary` is generated on demand via the `ai` context, which calls the active
`AIProvider` (`provider-architecture.md`) with the note's other sections plus
recent price/fundamental context as input, producing a concise synthesis. It is
stored, not regenerated on every view, and is explicitly labeled with the
provider/model and generation timestamp — an AI summary is a snapshot of a
judgment at a point in time, not a live-computed value, and should read as such to
the user. Regenerating it is an explicit user action, raising `ResearchUpdated`
(`event-system.md`) and producing an audit record like any other update.

## Review History

```ts
interface ResearchReviewEntry {
  id: string;
  reviewedAt: string;
  reviewerId: string;
  summary: string; // "what changed and why" for this review
  snapshotBefore: Partial<ResearchNote>; // relevant fields at time of review
}
```

A review entry is created whenever a note's core sections (thesis, bull/bear case,
risks) are substantively revisited — not on every keystroke, but on a deliberate
"mark as reviewed" action, distinct from routine editing. This produces a
timeline of judgment over the life of a position: "in March we believed X; by
September we'd revised to Y because Z" — the single most valuable artifact this
module produces, and the reason review history is a first-class list on the
aggregate rather than derived from generic audit records. (The audit log,
`audit-strategy.md`, still separately records every edit for compliance purposes;
review history is a curated, human-authored subset intended for the user's own
future reference, not a duplicate mechanism.)

## Document Relationships

A `ResearchNote` links to documents (`document-management.md`) relevant to that
investment:

- Annual Reports
- Quarterly Reports
- Investor Presentations
- Analyst Notes
- Meeting Notes

The relationship is owned by the `documents` context (a `Document` records which
entity/entities it relates to — see `document-management.md`'s relationship
model), and `ResearchNote.documents` is a read-oriented projection of that
relationship for convenient display, not a second source of truth for the link.

## Permissions

In the single-user phase, a `ResearchNote` is visible/editable only by its owner,
consistent with the rest of the system. Post multi-user (`architecture.md`'s
evolution path), research notes follow the same membership-based RLS model as
portfolios — a household's shared research is visible to members with at least
`viewer` access, editable by `editor`/`owner` roles. Personal Notes specifically
may warrant a stricter, always-private visibility even within a shared household —
this is flagged as a product decision to confirm during Phase 4 design, not
resolved here.

## Relationship to Other Domains

- **`market`** — a `ResearchNote` belongs to exactly one `Asset`; `market` has no
  awareness of `research` (dependency points one way, per
  `domain-driven-design.md`).
- **`portfolio`/`trading`** — surfaced together in the UI (a holding's detail page
  links to its research note) but not structurally coupled — a note can exist for
  an asset the user does not currently hold (e.g., a watchlist candidate),
  supporting a "future OpportunityGenerated → research" workflow.
- **`ai`** — supplies the AI Summary via `AIProvider`.
- **`documents`** — supplies linked source material.
- **`audit`** — every substantive change raises `ResearchUpdated`.

## Non-Goals (This Phase)

- No collaborative real-time co-editing of a note (a future consideration once
  multi-user households actively share research simultaneously — not needed for a
  single user or asynchronous household use).
- No automated thesis generation without user review — the AI Summary assists, it
  does not replace the human-authored thesis fields, and is never presented as
  though it were the user's own judgment.
