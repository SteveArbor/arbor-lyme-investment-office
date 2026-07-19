-- Foundation milestone: audit_events
-- See docs/audit-strategy.md (ADR 0008) -- append-only, enforced by the
-- database, not merely by application convention.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  occurred_at timestamptz not null default now(),
  correlation_id uuid,
  -- Structured, sanitized metadata only. Application-layer sanitization
  -- (src/domain/audit) strips anything matching docs/audit-strategy.md's
  -- "must never contain" list (passwords, tokens, API keys, session data,
  -- raw documents, sensitive env values) before this column is ever
  -- written -- the database cannot enforce that content rule itself, so it
  -- is enforced once, centrally, in the audit service rather than trusted
  -- to every call site individually.
  metadata jsonb not null default '{}'::jsonb,
  source text not null default 'app' check (source in ('app', 'system')),
  outcome text not null check (outcome in ('success', 'failure'))
);

comment on table public.audit_events is
  'Append-only audit trail. INSERT only -- UPDATE and DELETE are denied to '
  'every role, including any future privileged role, by the absence of '
  'corresponding RLS policies plus an explicit privilege revocation below. '
  'See docs/audit-strategy.md.';

alter table public.audit_events enable row level security;

-- A user may read their own audit events. There is no "read all" policy in
-- Foundation (no admin/owner role distinct from the single user yet); that
-- is introduced deliberately in the multi-user phase, not implied here.
create policy "audit_events_select_own"
  on public.audit_events for select
  to authenticated
  using (actor_id = (select auth.uid()));

-- A user (via server-side application code, using the anon-key + session
-- client -- never the service role, see docs/implementation/foundation.md)
-- may insert an audit event only naming themselves as the actor. This is
-- what lets Foundation avoid a service-role client entirely: every
-- Foundation audit event (Login, Logout, SettingsChanged) is actor-initiated.
create policy "audit_events_insert_own"
  on public.audit_events for insert
  to authenticated
  with check (actor_id = (select auth.uid()));

grant select, insert on public.audit_events to authenticated;

-- Deliberately no update/delete policies -- see append-only comment above.
-- Belt-and-braces: explicitly revoke UPDATE/DELETE table privileges too,
-- so immutability does not depend on RLS policy coverage alone -- even a
-- future grant added carelessly elsewhere cannot undo this without an
-- explicit, reviewable migration re-granting it.
revoke update, delete on public.audit_events from authenticated, anon;

create index if not exists audit_events_actor_id_idx
  on public.audit_events (actor_id);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);

create index if not exists audit_events_occurred_at_idx
  on public.audit_events (occurred_at);
