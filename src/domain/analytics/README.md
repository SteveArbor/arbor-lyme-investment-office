# domain/analytics — Planned (Phase 4)

**Status:** Not implemented. This directory contains no code yet — do not import
from this path.

**Purpose:** deterministic valuation, allocation, and performance calculations
derived from `portfolio`, `trading`, and `market`. This is the authoritative
source of every financial figure the rest of the system displays or reasons
about — see `docs/decision-engine.md`'s explicit constraint that AI never
computes these figures.

**Design reference:** `docs/architecture.md`, `docs/data-flow.md` §3
(Recalculating a Portfolio), `docs/engineering-standards.md` (highest
test-coverage bar in the codebase applies here).

**Target phase:** Phase 4 — Portfolio Analytics and Performance Calculations
(`docs/development-roadmap.md`).
