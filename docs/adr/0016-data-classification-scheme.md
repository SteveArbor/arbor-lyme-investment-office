# 0016. Formal Data Classification Scheme

**Status:** Accepted

## Context

`security-principles.md` and `audit-strategy.md` both reasoned informally about
data sensitivity (e.g., "never log secrets," "audit records must not contain
passwords") without a named, reusable classification scheme. As the system grows
more data categories (AI prompts/responses, research documents, audit events),
informal per-document reasoning risks inconsistency — the same kind of data being
treated differently depending on which document happened to mention it first.

## Decision

Adopt a four-level classification scheme — Public, Internal, Confidential, Highly
Confidential — defined in `data-classification.md`, with every data category the
system currently handles (or will handle imminently) explicitly classified
against it, and handling principles (retention, redaction, access) stated per
level rather than per data type.

## Consequences

- Future documents and features can classify new data types by reference to one
  scheme ("this is Confidential, therefore X, Y, Z apply") instead of reasoning
  about handling from scratch each time.
- Makes explicit, and therefore reviewable, decisions that were previously
  implicit — e.g., that a database backup inherits the classification of its
  contents, or that AI prompts/responses are Confidential by default before any
  AI feature exists to enforce it against.
- Adds one more document to keep in sync as new data types are introduced —
  accepted as a small, worthwhile cost given the alternative (inconsistent ad hoc
  handling of sensitive financial data).

## Alternatives Considered

- **No formal scheme; continue reasoning per-document** — rejected: already
  showing inconsistency risk as the system's data surface grows (AI content,
  documents, audit events all introduced in the same documentation round without
  a shared vocabulary for their sensitivity).
- **A more granular scheme (e.g., 6–8 levels, or per-regulation categories like
  GDPR special-category data)** — rejected as more precision than this system's
  current single-jurisdiction, small-user-base context requires; revisit if a
  specific regulatory requirement demands finer categories.

## Future Review Criteria

Revisit if the system ever handles data subject to a specific regulatory regime
(e.g., data protection law requiring a formal "special category" designation)
that this four-level scheme cannot adequately express — evaluated if/when such a
requirement becomes concrete, not speculatively now.
