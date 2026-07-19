# Vision

## What Arbor Lyme Capital Is

Arbor Lyme Capital is a private investment office application: a system of record for
tracking holdings, transactions, valuations, and performance across one or more
investment portfolios. It replaces ad-hoc spreadsheets with a single, durable,
auditable source of truth that can grow in sophistication over time without ever
being rebuilt from scratch.

It is being built as a long-term asset, not a prototype. Every phase should leave
behind software that the next phase can build on directly.

Beyond recording what is held, the system is also where the _reasoning_ behind
each investment lives — thesis, risks, source documents — and where AI assistance
surfaces relevant information proactively, rather than requiring it to be sought
out. See `research-workspace.md`, `document-management.md`, and
`provider-architecture.md`'s `AIProvider` for how this is designed.

## Who It Is For

- **Today:** a single user (the principal) managing their own investment data.
- **Tomorrow:** a small, trusted circle — family members, a co-investor, a bookkeeper,
  or an advisor — each with their own login and an appropriate level of access to a
  shared or partitioned view of the data.
- **Never (in current scope):** the general public, or a multi-tenant SaaS product
  serving unrelated organizations. This is a private application, not a commercial
  platform. Multi-user means "a handful of known, trusted people," not "arbitrary
  signups."

This distinction matters: it means we favor simplicity and correctness over the kind
of tenant-isolation machinery a SaaS product would need, while still designing the
data model so that adding real multi-user support later is a schema change, not a
rewrite.

## Why It Exists

- **Accuracy.** Investment decisions should be based on data that is correct,
  current, and traceable to its source — not on a spreadsheet formula that silently
  broke six months ago.
- **Continuity.** Institutional knowledge (why a position was taken, how a valuation
  was derived) should live in the system, not in one person's memory or inbox.
- **Control.** Financial data is sensitive. It should be held in infrastructure the
  principal controls and understands, with a clear security model, rather than
  scattered across third-party tools with unclear data-handling practices.
- **Leverage.** Over time, the system should do more of the analytical and reporting
  work that is currently manual, freeing time for decisions rather than data
  wrangling.

## Guiding Principles

1. **Correctness over speed.** This handles money. A bug that silently miscalculates
   a valuation is far worse than a missing feature. We build carefully and verify.
2. **Boring technology, deliberately chosen.** Every piece of the stack is chosen for
   maturity, operability, and fit — not novelty. See `technology-stack.md` for the
   reasoning behind each choice.
3. **Design for the second user before the first one arrives.** The data model and
   auth model are built with multi-user access in mind from day one, even though only
   one person will use the system initially. Retrofitting access control onto a
   single-user schema is a common and avoidable source of rework.
4. **Mobile-friendly, not mobile-only.** The primary workflows (reviewing positions,
   checking performance, logging a transaction) should work well on a phone, but the
   application is a responsive web app, not a native app, in this phase.
5. **Incremental, reversible delivery.** The system is built in phases (see
   `development-roadmap.md`), each of which ships something usable and none of which
   requires undoing prior work.
6. **Security is a first-class requirement, not a later pass.** Given the subject
   matter, authentication, authorization, and data protection are designed in from
   the start. See `security-principles.md`.

## What Success Looks Like

- The principal trusts the numbers in the system enough to make decisions from them
  without cross-checking a spreadsheet.
- Adding a second user is a matter of inviting them and assigning a role — not an
  engineering project.
- A new contributor (human or AI) can read `/docs` and understand what the system is,
  why it is built the way it is, and how to extend it safely.
- The codebase remains something one person can fully understand and maintain, even
  as functionality grows.

## Out of Scope (For Now)

These are deliberately deferred, not rejected. They should be revisited only once the
core system is solid:

- Native mobile applications.
- Public-facing or multi-tenant SaaS features.
- Automated trading or order execution.
- Real-time market data feeds beyond what is needed for periodic valuation.
- Integrations with external brokerages/custodians (initially, data entry is manual
  or via periodic import).
