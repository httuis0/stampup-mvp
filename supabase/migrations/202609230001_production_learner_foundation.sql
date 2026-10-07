begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  avatar_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.learner_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_language text not null default 'English',
  native_language text not null default 'Bangla',
  target_language text not null default 'English',
  teacher_voice text not null default 'female'
    check (teacher_voice in ('female', 'male')),
  learning_goal text not null default 'Daily conversation',
  daily_minutes integer not null default 20
    check (daily_minutes between 5 and 180),
  cefr_level text not null default 'A1'
    check (cefr_level in ('Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1')),
  current_unit_id text not null default 'a1-1',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.learner_settings is
  'Queryable learner preferences. Detailed progress currently lives in learner_state during the production migration.';

create table if not exists public.learner_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1
    check (schema_version > 0),
  state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state) = 'object'),
  client_updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.learner_state is
  'Versioned compatibility document used to move existing device progress into secure cloud storage without rewriting active learning flows.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists learner_settings_set_updated_at on public.learner_settings;
create trigger learner_settings_set_updated_at
before update on public.learner_settings
for each row execute function public.set_updated_at();

drop trigger if exists learner_state_set_updated_at on public.learner_state;
create trigger learner_state_set_updated_at
before update on public.learner_state
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.learner_settings enable row level security;
alter table public.learner_state enable row level security;

create policy "Learners can read their profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "Learners can insert their profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Learners can update their profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Learners can delete their profile"
on public.profiles for delete
to authenticated
using ((select auth.uid()) = id);

create policy "Learners can read their settings"
on public.learner_settings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Learners can insert their settings"
on public.learner_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Learners can update their settings"
on public.learner_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Learners can delete their settings"
on public.learner_settings for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Learners can read their state"
on public.learner_state for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Learners can insert their state"
on public.learner_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Learners can update their state"
on public.learner_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Learners can delete their state"
on public.learner_state for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.learner_settings from anon;
revoke all on public.learner_state from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.learner_settings to authenticated;
grant select, insert, update, delete on public.learner_state to authenticated;

create or replace function public.create_luma_learner_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  insert into public.learner_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_luma on auth.users;
create trigger on_auth_user_created_luma
after insert on auth.users
for each row execute function public.create_luma_learner_records();

commit;
