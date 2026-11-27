-- Optional, for later (27 Nov 2026). The app works without these columns: every row without a status is
-- treated as verified (added by a tester with the contributor passcode).
-- status: 'verified' (tester) or 'pending' (a shopper's entry, once shoppers can add products).
-- source: 'typed' (typed from the pack) or 'ai-read' (read from a photo by the label reader, once built).
alter table added_products add column if not exists status text not null default 'verified'
  check (status in ('verified', 'pending'));
alter table added_products add column if not exists source text not null default 'typed'
  check (source in ('typed', 'ai-read'));
