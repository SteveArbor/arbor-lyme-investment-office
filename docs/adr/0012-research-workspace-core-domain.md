# 0012. Research Workspace as a Core Domain

**Status:** Accepted

## Context

Investment reasoning (thesis, bull/bear case, risks, valuation judgment) currently
has no durable home in the system's design — it would otherwise live in scattered
notes or memory, disconnected from the holdings and transactions it justifies,
undermining the traceability goals in `vision.md`.

## Decision

Introduce `research` as a first-class bounded context (`domain-driven-design.md`),
with `ResearchNote` as its aggregate root, structured into named sections (thesis,
bull case, bear case, catalysts, risks, competitor analysis, management
assessment, valuation notes, personal notes, AI summary), plus a curated review
history distinct from the generic audit log — detailed in
`research-workspace.md`. Documentation only at this stage; no implementation.

## Consequences

- Investment reasoning becomes queryable, versioned, and reviewable over time,
  directly supporting the "why did we buy this, does the reasoning still hold"
  use case named in `vision.md`.
- Structured sections (rather than one freeform text field) allow future AI
  tooling to target individual sections without fragile text parsing.
- Review history is a second, human-curated timeline alongside the audit log —
  two mechanisms with different purposes, an intentional distinction that must
  stay clear during implementation to avoid confusing the two.
- Adds a moderately complex aggregate (many named sections, versioned review
  entries, document relationships) — justified by how central this capability is
  to the product's actual value proposition, not incidental scope creep.

## Alternatives Considered

- **A single freeform "notes" field per asset** — rejected: far simpler, but loses
  the ability to target, review, or AI-assist individual sections independently,
  which is central to the module's value.
- **Treating research notes as a type of `Document`** (`document-management.md`)
  rather than a distinct context — rejected: a research note is structured
  domain data with its own lifecycle (review history, AI summary regeneration),
  not a stored file; documents are linked _to_ research notes, not a substitute
  for them.

## Future Review Criteria

Revisit the personal-notes-visibility question (flagged as unresolved in
`research-workspace.md`) once Phase 4 (multi-user) design begins, and revisit
whether structured sections need to become user-customizable if real usage shows
the fixed section list is too rigid.
