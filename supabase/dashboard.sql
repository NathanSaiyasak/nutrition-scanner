-- Bettr: operations dashboard (27 Nov 2026).
-- Run this once, after scan-counts.sql: Supabase > SQL Editor > New query > paste everything > Run.
-- Safe to run again.
--
-- What it sets up:
--   1. scan_counts gets a "flags" column: what the app's number checks and entry states said about the
--      product at scan time (check-hard, check-soft, disputed, pending). Still nothing about the person.
--   2. A small security log (private.security_events): wrong passcodes typed on the Audit log screen
--      and on the dashboard, with the time and nothing else (no IP, no device).
--   3. dashboard_data(passcode): the one function the dashboard page calls. It checks the passcode
--      and returns every number on the page. The tables themselves stay closed to the public.
--   4. Optional: a separate dashboard passcode. Until you set one, the contributor passcode works.
--      To set one (recommended once more testers have the contributor passcode), run:
--        insert into private.dashboard_passcode (id, hash)
--        values (1, extensions.crypt('YOUR-DASHBOARD-PASSCODE', extensions.gen_salt('bf')))
--        on conflict (id) do update set hash = excluded.hash;
--      To go back to the contributor passcode:  delete from private.dashboard_passcode;

-- 1. Flags on scan counts.
alter table public.scan_counts
  add column if not exists flags text not null default '' check (flags ~ '^[a-z,-]{0,60}$');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scan_counts'::regclass and contype = 'p'
      and pg_get_constraintdef(oid) like '%flags%'
  ) then
    alter table public.scan_counts drop constraint if exists scan_counts_pkey;
    alter table public.scan_counts add primary key (day, barcode, outcome, missing, flags, tester);
  end if;
end $$;

-- The new 5-value version. (No default on p_flags, so phones still on the old app keep using the
-- 4-value version below without any mix-up.)
create or replace function public.count_scan(p_barcode text, p_outcome text, p_missing text, p_tester boolean, p_flags text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.scan_counts (day, barcode, outcome, missing, tester, flags, scans)
  values ((now() at time zone 'Asia/Bangkok')::date, p_barcode, p_outcome,
          coalesce(p_missing, ''), coalesce(p_tester, false), coalesce(p_flags, ''), 1)
  on conflict (day, barcode, outcome, missing, flags, tester)
  do update set scans = public.scan_counts.scans + 1;
$$;

create or replace function public.count_scan(p_barcode text, p_outcome text, p_missing text, p_tester boolean)
returns void
language sql security definer set search_path = ''
as $$
  select public.count_scan(p_barcode, p_outcome, p_missing, p_tester, '');
$$;

revoke execute on function public.count_scan(text, text, text, boolean, text) from public;
grant execute on function public.count_scan(text, text, text, boolean, text) to anon, authenticated;
revoke execute on function public.count_scan(text, text, text, boolean) from public;
grant execute on function public.count_scan(text, text, text, boolean) to anon, authenticated;

-- 2. Security log.
create table if not exists private.security_events (
  id   bigint generated always as identity primary key,
  at   timestamptz not null default now(),
  kind text not null check (kind in ('wrong-passcode-audit', 'wrong-passcode-dashboard'))
);
create index if not exists security_events_at_idx on private.security_events (at desc);

-- The Audit log screen's "Save passcode" button calls check_passcode. It now notes a wrong passcode.
-- (When add_product or add_label_check get a wrong passcode they still refuse, but that note is undone
-- along with the refused write, so only the Save passcode button and the dashboard are counted.)
create or replace function public.check_passcode(p_passcode text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  ok boolean;
begin
  select exists (
    select 1 from private.contributor_passcode
    where p_passcode is not null and hash = extensions.crypt(p_passcode, hash)
  ) into ok;
  if not ok then
    insert into private.security_events (kind) values ('wrong-passcode-audit');
  end if;
  return ok;
end;
$$;
revoke execute on function public.check_passcode(text) from public;
grant execute on function public.check_passcode(text) to anon, authenticated;

-- 3. Optional separate dashboard passcode.
create table if not exists private.dashboard_passcode (
  id   integer primary key default 1 check (id = 1),
  hash text not null
);

create or replace function private.dashboard_passcode_ok(p_passcode text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_passcode is null then false
    when exists (select 1 from private.dashboard_passcode) then exists (
      select 1 from private.dashboard_passcode where hash = extensions.crypt(p_passcode, hash))
    else exists (
      select 1 from private.contributor_passcode where hash = extensions.crypt(p_passcode, hash))
  end;
$$;

-- 4. Everything the dashboard shows, in one call.
--    p_days: how many days back (1 to 365). p_testers: include scans from testers' phones.
create or replace function public.dashboard_data(p_passcode text, p_days integer, p_testers boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_days    integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today   date := (now() at time zone 'Asia/Bangkok')::date;
  v_since   date := (now() at time zone 'Asia/Bangkok')::date - (least(greatest(coalesce(p_days, 30), 1), 365) - 1);
  v_testers boolean := coalesce(p_testers, false);
  result  jsonb;
begin
  -- Slow down guessing: after 20 wrong passcodes in 10 minutes, refuse everyone for a while.
  if (select count(*) from private.security_events
      where at > now() - interval '10 minutes') >= 20 then
    return jsonb_build_object('status', 'locked');
  end if;
  if not private.dashboard_passcode_ok(p_passcode) then
    insert into private.security_events (kind) values ('wrong-passcode-dashboard');
    return jsonb_build_object('status', 'wrong-passcode');
  end if;

  with
  counts as (
    select * from public.scan_counts
    where day >= v_since and (v_testers or not tester)
  ),
  per_day as (
    select d::date as day,
      coalesce(sum(c.scans) filter (where not c.tester), 0) as shoppers,
      coalesce(sum(c.scans) filter (where c.tester), 0) as testers,
      coalesce(sum(c.scans) filter (where c.outcome in ('pack', 'off-complete')
        and position('check-hard' in c.flags) = 0 and (v_testers or not c.tester)), 0) as covered
    from generate_series(v_since, v_today, interval '1 day') d
    left join public.scan_counts c on c.day = d::date
    group by d order by d
  ),
  -- The latest picture of each barcode in the window: its newest day, and on that day its most scanned row.
  latest as (
    select distinct on (barcode) barcode, outcome, missing, flags, day as last_day
    from counts order by barcode, day desc, scans desc
  ),
  totals as (
    select barcode, sum(scans) as scans from counts group by barcode
  ),
  pack as (
    select barcode, max(created_at) as last_added, count(*) as entries
    from public.added_products group by barcode
  ),
  checks as (
    select distinct on (barcode) barcode, verdict, note, checked_at
    from public.label_checks order by barcode, checked_at desc
  ),
  status as (
    select t.barcode, t.scans, l.outcome, l.missing, l.flags, l.last_day,
      p.entries, k.verdict, k.note,
      case
        when position('check-hard' in l.flags) > 0 then 'needs-check'
        when position('disputed' in l.flags) > 0 then 'disputed'
        when l.outcome = 'not-found' and p.barcode is null then 'not-found'
        when l.outcome = 'no-nutrition' and p.barcode is null then 'no-nutrition'
        when l.outcome = 'incomplete' and p.barcode is null then 'incomplete'
        when k.verdict = 'differs' and (p.barcode is null or p.last_added < k.checked_at) then 'differs'
        when position('pending' in l.flags) > 0 then 'pending'
        when p.barcode is null and l.outcome <> 'pack' and coalesce(k.verdict, '') <> 'matches' then 'unverified'
        else null
      end as reason,
      (p.barcode is not null and l.outcome in ('not-found', 'no-nutrition', 'incomplete')) as fixed_since
    from totals t
    join latest l using (barcode)
    left join pack p using (barcode)
    left join checks k using (barcode)
  )
  select jsonb_build_object(
    'status', 'ok',
    'generated_at', now(),
    'days', v_days,
    'since', v_since,
    'today', v_today,
    'testers_included', v_testers,
    'per_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'shoppers', shoppers,
                 'testers', testers, 'covered', covered) order by day), '[]') from per_day),
    'scans', (select coalesce(sum(scans), 0) from counts),
    'covered_scans', (select coalesce(sum(scans), 0) from counts
                      where outcome in ('pack', 'off-complete') and position('check-hard' in flags) = 0),
    'barcodes', (select count(*) from status),
    'barcodes_covered', (select count(*) from status where reason is null or reason in ('unverified', 'pending')),
    'outcomes', (select coalesce(jsonb_object_agg(outcome, n), '{}')
                 from (select outcome, sum(scans) as n from counts group by outcome) o),
    'fixed_since', (select count(*) from status where fixed_since),
    'fix_list', (select coalesce(jsonb_agg(jsonb_build_object(
                   'barcode', barcode, 'scans', scans, 'reason', reason, 'outcome', outcome,
                   'missing', missing, 'flags', flags, 'last_day', last_day, 'note', note)
                   order by scans desc, last_day desc), '[]')
                 from (select * from status where reason is not null
                       order by scans desc, last_day desc limit 200) f),
    'reasons', (select coalesce(jsonb_object_agg(reason, n), '{}')
                from (select reason, count(*) as n from status where reason is not null group by reason) r),
    'writes', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
                 'products', (select count(*) from public.added_products a
                              where (a.created_at at time zone 'Asia/Bangkok')::date = d::date),
                 'label_checks', (select count(*) from public.label_checks c
                                  where (c.checked_at at time zone 'Asia/Bangkok')::date = d::date))
                 order by d), '[]')
               from generate_series(v_since, v_today, interval '1 day') d),
    'products_total', (select count(*) from public.added_products),
    'products_barcodes', (select count(distinct barcode) from public.added_products),
    'label_checks_total', (select count(*) from public.label_checks),
    'security', jsonb_build_object(
      'wrong_audit_24h', (select count(*) from private.security_events
                          where kind = 'wrong-passcode-audit' and at > now() - interval '24 hours'),
      'wrong_dashboard_24h', (select count(*) from private.security_events
                              where kind = 'wrong-passcode-dashboard' and at > now() - interval '24 hours'),
      'wrong_window', (select count(*) from private.security_events
                       where (at at time zone 'Asia/Bangkok')::date >= v_since),
      'last_wrong', (select max(at) from private.security_events),
      'separate_dashboard_passcode', exists (select 1 from private.dashboard_passcode)
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.dashboard_data(text, integer, boolean) from public;
grant execute on function public.dashboard_data(text, integer, boolean) to anon, authenticated;
