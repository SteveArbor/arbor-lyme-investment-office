-- Foundation milestone: safe profile + settings creation on sign-up.
--
-- Design: a SECURITY DEFINER trigger function on auth.users, not
-- application code, creates the profiles and user_settings rows. This is
-- the mechanism referred to throughout Foundation as "why no service-role
-- client is needed" (docs/implementation/foundation.md,
-- docs/provider-architecture.md's AuthenticationProvider notes): the one
-- operation that would otherwise need elevated privilege (creating a row
-- the new user doesn't yet have an authenticated session to insert
-- themselves) is handled entirely at the database layer instead.
--
-- `security definer` runs this function with the privileges of its owner
-- (not the invoking user), which is what allows it to bypass the RLS
-- policies defined above -- required, since the new user has no rows yet
-- for those policies to match against. `set search_path` is required
-- alongside `security definer`: without pinning it, a SECURITY DEFINER
-- function is a documented Postgres privilege-escalation vector (a
-- malicious search_path could shadow `public.profiles` with an
-- attacker-controlled object). See docs/threat-model.md.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a profiles row and a Foundation-default user_settings row for '
  'every new auth.users record. security definer + pinned search_path: see '
  'inline comment above and docs/threat-model.md.';

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
