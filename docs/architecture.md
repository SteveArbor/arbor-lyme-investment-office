# Architecture

> **Implementation status:** the Foundation milestone implements the `app/`,
> `domain/settings`, `domain/audit`, `domain/shared`, `infrastructure/auth`,
> `infrastructure/database` (partial), and `infrastructure/events` layers
> described below. Every other domain/infrastructure module referenced in this
> document is **Planned**, not implemented — see
> `docs/implementation/foundation.md` for the authoritative, detailed status of
> every module, and `docs/development-roadmap.md` for when each lands.

## Overview

Arbor Lyme Capital is a server-rendered web application: a single Next.js codebase
deployed on Vercel, backed by a Supabase-managed PostgreSQL database. There is no
separate backend service in early phases — Next.js Route Handlers and Server
Components serve as the application's API and rendering layer. This keeps
operational surface area small (one deployable, one database) while remaining
straightforward to split out a dedicated backend later if the domain ever demands it.

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│   Next.js App Router pages · React Server/Client Components  │
│   Tailwind CSS · responsive, mobile-first layouts             │
└───────────────────────────┬───────────────────────────────────┘
                             │ HTTPS
┌───────────────────────────▼───────────────────────────────────┐
│                    Vercel Edge / Node runtime                 │
│   Next.js Server Components · Route Handlers (API)            │
│   Server Actions for mutations · Zod validation at boundaries │
└───────────────────────────┬───────────────────────────────────┘
                             │ Supabase client (service/anon keys)
┌───────────────────────────▼───────────────────────────────────┐
│                          Supabase                              │
│   PostgreSQL (source of truth) · Auth (users, sessions)       │
│   Row-Level Security (authorization) · Storage (documents)    │
└─────────────────────────────────────────────────────────────┘
```

## Layers

### 1. Presentation (Next.js App Router)

- **React Server Components** render pages by reading data directly from Supabase on
  the server. This is the default for anything read-only (dashboards, position
  lists, reports).
- **Client Components** are used only where interactivity requires it (forms, charts
  with client-side interaction, optimistic UI). The default is server-first; a
  component only becomes a Client Component when it must be.
- **Server Actions** handle mutations (creating a transaction, editing a position)
  directly from forms/components without hand-rolled API routes, where that fits.
  Route Handlers are used where a genuine HTTP endpoint is needed (webhooks, external
  integrations, non-form clients).
- **Tailwind CSS** provides the styling system, with a mobile-first responsive
  approach: layouts are designed for a phone screen first, then enhanced for larger
  viewports.

### 2. Application / domain logic

- Domain logic (valuation calculations, performance metrics, portfolio aggregation,
  and the growing set of business domains — trading, research, alerts, documents,
  etc.) lives in plain TypeScript modules, independent of Next.js and Supabase
  specifics, organized as bounded contexts under `domain/`. The full structure,
  the reasoning behind it, and the dependency rules that keep it that way are
  specified in **`domain-driven-design.md`** — this section states the principle;
  that document is the authority on the structure itself.
- This separation exists so that business logic can be unit-tested without spinning
  up a database or a request, and so it is not accidentally coupled to framework
  details.
- All external input (form submissions, route handler payloads) is validated at the
  boundary using a schema library (Zod) before it reaches domain logic.

### 3. Data (Supabase / PostgreSQL)

- PostgreSQL is the single source of truth for all application data. See
  `database-design.md` for schema conventions.
- **Row-Level Security (RLS)** is the primary authorization mechanism at the data
  layer — not just an apology in the application layer. Every table that holds
  user-scoped data has RLS policies enforcing that a user can only read/write data
  they are entitled to, so authorization holds even if application code has a bug.
- **Supabase Auth** manages identity: sign-up/sign-in, session/JWT issuance, and
  password/OAuth flows. The application does not implement its own authentication.
- **Supabase Storage** is used for any document assets (e.g., statements, uploaded
  records) rather than storing binary data in Postgres.

### 4. Cross-cutting concerns

- **Validation:** Zod schemas shared between client forms and server-side handlers
  where practical, so validation rules are defined once.
- **Observability:** structured logging on the server, and error tracking (see
  `technology-stack.md`) wired in from an early phase — not bolted on after an
  incident.
- **Configuration/secrets:** environment variables managed through Vercel's
  environment configuration and never committed to the repository. See
  `security-principles.md`.

## Domain-Driven Design Structure

The four layers above are the runtime picture. Within layer 2 (application/domain
logic), the codebase is further organized as explicit bounded contexts —
`portfolio`, `trading`, `market`, `analytics`, `research`, `ai`, `alerts`,
`documents`, `settings`, `audit` — each with a framework-independent domain model
and a narrow public interface, with `infrastructure/` implementing the interfaces
each context defines (dependency inversion). This is adopted specifically because
a flat domain folder does not scale past one or two concerns without silent
cross-coupling. See **`domain-driven-design.md`** for the full folder structure,
bounded-context definitions, aggregate roots, and dependency rules (ADR 0005).

## Provider Plugin Architecture

Every external vendor dependency — market data, AI, notifications, document
processing, storage, authentication — sits behind an interface the domain layer
owns, so the active vendor is a configuration choice (resolved via
`settings-engine.md`) rather than something hardcoded into business logic.
`MarketDataProvider`, `AIProvider`, `NotificationProvider`, `DocumentProvider`,
`StorageProvider`, and `AuthenticationProvider` are the six interfaces this
applies to. See **`provider-architecture.md`** for the interface definitions and
rationale (ADR 0006).

## Internal Event System

Cross-context effects (a transaction triggering recalculation, an alert
evaluation, and an audit record) are expressed as domain events rather than direct
calls between contexts, propagated through an internal (not external-broker)
event system with two tiers — synchronous in-request dispatch, and a
transactional-outbox-plus-polling-job pattern for effects that can be deferred
across Vercel's stateless serverless invocations. See **`event-system.md`** for
the full design, the event catalog, and why the serverless execution model shapes
this specifically (ADR 0007).

## Multi-User Evolution Path

The system starts single-user but is architected so that multi-user support is an
additive change:

1. **Phase 1 (single user):** one Supabase Auth user (the principal). Tables carry a
   `owner_id` / `user_id` column from day one, and RLS policies are written in terms
   of that column even though only one user exists. This avoids a schema migration
   later purely to add ownership.
2. **Phase 2 (multi user):** additional Supabase Auth users are invited. A
   lightweight `memberships` / `roles` model determines what each user can see
   (e.g., "owner", "viewer", "editor" against a given portfolio or household). RLS
   policies are extended to consult this membership table instead of a single
   `owner_id` check.
3. **No phase requires re-architecting the client or the data layer.** The UI already
   scopes its queries by the authenticated user; extending that scoping from "is this
   your row" to "are you a member of this row's household" is a policy and query
   change, not a rewrite.

## Deployment Topology

- **Vercel** hosts the Next.js application: preview deployments per pull request,
  and a production deployment from the default branch.
- **Supabase** hosts PostgreSQL, Auth, and Storage as a managed service, with
  separate projects for development/staging and production (see
  `deployment-strategy.md`).
- No custom servers, containers, or infrastructure to manage in this phase — this is
  a deliberate choice to minimize operational burden for a small team.

## Why Not Microservices / a Separate Backend

A single Next.js application is sufficient for the current scale (single or small
group of users) and domain complexity. Introducing a separate backend service,
message queue, or microservices split now would add operational overhead
(deployment, networking, versioning) without a corresponding benefit. If a specific
future need arises — e.g., a long-running batch job unsuitable for serverless
functions — it can be added as a discrete, well-justified service rather than a
wholesale re-architecture.

## Related Documents

This document describes the runtime/layer architecture. Several areas are
detailed in dedicated documents rather than repeated here:

- **`domain-driven-design.md`** — bounded contexts, folder structure, dependency rules
- **`provider-architecture.md`** — vendor abstraction interfaces
- **`event-system.md`** — internal event propagation
- **`feature-flags.md`** — release-gating strategy
- **`settings-engine.md`** — configuration resolution
- **`audit-strategy.md`** — immutable audit trail
- **`research-workspace.md`**, **`document-management.md`** — module-specific design
- **`docs/adr/`** — the decision record for every choice above
