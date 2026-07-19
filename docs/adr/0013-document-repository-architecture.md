# 0013. Document Repository Architecture

**Status:** Accepted

## Context

Source material supporting investment decisions (annual reports, statements,
presentations, meeting notes) currently has no managed home, and future
requirements (search, OCR, semantic search) need a data model that supports them
without a redesign when they arrive.

## Decision

Introduce `documents` as a first-class bounded context with `Document` as its
aggregate root (owning versions and typed relationships to other entities),
storage mediated by `StorageProvider` and processing (text extraction, OCR) by
`DocumentProvider` (both `provider-architecture.md`), search starting with
structured metadata and Postgres full-text search, with `pgvector`-based semantic
search as an anticipated future addition — detailed in `document-management.md`.
Documentation only at this stage; no implementation, storage integration, or OCR.

## Consequences

- Documents are linked to the entities they support (holdings, research notes,
  portfolios, transactions) via an explicit many-to-many relationship model, not
  bolted onto any single entity as a foreign key.
- Version history is preserved on re-upload rather than overwritten, consistent
  with the project's immutability-by-default posture for financial source
  material.
- Choosing a `NullDocumentProvider` as the initial (no-op) implementation lets
  document storage ship well before OCR/text-extraction capability exists,
  without a later schema change — `extractedText` simply starts `null`.
- Committing to Postgres full-text search and `pgvector` (rather than a dedicated
  search/vector service) keeps operational surface area minimal, consistent with
  ADR 0003's reasoning, at the cost of depending on Postgres's search capability
  scaling adequately for this system's document volume (judged acceptable at
  anticipated scale).

## Alternatives Considered

- **A dedicated document/search service (e.g., Elasticsearch, or a SaaS document
  management product)** — rejected: disproportionate operational and cost
  overhead for a private application's document volume; revisit only if actual
  volume/query needs prove Postgres insufficient.
- **Storing documents as a generic attachment on whichever entity uploaded them**
  — rejected: does not support a document relating to multiple entities (e.g., one
  annual report linked to both a holding and its research note).

## Future Review Criteria

Revisit the Postgres-native search approach if document volume or full-text query
complexity genuinely exceeds what `tsvector`/`pgvector` handle well; revisit the
`NullDocumentProvider` default once a real OCR/extraction implementation is
prioritized on the roadmap.
