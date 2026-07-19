# domain/alerts — Planned (Phase 11)

**Status:** Not implemented. This directory contains no code yet — do not import
from this path.

**Purpose:** alert rule evaluation output, alert generation, dismissal state —
the `Alert` aggregate root. Consumes `rules`/`decision` output; delivers via
`NotificationProvider`.

**Design reference:** `docs/event-system.md` (`AlertCreated`),
`docs/product-specification.md` (Alerts Center screen).

**Target phase:** Phase 11 — Alerts and Notifications
(`docs/development-roadmap.md`).
