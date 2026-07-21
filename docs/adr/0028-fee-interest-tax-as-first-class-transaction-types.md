# 0028. Fee, Interest, and Tax as First-Class Transaction Types

**Status:** Accepted

## Context

ADR 0026 (Portfolio Accounting Principles) recorded, as a deliberate and
acknowledged gap, that "fees/commissions are not currently modeled" — a
buy/sell's `amount` was exactly `quantity × price_per_unit`, with no
separate field or transaction type for a commission, and no way to record
interest received on cash or a tax payment at all. That ADR's own Future
Review Criteria named the trigger for revisiting this: "the first time a
real commission meaningfully skews a realised-gain or cost-basis figure
the principal is relying on."

Milestone 2.7 (Portfolio Completion & User Experience Polish) required
building real Cash Management functionality — deposits, withdrawals,
corrections, and the broader set of cash-affecting events a portfolio
actually experiences (brokerage fees, interest on uninvested cash,
withholding or other tax payments) — as part of making the Portfolio
module production-ready. Building this UI without also giving fees,
interest, and tax their own honestly-typed ledger rows would have meant
either fabricating them as `cash_adjustment` rows with a category that
doesn't fit, or continuing to fold them into `price_per_unit` per ADR
0026's documented (but unsatisfying) workaround. Both options were worse
than the review trigger ADR 0026 already anticipated.

This ADR supersedes only the "Fees/commissions are not currently modeled"
section of ADR 0026 and its corresponding "Alternatives Considered" entry
("a `fee` column on `transactions`"). Every other principle in ADR
0026 — cash is ledger-based only, holdings are immutable through
transactions, average-cost basis with no lot-level tracking, cash-basis
dividends, tax treatment out of scope, corporate actions out of
scope — is unchanged and remains the authoritative record of those
decisions.

## Decision

`fee`, `interest`, and `tax` join `buy`/`sell`/`dividend`/`cash_adjustment`
as first-class values of `transactions.type` — not a fifth
`cash_adjustment` category, because each is economically distinct from a
deposit/withdrawal/correction and from each other:

- **`fee`**: a cost the portfolio pays (brokerage commission, platform
  fee, custody fee). Debits cash. Optionally tagged to a `company_id`
  when the fee relates to a specific trade; portfolio-level otherwise
  (annual platform fee, for instance).
- **`interest`**: income the portfolio receives on uninvested cash.
  Credits cash. Never tagged to a company — cash interest has no holding
  to attach to.
- **`tax`**: a tax payment the portfolio makes (withholding, a filed
  payment). Debits cash. Optionally tagged to a `company_id`, same
  reasoning as `fee` (dividend withholding ties to the paying company;
  other tax payments don't).

Each gets its own atomic `record_fee_transaction`/
`record_interest_transaction`/`record_tax_transaction` Postgres function,
following the exact pattern ADR 0025 established: `SECURITY DEFINER`,
portfolio row locked before the idempotency check, owner derived from
`auth.uid()`, cash updated server-side from state read after the lock —
nothing here weakens ADR 0025's guarantees, it extends the same pattern to
three more event types.

A buy/sell's `amount` remains exactly `quantity × price_per_unit` — this
ADR does not add a fee field to the buy/sell RPCs themselves. A commission
paid at the time of a trade is recorded as a separate `fee` transaction
(optionally same-day, tagged to the same company), not folded into the
trade's own price. This keeps every transaction type honestly
single-purpose (ADR 0026's own reasoning for why dividend reinvestment is
two transactions, not one) rather than reopening buy/sell's shape.

`cash_adjustment`'s four categories (`deposit`/`withdrawal`/`correction`/
`other`) are unchanged — they remain for cash movements that aren't a fee,
interest, dividend, or tax: a bank transfer in or out, or a manual
correction to a mistake.

## Consequences

**Easier:**

- Realised gain and cost basis are no longer commission-blind for any
  fee recorded as its own transaction — the "a user who pays real
  brokerage commissions cannot see them as a distinct figure anywhere"
  consequence ADR 0026 named is resolved for fees recorded going forward.
- Interest income and tax payments — previously not representable at all,
  not even via the `price_per_unit` workaround — now have an honest home.
- Portfolio Performance (this same milestone) can report Dividends
  Received, Fees Paid, and Taxes Paid as real, transaction-derived
  figures rather than in mind only.

**Harder:**

- A fee recorded as a separate transaction from its trade is two ledger
  rows for one real-world event (a trade with a commission), which a
  reporting view must know to associate by date/company if it wants to
  show "cost including fees" for a specific trade — there is no foreign
  key linking a `fee` row back to the `buy`/`sell` row it relates to.
- Historical trades recorded before this milestone still have any
  commission folded into `price_per_unit` per the old workaround (or
  simply absent) — this ADR does not retroactively split them out.

## Alternatives Considered

- **Add a `fee` column to the buy/sell RPCs**, netting it out of cash
  alongside the trade. Rejected: conflates two economically distinct
  events (a purchase; a cost paid to execute it) into one row, the same
  objection ADR 0026 already raised against a `dividend_reinvestment`
  type — and it doesn't help interest or tax at all, which aren't
  trade-attached.
- **A single new `cash_adjustment` category** (`fee`/`interest`/`tax` as
  categories alongside `deposit`/`withdrawal`/`correction`/`other`).
  Rejected: `cash_adjustment`'s categories are all manual, discretionary
  cash movements the user directs; fee/interest/tax are things that
  happen to the portfolio, not things the user decides to move. Keeping
  them as distinct top-level types also makes filtering/reporting
  (`Transactions Support: Buy, Sell, Dividend, Fee, Interest, Tax, Cash
Adjustment` — Milestone 2.7's own requirement) directly map onto
  `transactions.type` rather than requiring a type-plus-category compound
  filter for the common case.
- **Linking a `fee` row to its trade via a nullable `related_transaction_id`
  foreign key.** Considered for the "two rows, one event" consequence
  above, but rejected for this milestone: no current UI workflow needs
  that association surfaced, and adding it speculatively would be
  designing a feature no requirement asked for (YAGNI,
  `docs/engineering-standards.md`). Revisit if a reporting view genuinely
  needs "this trade's all-in cost including its fee."

## Future Review Criteria

Revisit the "two separate rows" trade-off if a reporting or tax-adjacent
view needs a trade's all-in cost (price + fee) as a single figure often
enough that manual date/company association becomes a real usability
problem.

Revisit whether `fee`/`tax` should support `company_id` as required rather
than optional if, in practice, every recorded fee/tax turns out to relate
to a specific company and the portfolio-level case (an annual platform
fee, for instance) never actually occurs.
