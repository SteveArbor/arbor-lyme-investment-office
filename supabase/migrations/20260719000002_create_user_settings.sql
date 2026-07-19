-- Foundation milestone: user_settings
-- Minimal Foundation subset of docs/settings-engine.md's full schema.
-- One row per user (system/household resolution levels described in
-- docs/settings-engine.md are not yet needed with a single user and are
-- deferred to the phase that introduces them, not built speculatively now).

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  base_currency text not null default 'GBP'
    check (base_currency in ('GBP', 'USD', 'EUR')),
  time_zone text not null default 'Europe/London',
  appearance text not null default 'system'
    check (appearance in ('light', 'dark', 'system')),
  -- Monetary values are always `numeric`, never floating point
  -- (docs/database-design.md).
  monthly_income_target numeric(14, 2) not null default 4000.00
    check (monthly_income_target >= 0),
  secondary_monthly_income_target numeric(14, 2) not null default 5000.00
    check (secondary_monthly_income_target >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_settings is
  'Foundation-scope settings only (docs/settings-engine.md defines the full '
  'future schema). Row is created automatically alongside the profile row '
  'by the handle_new_user trigger, pre-populated with Foundation defaults.';

alter table public.user_settings enable row level security;

create policy "user_settings_select_own"
  on public.user_settings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings_update_own"
  on public.user_settings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No insert/delete policy for the same reason as profiles: creation is
-- exclusively via the SECURITY DEFINER trigger.

grant select, update on public.user_settings to authenticated;

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row
  execute function public.set_updated_at();
