# Document Management

## Purpose

Investment decisions are backed by source material — annual reports, statements,
presentations, meeting notes — that today lives scattered across a filesystem,
email attachments, and a browser's download folder, disconnected from the
investment it pertains to. The `documents` bounded context makes documents a
managed, searchable, versioned part of the system, linked directly to the
holdings, research notes, and portfolios they support.

This is a design specification for the `documents` context
(`domain-driven-design.md`). No application code, storage integration, or OCR
implementation is introduced at this stage.

## Core Entity: `Document`

```ts
interface Document {
  id: string;
  ownerId: string;
  title: string;
  type: DocumentType; // pdf | word | powerpoint | image | note
  category: DocumentCategory; // research_report | ai_generated | meeting_notes | statement | other
  tags: string[];
  storageRef: StoredFileRef; // via StorageProvider, provider-architecture.md
  currentVersion: number;
  versions: DocumentVersion[];
  relationships: DocumentRelationship[];
  extractedText: string | null; // populated by DocumentProvider once processed
  createdAt: string;
  updatedAt: string;
}

interface DocumentVersion {
  version: number;
  storageRef: StoredFileRef;
  uploadedAt: string;
  uploadedBy: string;
  changeNote: string | null;
}

interface DocumentRelationship {
  entityType: "portfolio" | "holding" | "research_note" | "transaction";
  entityId: string;
}
```

`Document` is the aggregate root; versions and relationships are owned by it. A
new upload of an existing document (e.g., a corrected version of a quarterly
report) creates a new `DocumentVersion` rather than overwriting the file, so
history is never silently lost — consistent with the immutability-by-default
posture established in `database-design.md` and `audit-strategy.md`.

## Supported Types

PDF, Word, PowerPoint, images, and plain personal notes (text authored directly in
the app, stored as a "document" so it participates in the same tagging/search/
relationship model rather than being a separate, lesser-featured note system).
Categories cover Research Reports, AI Generated Reports, Meeting Notes, and
statements/other — extensible as new needs arise, following the same pattern as
`FEATURE_FLAGS` and settings namespaces: a typed enum extended deliberately, not a
free-text field.

## Storage and Processing

- Binary storage goes through `StorageProvider` (`provider-architecture.md`) —
  the `documents` context never talks to Supabase Storage (or any future S3
  alternative) directly; it depends on the interface.
- Text extraction, thumbnailing, and (future) OCR go through `DocumentProvider`
  (`provider-architecture.md`). In early phases this may be a `NullDocumentProvider`
  that stores the file with no processing — `extractedText` simply stays `null`
  until a real implementation is composed in. The domain model and UI are written
  against the eventual capability from the start, so enabling OCR later is a
  provider swap, not a redesign.
- A `DocumentUploaded` event (`event-system.md`) is raised on upload, in the
  outbox tier — processing (text extraction, thumbnail generation) happens
  asynchronously after the upload response returns, since these are not
  time-critical to the uploading user.

## Search

- **Phase 1 (available immediately):** search by title, tags, category, and
  relationship (e.g., "documents linked to this holding") — a straightforward
  indexed query against structured metadata, no special infrastructure required.
- **Future — full-text search:** once `extractedText` is populated by a
  `DocumentProvider` implementation, Postgres's native full-text search
  (`tsvector`/`tsquery`) indexes extracted content — deliberately reusing the
  existing database rather than introducing a dedicated search service
  (Elasticsearch, Algolia) that this system's document volume does not justify.
- **Future — semantic search:** once genuinely needed (e.g., "find documents
  discussing supply chain risk" without exact keyword match), embeddings can be
  generated via the `AIProvider` interface already in place and stored using
  Postgres's `pgvector` extension (available on Supabase) — again reusing existing
  infrastructure rather than adding a dedicated vector database. This is
  explicitly a future phase, not built now, but the provider seam means it is
  additive when it happens.

## Tags and Categories

Tags are free-form, user-defined strings (array column, per
`database-design.md`'s conventions) for flexible, personal organization.
Categories are a fixed, typed enum for structural filtering (e.g., the Document
Repository screen's category filter). Both are supported because they answer
different questions: "what type of thing is this" (category) vs. "what does this
relate to, in my own words" (tags) — collapsing them into one mechanism would lose
one of those two capabilities.

## Relationships to Investments

A document can relate to more than one entity (a single annual report might be
linked to both a `Holding` and its `ResearchNote`) — modeled as a list of typed
relationships on the `Document`, rather than a foreign key on the related entity,
because a document's relationships are inherently many-to-many and change over the
document's life independent of the entities it references. `research-workspace.md`
projects a note's linked documents from this same relationship data, not from a
duplicate structure.

## Version History

Every re-upload of a document under the same logical title creates a new
`DocumentVersion`; the document's `currentVersion` pointer advances, but prior
versions remain retrievable. This matters specifically for financial source
material — a restated quarterly report is a materially different fact from the
original, and both should remain accessible with a clear timeline, similar in
spirit to the immutable ledger approach for transactions.

## Permissions

Single-user phase: owner-only access, RLS-enforced like every other table
(`security-principles.md`). Post multi-user: documents inherit visibility from
their primary relationship where sensible (a document linked to a shared
portfolio is visible to that portfolio's members) with the same role-based
read/write distinction (`viewer` vs `editor`/`owner`) used elsewhere — finalized
during Phase 4/6 design alongside `research-workspace.md`'s equivalent question.

## Relationship to Other Documents

- **`provider-architecture.md`** — `StorageProvider` and `DocumentProvider`
  interfaces this context depends on.
- **`event-system.md`** — `DocumentUploaded` event and its subscribers.
- **`research-workspace.md`** — the primary consumer of document relationships.
- **`database-design.md`** — conceptual schema for `documents`,
  `document_versions`, and `document_relationships`.
