# domain/ai — Planned (Phase 10)

**Status:** Not implemented. This directory contains no code yet — do not import
from this path.

**Purpose:** AI-assisted synthesis — daily briefings, research AI summaries,
opportunity narrative generation — via the `AIProvider` interface. **AI never
performs authoritative financial calculations**; every figure it references is
sourced from `analytics`, computed before any AI call is made.

**Design reference:** `docs/provider-architecture.md` (`AIProvider`),
`docs/data-flow.md` §6–7, `docs/data-classification.md` (AI prompts/responses
classified Confidential), `docs/threat-model.md` §15–16 (prompt injection, data
leakage).

**Target phase:** Phase 10 — AI Analysis and Daily Briefing
(`docs/development-roadmap.md`). No portfolio or personal data is sent to any AI
provider before this phase.
