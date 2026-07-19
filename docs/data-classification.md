# Data Classification

## Purpose

Different data this system holds carries very different sensitivity — application
source code and a cash balance are not the same kind of secret. Without an
explicit classification, controls (encryption, logging, retention, access) tend to
be applied uniformly and therefore wrongly: too loose on financial data, too
strict (or inconsistently applied) elsewhere. This document defines the
classification levels used throughout the rest of `/docs` and states how each
category of data in the system is classified.

No formal classification scheme existed before this document — see ADR 0016.

## Classification Levels

| Level                   | Definition                                                                                                   | Default handling                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public**              | Safe for anyone to see; no confidentiality requirement.                                                      | No special control required.                                                                                                                                                          |
| **Internal**            | Not secret, but not intended for public distribution — disclosure is a minor issue, not a serious one.       | Access limited to the operator/contributors; not published externally.                                                                                                                |
| **Confidential**        | Disclosure would cause real harm (financial exposure, privacy violation, competitive/personal disadvantage). | Access limited to the owning user (and authorized household members post multi-user); encrypted at rest and in transit; audited access where practical.                               |
| **Highly Confidential** | Disclosure would cause severe harm, or the data can directly be used to compromise the system itself.        | Strictest handling: least-privilege access, never logged, never sent to a third party (including AI providers) without explicit design review, rotated/revoked on suspected exposure. |

These levels are ordered; a piece of data touching multiple categories (e.g., a
document containing both portfolio commentary and no PII) is classified at the
level of its most sensitive component.

## Classification of System Data

| Data                                              | Classification                                              | Notes                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application source code                           | Internal                                                    | Not secret, but this is a private repository, not open source; no confidentiality _requirement_ beyond normal repo access control.                                                                                                                     |
| Portfolio holdings                                | Confidential                                                | Reveals what the user owns; real financial exposure if disclosed.                                                                                                                                                                                      |
| Transactions                                      | Confidential                                                | Same reasoning as holdings, plus reveals behaviour/timing.                                                                                                                                                                                             |
| Cash values                                       | Confidential                                                | Directly sensitive financial figures.                                                                                                                                                                                                                  |
| Personal notes                                    | Confidential                                                | May contain the user's private reasoning, sometimes about personal financial circumstances beyond the specific holding.                                                                                                                                |
| Research documents                                | Confidential                                                | Sourced material may be public (an annual report) or non-public depending on origin; classified at the confidential default since the _linkage_ to the user's specific interest in that asset is itself sensitive.                                     |
| Authentication data (passwords, sessions, tokens) | Highly Confidential                                         | Direct compromise vector for the entire system; never logged, never stored by the application itself (delegated to Supabase Auth, `security-principles.md`).                                                                                           |
| API keys / service credentials                    | Highly Confidential                                         | Compromise grants broad access to vendor accounts and, for the Supabase service-role key, bypasses RLS entirely (`security-principles.md`).                                                                                                            |
| Audit events                                      | Confidential                                                | Contains actor IDs and before/after state of confidential records; the log itself must be protected even though its purpose is oversight — see `audit-strategy.md`'s explicit list of what audit records must _never_ contain.                         |
| AI prompts                                        | Confidential                                                | May embed portfolio/research context depending on future feature design; classified now so that constraint is enforced from the first AI feature, not retrofitted.                                                                                     |
| AI responses                                      | Confidential                                                | Same reasoning; additionally must always be labelled as AI-generated (`provider-architecture.md`) regardless of classification.                                                                                                                        |
| Application logs                                  | Internal, with a Confidential-handling obligation           | Logs themselves are operational (Internal) but must never _contain_ Confidential/Highly Confidential values — the obligation is on what's excluded, not the log's own classification (`engineering-standards.md`'s logging strategy).                  |
| Database backups                                  | Confidential (mirrors the most sensitive data they contain) | A backup inherits the classification of its contents — since backups contain holdings/transactions, they are Confidential and require equivalent access control to the live database, addressed in `deployment-strategy.md`'s backup/recovery section. |

## Handling Principles

### Retention

- **Confidential financial data** (holdings, transactions, cash values) is
  retained indefinitely by default, consistent with financial record-keeping
  norms and `audit-strategy.md`'s retention approach — there is no automatic
  deletion.
- **Highly Confidential credentials/keys** are not "retained" at all by this
  system beyond their operational lifetime — they live in environment
  configuration (`security-principles.md`) and are rotated on any suspected
  exposure, not archived.
- **Logs** are retained only as long as operationally useful (a much shorter,
  rolling window than financial records) — logs are explicitly not the system of
  record for anything (`engineering-standards.md`), so long retention has no
  benefit and only expands exposure surface.

### Redaction

- Audit records apply redaction _by construction_: the audit handler
  (`audit-strategy.md`, `data-flow.md` §10) sanitizes metadata before writing,
  stripping anything matching the "must never contain" list — this is
  enforced in code, not left to per-call-site discipline.
- Error messages surfaced to users or logs never include raw Confidential or
  Highly Confidential values (`security-principles.md`) — a validation error
  names the field, not the submitted value, where that value is sensitive.
- Structured logs use an explicit allow-list of loggable fields per event type,
  not a deny-list of fields to strip — safer by default, since a new sensitive
  field added later is excluded unless deliberately added to the allow-list.

### Access

- Confidential and Highly Confidential data is always subject to Row-Level
  Security (`security-principles.md`, `database-design.md`) — no table holding
  data at these levels is ever queried without RLS enabled.
- Highly Confidential data (credentials, keys) is never accessible through the
  application's normal data-access paths at all — it lives in environment
  configuration or Supabase Auth's own storage, never in an application table a
  domain service could inadvertently expose.
- AI providers (`provider-architecture.md`) receive Confidential data (e.g.,
  portfolio figures for a future briefing feature) only once a specific feature's
  design has been explicitly reviewed for this document's constraints — and, per
  the Foundation milestone's explicit scope, **no Confidential data is sent to an
  AI provider during this milestone**, because no AI feature is built yet.

## Relationship to Other Documents

- **`security-principles.md`** — the broader control set this classification
  scheme informs (encryption, secrets management, least privilege).
- **`audit-strategy.md`** — the concrete "must never contain" list for audit
  records is the applied version of the Highly Confidential handling principle
  above.
- **`threat-model.md`** — several threats (audit log tampering, backup exposure,
  AI data leakage) are evaluated directly in terms of the classifications defined
  here.
- **ADR 0016** — records the decision to formalize this scheme now.
