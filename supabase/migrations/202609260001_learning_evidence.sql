begin;

create table public.lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id integer not null,
  score integer not null check (score between 0 and 100),
  correct_answers integer not null check (correct_answers >= 0),
  total_questions integer not null check (total_questions > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  completed_at timestamptz not null default now()
);
create index lesson_attempts_user_lesson_completed on public.lesson_attempts(user_id, lesson_id, completed_at desc);

create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id integer not null,
  exercise_id text not null,
  answer text not null default '',
  is_correct boolean not null,
  attempted_at timestamptz not null default now()
);
create index exercise_attempts_user_exercise on public.exercise_attempts(user_id, lesson_id, exercise_id, attempted_at desc);

create table public.skill_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null check (skill in ('Speaking','Listening','Vocabulary','Grammar','Reading')),
  score integer not null check (score between 0 and 100),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, skill)
);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  outcome text not null check (outcome in ('reviewed','missed')),
  reviewed_at timestamptz not null default now()
);
create index review_events_user_item on public.review_events(user_id, item_id, reviewed_at desc);

alter table public.lesson_attempts enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.skill_mastery enable row level security;
alter table public.review_events enable row level security;

grant select, insert on public.lesson_attempts, public.exercise_attempts, public.review_events to authenticated;
grant select on public.skill_mastery to authenticated;
create policy learner_attempts_own on public.lesson_attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy learner_exercises_own on public.exercise_attempts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy learner_mastery_own on public.skill_mastery for select to authenticated using (user_id = auth.uid());
create policy learner_reviews_own on public.review_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create function public.record_lesson_result(p_lesson_id integer, p_score integer, p_correct integer, p_total integer, p_duration integer, p_skills text[])
returns void language plpgsql security definer set search_path = '' as $$
declare item text; current_score integer;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_score not between 0 and 100 or p_total <= 0 or p_correct < 0 or p_correct > p_total or p_duration <= 0 then raise exception 'Invalid lesson result'; end if;
  insert into public.lesson_attempts(user_id, lesson_id, score, correct_answers, total_questions, duration_minutes)
  values(auth.uid(), p_lesson_id, p_score, p_correct, p_total, p_duration);
  foreach item in array coalesce(p_skills, array[]::text[]) loop
    if item in ('Speaking','Listening','Vocabulary','Grammar','Reading') then
      select score into current_score from public.skill_mastery where user_id = auth.uid() and skill = item;
      insert into public.skill_mastery(user_id, skill, score, evidence_count)
      values(auth.uid(), item, coalesce(round(coalesce(current_score, p_score) * 0.7 + p_score * 0.3), p_score), 1)
      on conflict(user_id, skill) do update set score = excluded.score, evidence_count = skill_mastery.evidence_count + 1, updated_at = now();
    end if;
  end loop;
end;
$$;
revoke all on function public.record_lesson_result(integer,integer,integer,integer,integer,text[]) from public;
grant execute on function public.record_lesson_result(integer,integer,integer,integer,integer,text[]) to authenticated;
commit;
