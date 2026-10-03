-- What "Help me decide" was asked, what it offered, and which of the three was
-- actually taken.
--
-- It is kept so the app can learn what these two travelers really choose, which
-- is the one thing the questions cannot tell it: somebody who says "keep it
-- cheap" every time and then taps the expensive one every time has told you
-- something. Nothing in here is read back into a prompt — the titles and
-- reasons are the model's own words, and feeding them back would be feeding it
-- its own output.
create table public.suggestion_sessions (
  id          uuid primary key default gen_random_uuid(),
  -- The trip it belongs to. A row cannot exist without one, which is also how
  -- the code is verified: a code that names no trip cannot write anything.
  code        text not null references public.trips (code) on delete cascade,
  day_key     text not null,
  -- Which traveler asked, as the app's own two ids. Blank when unknown.
  asked_by    text not null default '',
  -- The chip ids they answered, exactly as the edge function received them.
  answers     jsonb not null default '{}'::jsonb,
  -- The three that came back: place id or search phrase, title, cost, time.
  offered     jsonb not null default '[]'::jsonb,
  -- The one they added to the day, if any. Null means none of the three.
  taken_place text,
  taken_title text,
  taken_at    timestamptz,
  created_at  timestamptz not null default now()
);

create index suggestion_sessions_trip_idx
    on public.suggestion_sessions (code, created_at desc);

-- The same shape as the trips table: row level security on with no policies, so
-- the publishable key reaches nothing. The two functions below are the only way
-- in and both need the trip's own code.
alter table public.suggestion_sessions enable row level security;
revoke all on table public.suggestion_sessions from anon, authenticated;

-- Write down a round of suggestions. Returns the row's id, which is what the
-- phone holds on to in case one of the three is accepted a minute later.
create function public.suggestion_log(
  p_code    text,
  p_day_key text,
  p_by      text,
  p_answers jsonb,
  p_offered jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if p_code is null or length(p_code) < 32 then
    raise exception 'invalid trip code';
  end if;
  if not exists (select 1 from public.trips t where t.code = p_code) then
    raise exception 'no such trip';
  end if;

  -- Bounds rather than trust. This endpoint is open to anybody holding a trip
  -- code, so it accepts a small object and a short list and nothing else: it is
  -- a log, not somewhere to put things.
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be an object';
  end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 16 then
    raise exception 'too many answers';
  end if;
  if p_offered is null or jsonb_typeof(p_offered) <> 'array' then
    raise exception 'offered must be an array';
  end if;
  if jsonb_array_length(p_offered) > 5 then
    raise exception 'too many suggestions';
  end if;
  if length(p_answers::text) > 2000 or length(p_offered::text) > 8000 then
    raise exception 'suggestion too large';
  end if;

  insert into public.suggestion_sessions (code, day_key, asked_by, answers, offered)
       values (p_code, left(coalesce(p_day_key, ''), 80), left(coalesce(p_by, ''), 32),
               p_answers, p_offered)
    returning id into new_id;

  return new_id;
end;
$$;

-- Mark which of the three was added to the day. The code has to match the row's
-- own, so an id on its own changes nothing.
create function public.suggestion_taken(
  p_code  text,
  p_id    uuid,
  p_place text,
  p_title text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.suggestion_sessions s
     set taken_place = left(coalesce(p_place, ''), 64),
         taken_title = left(coalesce(p_title, ''), 160),
         taken_at    = now()
   where s.id = p_id
     and s.code = p_code;
$$;

grant execute on function public.suggestion_log(text, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.suggestion_taken(text, uuid, text, text) to anon, authenticated;
