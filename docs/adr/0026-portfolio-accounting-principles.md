# 0026. Portfolio Accounting Principles

**Status:** Accepted

## Context

`domain/trading` and `domain/portfolio` have implemented a specific set of
accounting choices since Phase 2 — average-cost basis, cash-basis
dividends, no fee tracking, no tax-lot tracking — but no single document
states them as deliberate decisions with reasoning behind them. Each
choice is defensible individually and mostly falls out of
`docs/development-roadmap.md`'s "no invented data" principle, but a future
contributor extending trading (a corporate-action transaction type, a fee
field, tax-lot reporting) has nothing to check their change against except
reverse-engineering the current schema and hoping the omission was
deliberate rather than an oversight. This ADR makes explicit what was
already implicit in the code, the same way ADR 0024 and ADR 0025 formalized
decisions made during implementation rather than before it.

Nothing here changes behaviour. This is a documentation-only ADR.

## Decision

The platform's portfolio accounting follows these principles:

**Cash is ledger-based only.** A portfolio's `cash` figure is never an
independently editable balance — it is always the result of applying the
transaction ledger. The only writers of `portfolios.cash` are the four
atomic `record_*_transaction` Postgres functions (ADR 0025); there is no
"edit cash" operation anywhere in the domain or UI. A user who needs to
correct a mistake records an offsetting `cash_adjustment` transaction, they
never edit a balance in place — this is the same append-only-correction
pattern `transactions` and `audit_events` already use
(`docs/audit-strategy.md`).

**Holdings are immutable through transactions, never edited directly.**
`holdings.quantity`/`holdings.average_cost` change only as the _output_ of
a `record_buy_transaction`/`record_sell_transaction` call, computed
server-side from the transaction being recorded (ADR 0025). There is no
"edit holding" operation. `target_allocation_percent` is the one holding
field that _is_ user-editable directly (`PortfolioService
.updateTargetAllocation`), because it is a preference about the future, not
a record of what happened — it carries no accounting meaning and doesn't
affect cost basis, quantity, or any gain calculation.

**Cost basis: single weighted-average, no lot-level tracking.**
`calculateWeightedAverageCost` (`domain/trading/model.ts`) blends every buy
into one running average cost per holding — the standard "average cost
basis" method. There is no per-lot (FIFO/LIFO/specific-identification)
tracking: a sell always realizes gain against the current blended average,
never against a chosen individual purchase lot. This is a deliberate
simplification appropriate for a personal decision-support tool, not a
brokerage or tax-reporting system — see Tax Treatment below for the
specific consequence of this choice.

**Realised vs. unrealised gain are computed differently, on purpose.**
Realised gain (`calculateRealisedGain`) is computed once, at the moment of
a sell, against the average cost basis at that instant, and stored
permanently on that `sell` transaction row (append-only, per ADR 0025's
CHECK constraint that `realised_gain` only exists on `sell` rows).
Unrealised gain (`calculateUnrealisedGainLoss`, `domain/portfolio/model.ts`)
is never stored anywhere — it is computed on demand from the current
holding plus a **caller-supplied current price**, because this application
has no market-data provider and never invents a price
(`docs/engineering-standards.md`'s "no invented financial data"). A view
that wants to show unrealised gain must have a real current price to pass
in; there is no fallback, cached, or estimated price anywhere in the
domain layer.

**Dividends are cash-basis income, not a cost-basis or quantity event.**
A `dividend` transaction credits `portfolios.cash` by a fixed amount and
does nothing else — it does not change the paying holding's `quantity` or
`average_cost`. This models a cash dividend correctly. It deliberately does
**not** model dividend reinvestment (DRIP): a reinvested dividend must be
recorded as two transactions (a `dividend`, then a separate `buy` at
whatever price the reinvestment executed at), because the domain has no
way to know a reinvestment price without it being supplied as a real buy.

**Fees/commissions are not currently modeled.** `transactions.amount` for
a buy/sell is exactly `quantity × price_per_unit` (enforced by
`transactions_amount_sign_matches_type` and the RPC's own computation in
ADR 0025's migration) — there is no separate fee/commission field, and no
implicit fee deduction anywhere. A user who wants a trade's economics to
reflect a real commission has to fold it into `price_per_unit` themselves
today, which is honest about cost but loses the fee as a distinct,
reportable figure. This is a real, acknowledged gap (see Future Review
Criteria), not a hidden one.

**Tax treatment is explicitly out of scope.** There is no tax-lot
tracking, no short-term/long-term gain classification, no wash-sale
detection, and no dividend withholding tracking anywhere in this domain.
`realised_gain` is a single blended-average-cost figure suitable for
tracking investment performance, and is **not** suitable as a source for
tax filing. This matches the disclaimer already shown throughout the
product ("a private decision support tool... does not provide regulated
financial advice") and the roadmap's own separation: tax-aware accounting
is explicitly named as a deferred, later capability
(`Tax Planning` in `docs/feature-flags.md`'s Phase 8 module list), not
something this domain silently half-implements today.

**Corporate actions are not modeled (future).** Stock splits, reverse
splits, mergers, spin-offs, and ticker changes have no representation in
`TRANSACTION_TYPE_OPTIONS` (`buy`/`sell`/`dividend`/`cash_adjustment`) or
anywhere else. A 2-for-1 split, for instance, needs to double `quantity`
and halve `average_cost` with zero cash effect and zero realised
gain — a shape none of the four existing transaction types can express
honestly (forcing it through `buy`/`sell` would fabricate a price and a
realised-gain figure that didn't happen). This ADR does not design that
mechanism — it records that the gap is known and deliberate, not an
oversight, so a future contributor doesn't need to reverse-engineer
whether it was considered.

## Consequences

**Easier:**

- Every accounting figure in the system today is auditable back to a real,
  recorded transaction — nothing is a silent estimate or a fabricated
  default, consistent with the project's foundational "no invented data"
  rule.
- The four transaction types plus their CHECK constraints (ADR 0025) are
  sufficient for every currently-implemented UI workflow; no half-built
  fee/tax/corporate-action feature exists to maintain.

**Harder:**

- A user who pays real brokerage commissions cannot see them as a distinct
  figure anywhere in the platform today — realised gain and cost basis are
  both commission-blind unless the user manually adjusts `price_per_unit`.
- Nothing in this platform can be used, as-is, to prepare a tax return —
  users needing lot-level or jurisdiction-aware tax treatment must
  maintain that outside the system until Phase 8's Tax Planning module (if
  it happens) exists.
- A stock split affecting a held company today would need to be handled
  manually and imperfectly (e.g., a `cash_adjustment` with an explanatory
  note, and a manually-corrected holding — which isn't actually possible
  either, since holdings have no direct-edit path per this ADR's own first
  principle). This is a genuine, currently-unhandled operational gap for
  any held company that splits.

## Alternatives Considered

- **FIFO/LIFO/specific-identification lot tracking** instead of average
  cost. Rejected for now: materially more schema and domain complexity
  (a `holdings` table would need to become a table of open lots, not one
  row per position) for a personal tool where average cost is the more
  common way to think about "what did I pay for this," not a brokerage
  needing to support every tax election. Revisit if tax-lot accuracy
  becomes a real requirement (see Future Review Criteria).
- **A `fee` column on `transactions`**, folded into the atomic RPC's cash
  calculation. Not implemented yet because no current workflow asks for
  it and it wasn't discovered as a gap until this ADR's review — a small,
  additive, low-risk change to make later, not one requiring this ADR's
  broader principles to change.
- **Modeling dividend reinvestment as a single transaction type** (e.g.
  `dividend_reinvestment` that both credits and immediately debits cash
  for a buy). Rejected: conflates two economically distinct events (income
  received; a purchase decision at a specific price) into one row, and
  every other multi-effect operation in this system (the atomic RPCs
  themselves) already establishes that a single conceptual event can
  legitimately be multiple linked ledger rows when the effects are
  distinct — better to record two honestly-typed transactions than invent
  a fifth type that blurs the line.

## Future Review Criteria

Revisit lot-level cost basis and tax treatment if: real tax-filing use
becomes a goal (this is exactly the trigger `docs/feature-flags.md`'s Tax
Planning module anticipates), or if a jurisdiction's tax rules the
principal actually needs to follow don't accept average-cost basis for
equities (notably, US tax law defaults to FIFO for equities unless
specific identification is elected at the time of sale — average cost is
commonly accepted for mutual funds but not universally for individual
stocks; this platform's `realised_gain` figure should not be assumed to
match what a US tax return would need).

Revisit fee tracking the first time a real commission meaningfully skews a
realised-gain or cost-basis figure the principal is relying on.

Revisit corporate-action handling the first time a currently-held company
(or one added later) actually undergoes a split, merger, or spin-off — at
that point a concrete real case exists to design a `transactions` addition
against, rather than speculating now.
