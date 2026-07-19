# domain/decision — Planned (Phase 6)

**Status:** Not implemented. This directory contains no code yet — do not import
from this path.

**Purpose:** combines trusted output from `portfolio`, `market`, `analytics`,
`rules`, and `research` into structured, explainable `DecisionRecommendation`
output. **This domain never places a trade.** AI (via `AIProvider`) may be
consulted for narrative synthesis only — never as the source of a financial
calculation.

**Design reference:** `docs/decision-engine.md` (full specification, including
the explainability contract and recommendation statuses), ADR 0014.

**Target phase:** Phase 6 — Decision Engine (`docs/development-roadmap.md`).
