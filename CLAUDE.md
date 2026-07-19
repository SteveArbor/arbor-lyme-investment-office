# Claude Project Instructions

## Autonomous Working

Work as autonomously as possible.

Do not stop after completing individual files, folders or small implementation tasks.

Continue implementing until reaching a genuine decision boundary.

A decision boundary is ONLY one of:

- A commit is ready.
- A destructive action is required.
- A push or merge has been requested.
- Requirements are genuinely ambiguous.
- An architectural decision would materially affect the project.

Otherwise continue working.

Batch as much work as possible into a single milestone.

A milestone should typically represent several hours of development rather than a single feature.

Do not stop between related features.

Continue until the milestone is complete before requesting a commit.

The preferred cadence is:

Milestone
→ Validation
→ Commit
→ Continue immediately

---

## Milestones

Complete entire milestones rather than individual components.

Example:

❌ Build authentication → stop

❌ Build database → stop

✔ Build the complete Authentication milestone, including:

- database
- repositories
- services
- UI
- validation
- tests
- documentation

then stop.

---

## Decision Making

When multiple reasonable implementation choices exist:

- Choose the solution that best fits the existing architecture.
- Do not ask preference questions unless the decision materially changes the product.
- Explain your reasoning afterwards rather than interrupting implementation.

---

## Validation

After every completed feature:

- Run lint.
- Run type checking.
- Run tests.
- Fix all failures.
- Repeat until clean.

Only present work that builds successfully.

---

## Commits

Commit by feature, never by folder.

Avoid commits such as:

- src/domain
- src/components

Prefer:

- feat: valuation engine
- feat: research management
- feat: thesis tracking
- feat: reporting engine

Accumulate related work before requesting commit approval.

---

## Architecture

Optimise for long term maintainability.

Choose robust architecture over the quickest implementation.

Business rules belong in the Domain.

UI should remain thin.

Never duplicate business logic.

---

## Investment Platform

Always remember:

This is an Investment Research Operating System.

Research comes first.

Portfolio management is secondary.

Transactions are secondary.

Every feature should improve investment decision quality.

---

## AI Behaviour

Work continuously.

Avoid unnecessary conversation.

Minimise interruptions.

Summarise completed work only when a milestone is finished.

Do not ask for confirmation between logically connected implementation steps.
