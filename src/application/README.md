# application

Composition/orchestration layer: wires `domain/*` services to `infrastructure/*`
implementations and the internal event bus. Contains no business rules of its
own (those live in `domain/`) and no framework-rendering code (that lives in
`app/`).

- **`services/`** — orchestration functions used by Server Actions/Route
  Handlers (e.g., "update a user's settings": validate, call the domain
  service, publish the resulting event). Populated in the Foundation milestone
  for `settings` and `audit`.
- **`commands/`** and **`queries/`** — a CQRS-style split for write/read
  orchestration, reserved for once a domain's write and read paths genuinely
  diverge in complexity (e.g., `trading`'s ledger writes vs. `analytics`'s
  read-heavy aggregation queries in later phases). Not populated in Foundation —
  `services/` is sufficient for the simple orchestration Foundation needs, and
  introducing the split now would be premature structure for logic that doesn't
  yet exist (see `docs/engineering-standards.md`, YAGNI).
