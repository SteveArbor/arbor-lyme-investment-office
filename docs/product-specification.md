# Product Specification

This document is the implementation blueprint: every screen in the application,
its purpose, audience, layout across device sizes, and the domains/data it draws
on. It is written against the architecture defined elsewhere in `/docs` — this
document does not introduce new domain concepts, it specifies how existing domain
concepts (`domain-driven-design.md` and its module-specific docs) are surfaced to
a user.

Screens are grouped by area. Each follows the same template so the set is
consistent and each entry can be implemented independently once its turn comes in
`development-roadmap.md`.

## Conventions Used Throughout

**Roles** (per `architecture.md`'s multi-user evolution path and
`security-principles.md`):

- **Owner** — full read/write, including settings and membership management for a
  portfolio/household.
- **Editor** — can create/edit holdings, transactions, research, documents; cannot
  change membership or delete a portfolio.
- **Viewer** — read-only access.

In the single-user phase, the principal holds the Owner role implicitly on
everything; the permissions listed per screen describe the model that becomes
active once multi-user ships (Phase 6, `development-roadmap.md`), and are already
enforced in the single-user phase in their degenerate one-user form (owner-only).

**Layout notation** — Desktop (≥1280px): multi-column, persistent side navigation.
Tablet (768–1279px): single main column, collapsible navigation, widgets reflow to
1–2 columns. Mobile (<768px): single column, bottom tab bar navigation, widgets
stack vertically, tables become card lists.

---

## 1. Authentication

### 1.1 Sign In

- **Purpose:** authenticate a user via Supabase Auth.
- **User:** all.
- **Layout:** centered single-column form.
- **Widgets:** email/password (or magic link) form; "forgot password" link; MFA
  challenge step where enabled.
- **Actions:** sign in; request password reset; (Phase 6) accept household
  invitation via emailed link.
- **Navigation:** entry point for unauthenticated users; redirects to Dashboard on
  success.
- **Permissions:** public (unauthenticated).
- **Data Sources:** Supabase Auth; `AuthenticationProvider`.
- **Desktop:** centered card, ~400px wide, on a branded background.
- **Tablet:** same, card scales to ~90% width.
- **Mobile:** full-width form, no card chrome.
- **Future Enhancements:** OAuth providers (Google), passkey support.

### 1.2 Onboarding / First-Run Setup

- **Purpose:** guide a new user through initial settings (currency, timezone,
  first portfolio) so the Dashboard is meaningful on first login.
- **User:** a newly authenticated user with no portfolios yet.
- **Layout:** stepped wizard.
- **Widgets:** currency/timezone selector, "create your first portfolio" form.
- **Actions:** set base currency/timezone; create initial portfolio; skip to
  Dashboard.
- **Navigation:** shown automatically once, in place of Dashboard, until a
  portfolio exists.
- **Permissions:** Owner (self).
- **Data Sources:** `settings` (initial values), `portfolio` (creation).
- **Desktop:** centered wizard, ~600px wide.
- **Tablet:** same, full width minus margins.
- **Mobile:** full-width, one step per screen.
- **Future Enhancements:** CSV import of historical transactions as an onboarding
  step (ties to `development-roadmap.md` Phase 3 import tooling).

---

## 2. Dashboard

### 2.1 Dashboard (Home)

- **Purpose:** at-a-glance answer to "how am I doing" — the default landing screen.
- **User:** all roles (content scoped by permission).
- **Layout:** widget grid, user-configurable order (`settings-engine.md` →
  Dashboard Layout).
- **Widgets:** total portfolio value, day/period change, allocation breakdown
  chart, recent transactions, active alerts summary, AI Briefing preview card
  (if `ai_briefing` flag enabled).
- **Actions:** reorder/hide widgets; drill into any widget's full screen; quick-add
  transaction.
- **Navigation:** central hub — links out to Portfolio Detail, Alerts, AI
  Briefing, Research.
- **Permissions:** Viewer sees read-only widgets; Editor/Owner see quick-add
  actions.
- **Data Sources:** `analytics` (aggregates), `portfolio`, `alerts`, `ai`
  (briefing preview), `settings` (layout).
- **Desktop:** 3-column widget grid.
- **Tablet:** 2-column grid.
- **Mobile:** single column, stacked, most important widgets (total value, change)
  first.
- **Future Enhancements:** drag-and-drop widget rearrangement; per-widget date
  range control.

---

## 3. Portfolio & Holdings

### 3.1 Portfolio List

- **Purpose:** overview of all portfolios the user has access to.
- **User:** all roles.
- **Layout:** card or table list, one row per portfolio.
- **Widgets:** portfolio name, value, day change, role badge (Owner/Editor/Viewer,
  post multi-user).
- **Actions:** create portfolio (Owner); open portfolio; (Phase 6) manage
  membership.
- **Navigation:** reachable from primary nav; links into Portfolio Detail.
- **Permissions:** shows only portfolios the user is a member of.
- **Data Sources:** `portfolio`.
- **Desktop:** table with sortable columns.
- **Tablet:** condensed table.
- **Mobile:** stacked cards.
- **Future Enhancements:** portfolio grouping/folders for users with many
  portfolios.

### 3.2 Portfolio Detail

- **Purpose:** the primary working view of a single portfolio.
- **User:** all roles.
- **Layout:** header (value/summary) + tabs (Holdings, Transactions, Performance,
  Documents).
- **Widgets:** value summary, allocation chart, holdings table, linked documents
  count.
- **Actions:** edit portfolio name/settings (Owner); add holding/transaction
  (Editor+); export report (`deployment-strategy.md`'s reporting, Phase 3).
- **Navigation:** central node linking to Holding Detail, Transactions List,
  Performance & Analytics, Document Repository (filtered).
- **Permissions:** Viewer read-only; Editor can modify holdings/transactions;
  Owner additionally manages portfolio settings/membership.
- **Data Sources:** `portfolio`, `trading`, `analytics`.
- **Desktop:** two-column (summary sidebar + main content tabs).
- **Tablet:** summary collapses above tabs.
- **Mobile:** summary as a collapsible header, tabs as horizontal scroll.
- **Future Enhancements:** custom sub-groupings (e.g., by strategy/sleeve).

### 3.3 Holding Detail

- **Purpose:** full detail on a single position — quantity, cost basis, linked
  research, linked documents, transaction history for that asset.
- **User:** all roles.
- **Layout:** header (asset name/quote) + sections (position summary, transaction
  history, research link, documents).
- **Widgets:** current quote (via `MarketDataProvider`), quantity/cost
  basis/unrealized gain, mini price chart, linked `ResearchNote` summary card.
- **Actions:** edit holding (Editor+); jump to Research Note (create one if none
  exists); jump to filtered Transactions; jump to linked Documents.
- **Navigation:** reached from Portfolio Detail's holdings table or global search.
- **Permissions:** Viewer read-only; Editor+ can edit.
- **Data Sources:** `portfolio`, `market`, `research` (summary), `documents`
  (linked count).
- **Desktop:** two-column (position data + chart | research/documents sidebar).
- **Tablet:** stacked, chart full width.
- **Mobile:** stacked, chart condensed (sparkline).
- **Future Enhancements:** tax-lot level detail (ties to future tax planning
  module, `feature-flags.md`).

---

## 4. Trading

### 4.1 Transactions List

- **Purpose:** the ledger — every recorded transaction for a portfolio (or
  globally, filterable).
- **User:** all roles.
- **Layout:** filterable/sortable table.
- **Widgets:** date, type, asset, quantity, price, amount, running filters
  (date range, asset, type).
- **Actions:** add transaction (Editor+); edit/delete transaction (Editor+, with
  confirmation — recorded as `TransactionUpdated`/`TransactionDeleted` per
  `audit-strategy.md`); export.
- **Navigation:** reached from Portfolio Detail's Transactions tab or Dashboard's
  recent-transactions widget.
- **Permissions:** Viewer read-only; Editor+ can add/edit/delete.
- **Data Sources:** `trading`.
- **Desktop:** full table, inline row actions.
- **Tablet:** condensed table, fewer visible columns (expandable row).
- **Mobile:** card list, one transaction per card.
- **Future Enhancements:** bulk CSV import (Phase 3, `development-roadmap.md`).

### 4.2 Add / Edit Transaction

- **Purpose:** record or amend a single transaction.
- **User:** Editor, Owner.
- **Layout:** modal or dedicated form page.
- **Widgets:** asset picker (searches `market`), type selector (buy/sell/
  transfer/dividend/fee), quantity, price, date, notes.
- **Actions:** save (raises `TransactionCreated`/`TransactionUpdated`); cancel.
- **Navigation:** launched from Transactions List or Holding Detail; returns to
  origin on save.
- **Permissions:** Editor, Owner.
- **Data Sources:** `trading`, `market` (asset lookup).
- **Desktop:** modal, ~600px.
- **Tablet:** modal, near full width.
- **Mobile:** full-screen form.
- **Future Enhancements:** broker-import-assisted entry (behind
  `broker_integration` flag).

---

## 5. Analytics

### 5.1 Performance & Analytics

- **Purpose:** historical performance and allocation analysis for a portfolio.
- **User:** all roles.
- **Layout:** chart-forward, with a date-range control governing all widgets.
- **Widgets:** value-over-time chart, time-weighted return, allocation breakdown
  (by asset class/sector), top movers.
- **Actions:** change date range; export report (Phase 3); switch chart type.
- **Navigation:** reached from Portfolio Detail's Performance tab.
- **Permissions:** Viewer read-only (no editable actions on this screen for any
  role — it is inherently read-only).
- **Data Sources:** `analytics`, `market` (historical prices).
- **Desktop:** large chart + supporting widgets in a sidebar.
- **Tablet:** chart full width, widgets below.
- **Mobile:** chart full width (simplified), widgets stacked.
- **Future Enhancements:** risk metrics (volatility, drawdown), benchmark
  comparison overlay.

---

## 6. Market

### 6.1 Market Watchlist

- **Purpose:** track assets of interest independent of current holdings.
- **User:** all roles.
- **Layout:** table of tracked assets with live/periodic quotes.
- **Widgets:** symbol, name, price, day change, quick-link to Research Note.
- **Actions:** add/remove from watchlist; open Asset Detail.
- **Navigation:** reachable from primary nav; feeds Research Workspace.
- **Permissions:** per-user list; Viewer can view a shared household watchlist
  (Phase 6) but not necessarily edit it (configurable).
- **Data Sources:** `market` (`MarketDataProvider`).
- **Desktop:** table.
- **Tablet:** condensed table.
- **Mobile:** card list.
- **Future Enhancements:** price alerts directly from watchlist rows (ties to
  `alerts`).

### 6.2 Asset Detail

- **Purpose:** reference view of a single instrument, independent of whether it's
  held.
- **User:** all roles.
- **Layout:** header (quote) + tabs (Overview, Research, Documents, Held In).
- **Widgets:** price chart, key stats (from `MarketDataProvider`), linked
  `ResearchNote`, portfolios currently holding this asset.
- **Actions:** add to watchlist; create/open Research Note; add transaction.
- **Navigation:** reached from Holding Detail, Watchlist, or global asset search.
- **Permissions:** read-only for all; write actions gated by target (e.g.,
  creating a transaction requires Editor on the target portfolio).
- **Data Sources:** `market`, `research`, `portfolio`.
- **Desktop:** two-column.
- **Tablet:** stacked.
- **Mobile:** stacked, tabs as horizontal scroll.
- **Future Enhancements:** analyst estimates, peer comparison.

---

## 7. Research Workspace

### 7.1 Research Workspace (List)

- **Purpose:** overview of all research notes, in progress or complete.
- **User:** all roles (behind `research_workspace` flag).
- **Layout:** filterable list/grid (by asset, last reviewed date, has-AI-summary).
- **Widgets:** note cards — asset, thesis excerpt, last reviewed date.
- **Actions:** create new research note; open existing.
- **Navigation:** reachable from primary nav; linked from Holding/Asset Detail.
- **Permissions:** Viewer read-only; Editor+ can create/edit; visibility of
  Personal Notes sections may be restricted per user even within a shared
  household (open question, `research-workspace.md`).
- **Data Sources:** `research`.
- **Desktop:** grid of cards, 3 columns.
- **Tablet:** 2 columns.
- **Mobile:** single column list.
- **Future Enhancements:** "needs review" surfacing (notes not reviewed in >N
  months).

### 7.2 Research Note Detail

- **Purpose:** the full structured thesis for one asset.
- **User:** all roles (behind `research_workspace` flag).
- **Layout:** sectioned single page (thesis, bull case, bear case, catalysts,
  risks, competitor analysis, management assessment, valuation notes, personal
  notes, AI summary, review history, documents) — see `research-workspace.md` for
  the full field list.
- **Widgets:** per-section editable text areas; AI Summary card with
  regenerate action and provider/model + timestamp label; review history
  timeline; linked documents list.
- **Actions:** edit any section (Editor+); regenerate AI summary; mark as
  reviewed (creates a `ResearchReviewEntry`); attach document; open linked asset.
- **Navigation:** reached from Research Workspace list, Holding Detail, or Asset
  Detail.
- **Permissions:** Viewer read-only; Editor+ can edit; Personal Notes visibility
  per the open question above.
- **Data Sources:** `research`, `ai` (`AIProvider`), `documents`.
- **Desktop:** two-column (sections | AI summary + review history + documents
  sidebar).
- **Tablet:** stacked, sidebar content moves below sections.
- **Mobile:** accordion — one section expanded at a time.
- **Future Enhancements:** section-level AI regeneration; collaborative
  commenting (Phase 6+).

---

## 8. Documents

### 8.1 Document Repository

- **Purpose:** browse, search, and manage all uploaded/generated documents.
- **User:** all roles (behind `document_repository` flag).
- **Layout:** filterable table/grid (type, category, tags, linked entity).
- **Widgets:** document cards/rows — title, type icon, category, tags, linked
  entities, upload date.
- **Actions:** upload document; edit tags/category; view version history;
  delete (Owner only, soft — see `document-management.md` versioning); link to
  entity.
- **Navigation:** reachable from primary nav; filtered views linked from
  Portfolio/Holding/Research screens.
- **Permissions:** Viewer read-only; Editor+ can upload/tag; Owner can delete.
- **Data Sources:** `documents`.
- **Desktop:** table with filter sidebar.
- **Tablet:** grid, filters in a collapsible drawer.
- **Mobile:** list, filters via a filter sheet.
- **Future Enhancements:** full-text search once `DocumentProvider` extraction
  ships; semantic search (`document-management.md`).

### 8.2 Document Detail / Viewer

- **Purpose:** view a document and its metadata/relationships/version history.
- **User:** all roles (behind `document_repository` flag).
- **Layout:** viewer pane + metadata sidebar.
- **Widgets:** inline preview (PDF/image; other types show metadata + download),
  tag editor, relationship list, version history list.
- **Actions:** download; upload new version; edit tags/relationships; unlink from
  an entity.
- **Navigation:** reached from Document Repository or any screen showing linked
  documents.
- **Permissions:** Viewer read-only (view/download); Editor+ can edit
  metadata/upload new versions.
- **Data Sources:** `documents`, `StorageProvider`.
- **Desktop:** two-column (viewer | metadata sidebar).
- **Tablet:** viewer full width, metadata below.
- **Mobile:** metadata first (viewer often requires download on small screens
  for non-image types).
- **Future Enhancements:** inline annotation.

---

## 9. AI & Alerts

### 9.1 AI Briefing

- **Purpose:** a periodic, AI-generated synthesis of portfolio state, notable
  price moves, and relevant research updates.
- **User:** all roles (behind `ai_briefing` flag).
- **Layout:** single scrollable brief, most recent first, with history.
- **Widgets:** brief content, provider/model + generation timestamp label,
  source links (which holdings/events informed this brief).
- **Actions:** regenerate on demand; view past briefs; adjust brief prompt
  preferences (Owner, via Settings).
- **Navigation:** reachable from primary nav; preview surfaced on Dashboard.
- **Permissions:** Viewer read-only; Owner can adjust generation settings/prompt.
- **Data Sources:** `ai` (`AIProvider`), `portfolio`, `analytics`, `research`.
- **Desktop:** single column, generous reading width (~800px), history
  sidebar.
- **Tablet:** single column, history as a collapsible section.
- **Mobile:** single column, history accessible via a separate list.
- **Future Enhancements:** scheduled brief delivery via `NotificationProvider`.

### 9.2 Alerts Center

- **Purpose:** view and manage system-generated alerts (price thresholds, risk
  flags, opportunities).
- **User:** all roles.
- **Layout:** list, grouped by status (active/dismissed).
- **Widgets:** alert cards — type, severity, related entity, timestamp.
- **Actions:** dismiss (raises audit record per `audit-strategy.md`); open related
  entity; configure alert rules (Owner, via Settings).
- **Navigation:** reachable from primary nav; summary surfaced on Dashboard.
- **Permissions:** Viewer can view/dismiss own notifications; Owner configures
  rules affecting the portfolio/household.
- **Data Sources:** `alerts`.
- **Desktop:** list with filters sidebar.
- **Tablet:** list, filters collapsible.
- **Mobile:** list, filters via sheet.
- **Future Enhancements:** custom alert rule builder UI.

---

## 10. Settings

### 10.1 Settings — General

- **Purpose:** manage personal preferences.
- **User:** all roles (self-scoped).
- **Layout:** grouped form sections.
- **Widgets:** currency, timezone, theme, dashboard layout reset, income targets,
  risk preferences, notification preferences.
- **Actions:** update any field (each raises `SettingsChanged`).
- **Navigation:** reachable from user menu.
- **Permissions:** self-scoped; household-level defaults editable by Owner only.
- **Data Sources:** `settings`.
- **Desktop:** two-column form.
- **Tablet:** single column.
- **Mobile:** single column, grouped into expandable sections.
- **Future Enhancements:** per-module settings namespaces as new modules ship
  (`settings-engine.md`).

### 10.2 Settings — Providers

- **Purpose:** select active AI and market data providers.
- **User:** Owner.
- **Layout:** simple selector list, one per provider category.
- **Widgets:** provider dropdown per category (`provider-architecture.md`),
  connection status indicator.
- **Actions:** change active provider (raises `SettingsChanged`; provider
  recomposition on next request).
- **Navigation:** reachable from Settings — General or admin section.
- **Permissions:** Owner only.
- **Data Sources:** `settings`, `provider-architecture.md` registry.
- **Desktop:** simple form list.
- **Tablet:** same.
- **Mobile:** same, stacked.
- **Future Enhancements:** per-provider usage/cost visibility.

### 10.3 Settings — Feature Flags

- **Purpose:** view and (for the operator) toggle feature flags.
- **User:** Owner (effectively an admin screen in the current single-operator
  model).
- **Layout:** table of flags with toggle switches.
- **Widgets:** flag name, description, current state (system/user override),
  toggle.
- **Actions:** toggle a flag (raises `SettingsChanged` + audit record).
- **Navigation:** reachable from Settings.
- **Permissions:** Owner only; not shown to Viewer/Editor roles at all.
- **Data Sources:** `feature-flags.md` registry, `settings`.
- **Desktop:** table.
- **Tablet:** table, condensed.
- **Mobile:** list.
- **Future Enhancements:** per-user override management UI (currently
  database-direct per `feature-flags.md`).

### 10.4 Audit Log Viewer

- **Purpose:** query the immutable audit trail.
- **User:** Owner.
- **Layout:** filterable table (entity type, actor, action, date range).
- **Widgets:** audit record rows — timestamp, actor, action, entity, expandable
  before/after diff.
- **Actions:** filter/search; export (future); view record detail.
- **Navigation:** reachable from Settings/admin section.
- **Permissions:** Owner only; read-only by nature (the log itself is immutable,
  `audit-strategy.md`).
- **Data Sources:** `audit`.
- **Desktop:** table with filter sidebar.
- **Tablet:** condensed table.
- **Mobile:** list, filters via sheet — audit review is a secondary mobile use
  case, so this screen is functional but not optimized for small screens.
- **Future Enhancements:** anomaly highlighting (e.g., flag unusual delete
  patterns).

### 10.5 Household / User Management

- **Purpose:** invite and manage additional users (Phase 6, multi-user).
- **User:** Owner.
- **Layout:** member list + invite form.
- **Widgets:** member rows (name, email, role), pending invitations, role
  selector.
- **Actions:** invite user; change role; revoke access.
- **Navigation:** reachable from Settings once multi-user ships.
- **Permissions:** Owner only.
- **Data Sources:** `memberships` (per `architecture.md`'s evolution path).
- **Desktop:** table + side panel invite form.
- **Tablet:** stacked.
- **Mobile:** list + full-screen invite form.
- **Future Enhancements:** granular per-portfolio role assignment (vs.
  household-wide).

---

## Screens Explicitly Deferred

Consistent with `vision.md`'s "Out of Scope" and `feature-flags.md`'s flagged
future modules, the following are not specified here and will receive their own
product-specification additions when their phase arrives: Broker Integration
connection flow, Property Module screens, Family Office multi-entity views, Tax
Planning screens, Portfolio Sharing (external, non-household) screens, and any
Commercial Features administration.
