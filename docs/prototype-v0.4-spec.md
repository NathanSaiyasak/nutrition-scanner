# Prototype v0.4 spec — shared storage for products we add

Status: requested 23 Nov 2026 ("continue the project") after Nathan approved Supabase's free plan for products
we add ourselves (comparison: https://claude.ai/artifact/HcxkMPF9V8qwGMrSsjswND). Earlier specs: v0.1–v0.3.

## Goal

The 90% coverage pass mark counts products we add ourselves. Until now, a product typed in with the timed
form only went into one phone's audit log. v0.4 saves it to a shared database, so **any phone that scans the
barcode sees it**.

## How it works

- **Adding** (timed form, new product or correction): saved in the audit log as before, and kept on the phone.
  If the shared database is set up and this phone has the **contributor passcode**, it is sent straight away.
  Otherwise it waits on the phone and is sent automatically when the app next opens with internet and a
  passcode (or with "Send waiting products" on the Audit log screen).
- **Scanning**: the app asks Open Food Facts and our shared table at the same time. If we have typed the
  product in from its pack, our values are shown (the store check found Open Food Facts often differs from the
  pack), with the Open Food Facts photo when there is one. Otherwise Open Food Facts as before.
  Products added on this phone show on this phone even before the shared database is set up.
- **Source shown**: "Nutrition facts typed in from the pack by Nutrition Scanner testers on 23 Nov 2026" (or
  "on this phone (not in the shared database yet)"). Values are kept exactly as typed: blank = Not available,
  "<1" shown as "<1 g".
- A label typed in **per serving** only can't be compared with the per-100 traffic-light limits, so its facts
  go under "Other" and no sample score is shown.
- **Audit figures**: each scan records where its values came from. "Open Food Facts alone" counts a product
  only if Open Food Facts itself had all 8 values; total coverage counts our products too. CSV gains
  `data_source` and `open_food_facts_complete`.

## Who can read and write (interim, reversible; sign-in still undecided)

- **Read**: anyone with the app (the Supabase publishable key in `config.js` is public by design).
- **Write**: only through the `add_product` database function, which checks a shared contributor passcode
  (stored scrambled in a private table). Testers type the passcode once on the Audit log screen; it stays on
  their phone. Nobody can edit or delete rows from the app; Nathan can in the Supabase dashboard.
- No accounts, no tracking, no personal data stored. History and the audit log stay on the phone.

## Cost

$0: Supabase free plan, no card. Note: a free project pauses after 7 days without use; while paused the app
simply falls back to Open Food Facts and products saved on the phone. Pro ($25/month) only if Nathan decides.

## Setup

`supabase/setup.sql` (run once in the Supabase SQL Editor) and the two values in `config.js`. Steps are in
the README ("Shared product database").

## Acceptance criteria

1. With `config.js` empty, the app works as v0.3; an added product shows when the same phone scans it again.
2. With the database set up and the passcode entered, an added product is visible on another phone.
3. A wrong passcode is refused; products stay on the phone and are sent later.
4. Direct writes to the table with the public key are refused (tested against PostgreSQL 16 with the SQL file).
5. Works at 390 px wide with no sideways scrolling.
