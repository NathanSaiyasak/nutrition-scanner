-- Nutrition Scanner: add the Ingredients and INS numbers boxes to the shared table (24 Nov 2026).
-- Run this once, after setup.sql: Supabase > SQL Editor > New query > paste everything > Run.
-- Safe to run again. Products already in the table keep working; their two new boxes are just empty.

-- 1. Two new optional columns, kept exactly as typed.
alter table public.added_products
  add column if not exists ingredients text check (char_length(ingredients) <= 5000),
  add column if not exists ins_numbers text check (char_length(ins_numbers) <= 500);

-- 2. The add_product function now saves them too. The passcode check is unchanged.
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
    add_seconds, added_at, ingredients, ins_numbers
  ) values (
    p_product->>'barcode', coalesce(p_product->>'kind', 'new'), p_product->>'name',
    nullif(p_product->>'brand', ''), nullif(p_product->>'quantity', ''), p_product->>'basis',
    nullif(p_product->>'serving_size', ''),
    p_product->>'energy_kcal', p_product->>'fat_g', p_product->>'saturated_fat_g',
    p_product->>'carbohydrates_g', p_product->>'sugars_g', p_product->>'fibre_g',
    p_product->>'protein_g', p_product->>'salt_g', p_product->>'sodium_mg',
    (p_product->>'add_seconds')::integer, (p_product->>'added_at')::timestamptz,
    nullif(p_product->>'ingredients', ''), nullif(p_product->>'ins_numbers', '')
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.add_product(text, jsonb) from public;
grant execute on function public.add_product(text, jsonb) to anon, authenticated;
