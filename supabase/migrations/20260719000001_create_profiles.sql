-- Foundation milestone: profiles
-- See docs/database-design.md, docs/security-principles.md (RLS as the
-- authorization source of truth), docs/threat-model.md §7-8 (IDOR / RLS).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Row is created automatically by the '
  'handle_new_user trigger (see 20260719000004_profile_creation_trigger.sql) '
  '-- never inserted directly by application code or the client.';

alter table public.profiles enable row level security;

-- Ordinary users may read and update only their own profile. No insert
-- policy is defined: profile creation happens exclusively via the
-- SECURITY DEFINER trigger, which bypasses RLS by design (see the trigger
-- migration) -- this is deliberate, not an oversight: it removes an entire
-- class of "did the client forget to create a profile row" bugs.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Table-level grants are necessary but not sufficient: they let a query
-- reach RLS evaluation at all. RLS policies (above) are what actually
-- narrow the result to the caller's own row. Only select/update are
-- granted -- matching the two policies that exist -- since profile
-- creation happens exclusively via the trigger, not authenticated inserts.
grant select, update on public.profiles to authenticated;

-- No delete policy: a user cannot delete their own profile row through the
-- API in the Foundation milestone. Account deletion is out of scope for
-- this milestone and will be designed deliberately (including what happens
-- to owned financial data) rather than allowed as an incidental capability.

-- updated_at maintenance -----------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Shared updated_at maintenance trigger function, reused by every '
  'Foundation table that has an updated_at column.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
