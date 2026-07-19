# Technology Stack

This document lists the recommended production stack and the reasoning behind each
choice. The bar for inclusion is: mature, well-supported, a good fit for a
small-team-maintained financial application, and not chosen merely because it is new.

## Core Framework

### Next.js (App Router) + TypeScript

- **Why Next.js:** Gives us Server Components, Server Actions, file-based routing,
  and built-in API (Route Handler) support in one framework, which lets a single
  codebase serve as both frontend and backend for this application's needs. It is
  the framework Vercel builds and optimizes for first, which matters since Vercel is
  the hosting target — deployments, previews, and edge/server runtime behavior are
  first-class rather than an afterthought.
- **Why the App Router specifically:** Server Components reduce the amount of
  JavaScript shipped to the client and let us query Supabase directly on the server
  for read paths, which is both faster and reduces the surface area for leaking
  service-level credentials into the client.
- **Why TypeScript:** This application handles money. A static type system catches
  an entire class of bugs (wrong field name, mismatched units, null handling) at
  compile time rather than in production against real financial data. It also makes
  the codebase self-documenting for a project intended to be maintained over years.

## Styling / UI

### Tailwind CSS

- **Why:** Utility-first CSS keeps styling co-located with markup, which is easier
  to maintain solo than a separate stylesheet architecture, and makes responsive,
  mobile-first design (a stated requirement) direct and explicit at each breakpoint
  rather than relying on separate mobile stylesheets.
- **Component layer (recommended addition when UI work begins):** a headless,
  accessible primitive library (e.g., Radix UI primitives, optionally via a
  pre-styled layer like shadcn/ui) rather than a heavyweight component framework —
  keeps full control over markup and styling while not hand-building accessible
  dropdowns, dialogs, and form controls from scratch.

## Data & Backend

### Supabase (PostgreSQL, Auth, Storage)

- **Why Supabase overall:** it bundles a production-grade managed Postgres database,
  authentication, row-level authorization, and file storage behind one project and
  one set of credentials — appropriate for a small team that does not want to
  operate its own database or auth service, while still being "real Postgres"
  underneath rather than a proprietary database.
- **Why PostgreSQL specifically:** a mature, strongly-consistent relational database
  is the right fit for financial records — transactions, holdings, and valuations
  are inherently relational, benefit from strong typing and constraints, and need
  transactional integrity (e.g., a transfer that debits one position and credits
  another must be atomic).
- **Why Supabase Auth:** avoids building and maintaining custom authentication
  (password hashing, session management, email verification, OAuth flows) — a
  security-sensitive component best not reinvented. It integrates directly with
  Postgres Row-Level Security, so the same identity used to authenticate is the
  identity enforced at the database layer.
- **Why Row-Level Security as the authorization model:** authorization rules live in
  the database itself and are enforced regardless of which code path touches the
  data, so a bug in application code cannot bypass access control. This is
  particularly important for financial data shared across future multiple users.
- **Why Supabase Storage:** keeps uploaded documents (e.g., statements) out of the
  primary database and off the application server, served through the same
  auth/permissions model as the rest of the data.

## Validation

### Zod

- **Why:** provides runtime validation of all external input (forms, API payloads)
  with TypeScript types derived directly from the same schema, so validation rules
  and type definitions cannot drift apart. This is the boundary where malformed or
  malicious input is rejected before it reaches domain logic.

## Data Fetching / Server State (client-side)

### Native fetch + React Server Components as the default; TanStack Query where client-side caching is genuinely needed

- **Why this ordering:** Server Components already handle the majority of read
  paths without needing a client-side data-fetching library at all — the fewer
  moving parts, the better, for a single-maintainer project. TanStack Query is
  introduced only for client-heavy interactive views (e.g., live-updating
  dashboards) where client-side caching, refetching, and mutation state genuinely
  add value, rather than being adopted wholesale up front.

## Forms

### React Hook Form + Zod resolver

- **Why:** minimizes re-renders and boilerplate for forms with financial input
  (amounts, dates, tickers), and shares validation schemas with the server via Zod
  so the same rules apply on both client and server.

## Testing

### Vitest (unit/integration) + Playwright (end-to-end)

- **Why Vitest:** fast, TypeScript-native, and a natural fit for testing the
  framework-independent domain logic (valuation math, performance calculations)
  described in `architecture.md` — this is the code most in need of thorough testing
  given the subject matter.
- **Why Playwright:** for a financial application, the critical user journeys
  (recording a transaction, viewing correct portfolio value) warrant real
  browser-level end-to-end coverage, and Playwright has first-class TypeScript
  support and reliable auto-waiting.

## Code Quality Tooling

### ESLint + Prettier + TypeScript strict mode

- **Why:** enforced consistency matters disproportionately on a long-lived,
  primarily solo-maintained codebase — it removes an entire category of
  bikeshedding and diff noise, and `strict` mode closes gaps (implicit `any`,
  unchecked nulls) that would otherwise undermine the value of using TypeScript at
  all.

## Observability & Error Tracking

### Sentry (or equivalent) + Vercel Analytics/Logs

- **Why:** a financial application must know when something goes wrong before the
  user has to report it — silent failures in valuation or transaction recording are
  unacceptable. Sentry gives error tracking with stack traces across both client and
  server; Vercel's built-in logs/analytics cover request-level visibility without
  additional infrastructure.

## Hosting & Deployment

### Vercel

- **Why:** specified as the hosting target, and it is also the natural fit given the
  Next.js choice — zero-configuration deployments, automatic preview environments
  per pull request, and a global edge network, all without managing servers.

## Package Management

### pnpm

- **Why:** faster installs and stricter dependency resolution (no phantom
  dependencies) than npm/yarn, which matters for a project intended to stay
  maintainable over a long lifespan with an evolving dependency tree.

## Extensibility Layer

The choices above are the concrete vendors/libraries in use today. None of them
are wired directly into business logic: market data, AI, notifications, document
processing, storage, and authentication are each accessed through an interface the
domain layer owns, detailed in `provider-architecture.md` — so a specific choice
above (e.g., "Anthropic" as the initial `AIProvider`) can change without touching
`domain/`. Which concrete implementation is active is itself a setting, resolved
through `settings-engine.md`, and which modules are visible at all is controlled
by `feature-flags.md`. This is what keeps the stack table below from being a set
of permanent commitments — it is today's best choice per category, made
deliberately swappable.

## Summary Table

| Concern                | Choice                             |
| ---------------------- | ---------------------------------- |
| Framework              | Next.js (App Router) + TypeScript  |
| Styling                | Tailwind CSS                       |
| UI primitives          | Radix UI / shadcn-style components |
| Database               | PostgreSQL (via Supabase)          |
| Auth                   | Supabase Auth                      |
| Authorization          | Postgres Row-Level Security        |
| File storage           | Supabase Storage                   |
| Validation             | Zod                                |
| Forms                  | React Hook Form + Zod              |
| Client server-state    | TanStack Query (selective use)     |
| Unit/integration tests | Vitest                             |
| E2E tests              | Playwright                         |
| Linting/formatting     | ESLint + Prettier                  |
| Error tracking         | Sentry                             |
| Hosting                | Vercel                             |
| Package manager        | pnpm                               |

This stack is intentionally conventional. Every piece is widely adopted, well
documented, and chosen to minimize the operational and cognitive burden on the
person(s) maintaining this system for years to come.
