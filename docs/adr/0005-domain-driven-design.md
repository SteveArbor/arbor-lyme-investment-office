# 0005. Adopt Domain-Driven Design Folder Structure

**Status:** Accepted

## Context

The domain is expanding from single-concern portfolio CRUD to multiple distinct
areas (trading, market data, analytics, research, AI, alerts, documents, settings,
audit), each with its own vocabulary and rate of change. A flat `lib/`/`domain/`
split, adequate for one concern, risks becoming an unstructured junk drawer with
silent cross-coupling as more contexts are added.

## Decision

Adopt Domain-Driven Design's bounded-context and dependency-inversion patterns
(not the full tactical DDD pattern catalog) as the codebase's core structural
principle, per `domain-driven-design.md`: a `domain/<context>/` folder per bounded
context, with framework-independent logic, an explicit public interface per
context, and `infrastructure/` implementing interfaces the domain layer defines.

## Consequences

- Business logic is unit-testable without a database, HTTP server, or Next.js
  runtime.
- Vendor/framework replacement (a new database host, a new AI vendor) is confined
  to `infrastructure/`.
- Cross-context coupling requires a deliberate choice (a direct call to a public
  interface, or an event) rather than an accidental import — a structural
  deterrent, not just a documented convention.
- Adds a small amount of up-front ceremony (defining interfaces, public exports)
  compared to just importing whatever is convenient — accepted as worthwhile given
  the project's explicit multi-year horizon.

## Alternatives Considered

- **Flat feature-folder structure** (`features/portfolio/`, `features/trading/`,
  each free to import anything) — rejected: does not prevent the cross-coupling
  this decision exists to avoid.
- **Full tactical DDD** (specifications, factories, generic repository
  abstractions for every entity) — rejected as over-engineering for this project's
  size; only the parts that earn their cost (bounded contexts, dependency
  inversion, aggregates where a real invariant exists) are adopted.
- **Layered-by-technical-concern structure** (`controllers/`, `services/`,
  `models/` globally) — rejected: groups code by technical role rather than
  business meaning, which is precisely what makes large codebases hard to
  navigate by domain.

## Future Review Criteria

Revisit if a bounded context's internal structure genuinely doesn't fit the
default skeleton (noted as expected/acceptable in `domain-driven-design.md`), or
if the dependency rule proves to add friction disproportionate to the coupling it
prevents — evaluated with real evidence after Phase 2 implementation, not
speculatively.
