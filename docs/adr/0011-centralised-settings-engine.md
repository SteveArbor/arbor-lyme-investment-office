# 0011. Centralised Settings Engine

**Status:** Accepted

## Context

Configuration spans display preferences, financial preferences, provider
selection, and feature flags. Without a single design, these tend to accumulate
inconsistently — some in `localStorage`, some as environment variables, some as
scattered table columns — with no uniform way to determine the effective value for
a given user, or to audit when it changed.

## Decision

Implement a single settings engine (`domain/settings/`) with a Zod-defined schema
covering all configuration values, resolved through a layered precedence chain
(user → household/org → system → hardcoded default), accessed only through a
`SettingsService`, with every write emitting `SettingsChanged`
(`event-system.md`) and an audit record (`audit-strategy.md`) — detailed in
`settings-engine.md`. Feature flags (ADR 0009) are modeled as a boolean-typed
subset of this same system.

## Consequences

- One mental model and one code path for "what value is in effect right now,"
  regardless of which specific setting is being read.
- Household/org-level resolution is included from Phase 1 even though only one
  user exists yet, avoiding a schema change when multi-user ships — consistent
  with the ownership-modeled-from-day-one principle in `architecture.md`.
- New settings (for future modules — Property Module, Tax Planning) extend one
  schema rather than requiring a new subsystem per module.
- Adds a layer of indirection (a service call) rather than direct table reads —
  accepted because it's what makes validation, auditing, and event emission
  uniform across every setting.

## Alternatives Considered

- **Ad hoc settings per feature (each module manages its own config storage)** —
  rejected: the original failure mode this ADR exists to prevent; leads to
  inconsistent override behavior and no unified audit trail for configuration
  changes.
- **Client-side-only settings (e.g., localStorage)** — rejected: does not persist
  across devices, cannot be resolved server-side for Server Component rendering,
  and cannot support household-level sharing post multi-user.

## Future Review Criteria

Revisit if the settings schema grows large enough that a single flat schema
becomes unwieldy — at that point, splitting into per-domain schemas composed
together is a straightforward evolution, not a redesign.
