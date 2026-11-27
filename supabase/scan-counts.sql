-- Bettr: anonymous daily scan counts and shared label checks (27 Nov 2026).
-- Run this once, after setup.sql and add-ingredients.sql:
--   Supabase > SQL Editor > New query > paste everything > Run. Safe to run again.
--
-- What it sets up:
--   * scan_counts: one row per day, barcode and result, with a running count. Each lookup adds 1.
--     No device ID, no IP address, no time of day, nothing that links two scans to one person.
--     The public cannot read it. You see it in the Table Editor (and later on the dashboard).
--   * label_checks: a tester's "matches the label?" mark, shared so the whole team sees it.
--     Written only with the contributor passcode. The public cannot read it.
-- The Privacy page (landing/privacy.html) describes exactly this. Change both together.

-- 1. Daily scan counts.
create table if not exists public.scan_counts (
  day      date    not null,                 -- Bangkok date of the scan
  barcode  text    not null check (barcode ~ '^[0-9]{6,14}$'),
  outcome  text    not null check (outcome in ('pack', 'off-complete', 'incomplete', 'no-nutrition', 'not-found')),
  missing  text    not null default '' check (missing ~ '^[a-z_,]{0,100}$'), -- e.g. 'fibre,saturated_fat'
  tester   boolean not null default false,   -- the phone has a contributor passcode (store tests)
  scans    integer not null default 0,
  primary key (day, barcode, outcome, missing, tester)
);
alter table public.scan_counts enable row level security;
revoke all on public.scan_counts from anon, authenticated;
-- No policies: the app can only add counts through count_scan below.

-- What the outcomes mean:
--   pack          typed from the pack by a tester (our own database or this phone)
--   off-complete  Open Food Facts has all 8 values
--   incomplete    Open Food Facts has some values; 'missing' lists the rest
--   no-nutrition  found, but no nutrition facts at all
--   not-found     nobody has this barcode

create or replace function public.count_scan(p_barcode text, p_outcome text, p_missing text, p_tester boolean)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.scan_counts (day, barcode, outcome, missing, tester, scans)
  values ((now() at time zone 'Asia/Bangkok')::date, p_barcode, p_outcome,
          coalesce(p_missing, ''), coalesce(p_tester, false), 1)
  on conflict (day, barcode, outcome, missing, tester)
  do update set scans = public.scan_counts.scans + 1;
$$;

revoke execute on function public.count_scan(text, text, text, boolean) from public;
grant execute on function public.count_scan(text, text, text, boolean) to anon, authenticated;

-- 2. Shared label checks.
create table if not exists public.label_checks (
  check_id   uuid primary key,               -- made on the phone per product view, so a note edit updates the same row
  barcode    text not null check (barcode ~ '^[0-9]{6,14}$'),
  verdict    text not null check (verdict in ('matches', 'differs', 'cant-tell')),
  note       text check (char_length(note) <= 500),
  source     text check (source in ('off', 'shared', 'phone')), -- which data the tester compared
  checked_at timestamptz not null default now()
);
create index if not exists label_checks_barcode_idx on public.label_checks (barcode, checked_at desc);
alter table public.label_checks enable row level security;
revoke all on public.label_checks from anon, authenticated;

create or replace function public.add_label_check(p_passcode text, p_check jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.check_passcode(p_passcode) then
    raise exception 'Wrong contributor passcode' using errcode = '28P01';
  end if;
  insert into public.label_checks (check_id, barcode, verdict, note, source)
  values ((p_check->>'check_id')::uuid, p_check->>'barcode', p_check->>'verdict',
          nullif(p_check->>'note', ''), nullif(p_check->>'source', ''))
  on conflict (check_id) do update
    set verdict = excluded.verdict, note = excluded.note, checked_at = now();
end;
$$;

revoke execute on function public.add_label_check(text, jsonb) from public;
grant execute on function public.add_label_check(text, jsonb) to anon, authenticated;

-- To look at the most scanned products that are not found (last 30 days, shoppers only):
--   select barcode, sum(scans) as scans from public.scan_counts
--   where outcome = 'not-found' and not tester and day > current_date - 30
--   group by barcode order by scans desc limit 20;
