-- A short code you can say out loud or type on a phone, as the way onto a trip
-- that device has never seen. The long code stays the real key: a join hands
-- the long one back, the device keeps that, and the short one is never used
-- again on that device.

alter table public.trips add column join_code text;

create unique index trips_join_code_key
    on public.trips (join_code)
 where join_code is not null;

-- A short code is short enough to sweep, so attempts are counted per caller and
-- cut off. Only failures are recorded: getting it right costs you nothing.
create table public.join_attempts (
  ip text        not null,
  at timestamptz not null default now()
);

create index join_attempts_ip_at on public.join_attempts (ip, at desc);

alter table public.join_attempts enable row level security;
revoke all on table public.join_attempts from anon, authenticated;

-- Exchange a short code for the trip's real key, or nothing.
create function public.trip_join(p_join_code text)
returns table (code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller text;
  fails  integer;
  hit    text;
  want   text;
begin
  want := upper(trim(coalesce(p_join_code, '')));
  if length(want) < 4 then
    raise exception 'invalid trip code';
  end if;

  -- Whoever is asking, as far as the proxy in front of us can say. An absent
  -- or malformed header must not stop the call, only group the attempts.
  begin
    caller := split_part(
      coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''),
      ',', 1);
  exception
    when others then caller := '';
  end;
  if caller is null or caller = '' then
    caller := 'unknown';
  end if;

  delete from public.join_attempts where at < now() - interval '1 day';

  select count(*) into fails
    from public.join_attempts a
   where a.ip = caller
     and a.at > now() - interval '1 hour';

  if fails >= 10 then
    raise exception 'too many attempts';
  end if;

  select t.code into hit from public.trips t where t.join_code = want;

  if hit is null then
    insert into public.join_attempts (ip) values (caller);
    return;
  end if;

  return query select hit;
end;
$$;

-- Set or clear the short code, which only someone already holding the long one
-- can do.
create function public.trip_set_join_code(p_code text, p_join_code text)
returns table (join_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  want text;
begin
  if p_code is null or length(p_code) < 32 then
    raise exception 'invalid trip code';
  end if;

  want := upper(trim(coalesce(p_join_code, '')));

  if want = '' then
    update public.trips t set join_code = null where t.code = p_code;
    return query select null::text;
    return;
  end if;

  if length(want) < 4 or length(want) > 12 or want !~ '^[A-Z0-9]+$' then
    raise exception 'a trip code is 4 to 12 letters or digits';
  end if;

  update public.trips t set join_code = want where t.code = p_code;
  if not found then
    raise exception 'no such trip';
  end if;

  return query select want;
end;
$$;

grant execute on function public.trip_join(text) to anon, authenticated;
grant execute on function public.trip_set_join_code(text, text) to anon, authenticated;

-- The app shows the short code in its settings, so the pull that fetches a
-- trip carries it too. Changing what a function returns means replacing it.
drop function public.trip_pull(text);

create function public.trip_pull(p_code text)
returns table (doc jsonb, rev integer, updated_at timestamptz, join_code text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select t.doc, t.rev, t.updated_at, t.join_code
    from public.trips t
   where t.code = p_code;
$$;

grant execute on function public.trip_pull(text) to anon, authenticated;
