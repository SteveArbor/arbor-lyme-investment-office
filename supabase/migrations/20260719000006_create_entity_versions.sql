-- Phase 2: entity_versions
-- Shared version history for Research, Valuation, Thesis, and Assumptions
-- (docs/development-roadmap.md Phase 2, item 10: "never overwrite
-- historical data"). One generic, append-only table rather than a
-- bespoke *_versions table per domain -- avoids duplicating the same
-- shape and RLS policies four times.

create table if not exists public.entity_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  version_number integer not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  change_note text,
  constraint entity_versions_unique unique (entity_type, entity_id, version_number)
);

comment on table public.entity_versions is
  'Append-only version history shared across every versioned domain '
  '(Research, Valuation, Thesis, Assumptions). Never updated or deleted -- '
  'a correction is a new version, not an edit to an old one, mirroring '
  'audit_events'' immutability model (docs/audit-strategy.md).';

alter table public.entity_versions enable row level security;

create policy "entity_versions_select_own"
  on public.entity_versions for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "entity_versions_insert_own"
  on public.entity_versions for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and changed_by = (select auth.uid()));

grant select, insert on public.entity_versions to authenticated;

-- No update/delete grant or policy -- append-only, same pattern as
-- audit_events (docs/database-design.md).
revoke update, delete on public.entity_versions from authenticated, anon;

-- Always assigns the next sequential version_number for the
-- (entity_type, entity_id) pair server-side, regardless of what the
-- application sends -- the application never has to compute or race on
-- this value itself. Known limitation: two concurrent writes for the
-- same entity could both read the same max() before either commits; at
-- this system's single/small-user write concurrency this is an accepted
-- simplification, not a guarantee suitable for high-concurrency use.
create or replace function public.assign_entity_version_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select coalesce(max(version_number), 0) + 1
    into new.version_number
    from public.entity_versions
    where entity_type = new.entity_type
      and entity_id = new.entity_id;
  return new;
end;
$$;

create trigger entity_versions_assign_version_number
  before insert on public.entity_versions
  for each row
  execute function public.assign_entity_version_number();

create index if not exists entity_versions_lookup_idx
  on public.entity_versions (owner_id, entity_type, entity_id, version_number desc);
