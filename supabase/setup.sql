-- Nutrition Scanner: shared table for products our testers type in from the label.
-- Run this once in Supabase: SQL Editor > New query > paste everything > Run.
--
-- Rules it sets up:
--   * Anyone with the app can READ products (needed so every phone sees them).
--   * Nobody can write to the table directly. Adding goes through the add_product function,
--     which only accepts the contributor passcode. The passcode is stored scrambled (bcrypt).
--   * You (in the Supabase dashboard) can still view, fix and delete rows in the Table Editor.
--
-- BEFORE RUNNING: replace  CHANGE-ME-PASSCODE  near the bottom with the passcode you pick
-- (for example four random words). Keep the quotes.
-- Then also run add-ingredients.sql (it adds the Ingredients and INS numbers columns).

create extension if not exists pgcrypto with schema extensions;

-- 1. The products table. Values are kept exactly as typed from the label: empty = not on the label,
--    "0" only when the label says 0, "<1" when the label prints "less than 1".
create table if not exists public.added_products (
  id              bigint generated always as identity primary key,
  barcode         text not null check (barcode ~ '^[0-9]{6,14}$'),
  kind            text not null default 'new' check (kind in ('new', 'correction')),
  name            text not null check (char_length(name) between 1 and 200),
  brand           text check (char_length(brand) <= 100),
  quantity        text check (char_length(quantity) <= 50),
  basis           text not null check (basis in ('per serving', 'per 100 g', 'per 100 ml')),
  serving_size    text check (char_length(serving_size) <= 50),
  energy_kcal     text check (energy_kcal     ~ '^<?[0-9]+(\.[0-9]+)?$'),
  fat_g           text check (fat_g           ~ '^<?[0-9]+(\.[0-9]+)?$'),
  saturated_fat_g text check (saturated_fat_g ~ '^<?[0-9]+(\.[0-9]+)?$'),
  carbohydrates_g text check (carbohydrates_g ~ '^<?[0-9]+(\.[0-9]+)?$'),
  sugars_g        text check (sugars_g        ~ '^<?[0-9]+(\.[0-9]+)?$'),
  fibre_g         text check (fibre_g         ~ '^<?[0-9]+(\.[0-9]+)?$'),
  protein_g       text check (protein_g       ~ '^<?[0-9]+(\.[0-9]+)?$'),
  salt_g          text check (salt_g          ~ '^<?[0-9]+(\.[0-9]+)?$'),
  sodium_mg       text check (sodium_mg       ~ '^<?[0-9]+(\.[0-9]+)?$'),
  add_seconds     integer check (add_seconds between 0 and 86400),
  added_at        timestamptz,                         -- when it was typed (phone clock)
  created_at      timestamptz not null default now()   -- when it reached the database
);
create index if not exists added_products_barcode_idx on public.added_products (barcode, created_at desc);

-- 2. Reading: open to everyone. Writing directly: closed to everyone.
alter table public.added_products enable row level security;
drop policy if exists "Anyone can read added products" on public.added_products;
create policy "Anyone can read added products" on public.added_products
  for select to anon, authenticated using (true);
grant select on public.added_products to anon, authenticated;
revoke insert, update, delete, truncate on public.added_products from anon, authenticated;

-- 3. The contributor passcode, in a private area the app cannot read.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.contributor_passcode (
  id   integer primary key default 1 check (id = 1),
  hash text not null
);
insert into private.contributor_passcode (id, hash)
values (1, extensions.crypt('CHANGE-ME-PASSCODE', extensions.gen_salt('bf')))
on conflict (id) do update set hash = excluded.hash;

-- 4. Check a passcode (used by the app's "Save passcode" button).
create or replace function public.check_passcode(p_passcode text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.contributor_passcode
    where p_passcode is not null and hash = extensions.crypt(p_passcode, hash)
  );
$$;

-- 5. Add a product. Refuses (HTTP 403) when the passcode is wrong.
create or replace function public.add_product(p_passcode text, p_product jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  new_id bigint;
begin
  if not public.check_passcode(p_passcode) then
    raise exception 'Wrong contributor passcode' using errcode = '28P01';
  end if;
  insert into public.added_products (
    barcode, kind, name, brand, quantity, basis, serving_size,
    energy_kcal, fat_g, saturated_fat_g, carbohydrates_g, sugars_g, fibre_g, protein_g, salt_g, sodium_mg,
    add_seconds, added_at
  ) values (
    p_product->>'barcode', coalesce(p_product->>'kind', 'new'), p_product->>'name',
    nullif(p_product->>'brand', ''), nullif(p_product->>'quantity', ''), p_product->>'basis',
    nullif(p_product->>'serving_size', ''),
    p_product->>'energy_kcal', p_product->>'fat_g', p_product->>'saturated_fat_g',
    p_product->>'carbohydrates_g', p_product->>'sugars_g', p_product->>'fibre_g',
    p_product->>'protein_g', p_product->>'salt_g', p_product->>'sodium_mg',
    (p_product->>'add_seconds')::integer, (p_product->>'added_at')::timestamptz
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.check_passcode(text) from public;
revoke execute on function public.add_product(text, jsonb) from public;
grant execute on function public.check_passcode(text) to anon, authenticated;
grant execute on function public.add_product(text, jsonb) to anon, authenticated;

-- To change the passcode later, run (with your new passcode):
--   update private.contributor_passcode set hash = extensions.crypt('NEW-PASSCODE', extensions.gen_salt('bf'));
