-- Phase 2: decision_recommendations
-- The Decision Engine's output (docs/decision-engine.md, ADR 0023).
-- Append-only: each rating run is a new, immutable row -- never updated
-- or deleted -- so the full rating history is always available, and
-- "the current rating" is simply the most recent row. Never
-- portfolio-aware: no portfolio_id or holding data anywhere in this
-- table, by design (ADR 0023).

create table if not exists public.decision_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  inputs jsonb not null,
  quality_score numeric(5, 4) not null check (quality_score between 0 and 1),
  valuation_score numeric(5, 4) not null check (valuation_score between 0 and 1),
  overall_score numeric(5, 4) not null check (overall_score between 0 and 1),
  conviction numeric(5, 4) not null check (conviction between 0 and 1),
  rating text not null check (
    rating in ('exceptional', 'strong_buy', 'buy', 'hold', 'reduce_conviction', 'sell', 'avoid')
  ),
  conclusion_source text not null default 'deterministic_rules'
    check (conclusion_source in ('deterministic_rules', 'ai_analysis', 'manual_judgement', 'combined')),
  generated_at timestamptz not null default now()
);

comment on table public.decision_recommendations is
  'Append-only Investment Rating history. No update/delete grant, matching '
  'audit_events'' immutability model -- a rating is never corrected in '
  'place, only superseded by a newer one (docs/audit-strategy.md pattern).';

alter table public.decision_recommendations enable row level security;

create policy "decision_recommendations_select_own"
  on public.decision_recommendations for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "decision_recommendations_insert_own"
  on public.decision_recommendations for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

grant select, insert on public.decision_recommendations to authenticated;

revoke update, delete on public.decision_recommendations from authenticated, anon;

create index if not exists decision_recommendations_company_id_idx
  on public.decision_recommendations (owner_id, company_id, generated_at desc);
