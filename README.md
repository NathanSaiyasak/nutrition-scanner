# Nutrition Scanner — prototype v0.4 (shared storage for products we add)

A mobile web page: scan or type a product barcode and see its nutrition facts from
[Open Food Facts](https://world.openfoodfacts.org). Version 0.2 adds the store audit tool: every scan is
recorded on the phone, the record can be exported as a spreadsheet, missing products can be typed in with
a timer, and an "Audit log" screen shows the figures against the go/no-go pass marks.
Version 0.3 redesigns what a shopper sees, from Nathan's Figma design: a dark scan screen, and a result
screen with the 0–100 score (approved 24 Nov 2026) and the key facts sorted into **Watch out**, **Good points**, **Other** and
**Not available**. The audit tools are still there, in a closed "Store audit" box on the result screen.
Project rules are in `CLAUDE.md`. Build specs: `docs/prototype-v0.1-spec.md`, `docs/prototype-v0.2-spec.md`
and `docs/prototype-v0.3-spec.md`.

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The page itself: the screens you see (start, loading, product, message). |
| `style.css` | How it looks. Phone first. Uses the LINE Seed Sans TH font from `fonts/` (SIL Open Font Licence, `fonts/OFL.txt`), with the phone's own fonts as a fallback. |
| `app.js` | Switches between screens and fills in the product details. |
| `scanner.js` | Opens the rear camera and reads the barcode, or reads it from a photo you pick (the photo never leaves the phone). Uses the phone's built-in reader if it has one (Android Chrome), otherwise the library in `vendor/` (iPhone Safari). |
| `vendor/` | The free `barcode-detector` library (v3.2.4) and its reader file `zxing_reader.wasm`, kept in the project so nothing loads from other servers. MIT licence, see `vendor/LICENSES.txt`. |
| `lookup.js` | Asks Open Food Facts about a barcode and tidies up the answer. Missing values stay missing (shown as "Not available"), never 0. |
| `audit.js` | v0.2. The scan log: saves each scan in the phone's browser storage, makes the CSV spreadsheet, and works out the pass-mark figures. |
| `add-form.js` | v0.2. The timed "Add this product" form for products Open Food Facts doesn't have. |
| `nutrition-view.js` | v0.3. Sorts the key facts into Watch out / Good points / Other / Not available, with the "% of a day" bars. Thresholds are in the v0.3 spec. |
| `score.js` | v0.5. The 0–100 score and its Great / Good / OK / Poor / Bad label (`docs/prototype-v0.5-spec.md`). |
| `additives.js` | v0.5. Additives of concern, sweeteners, "mostly fruit, vegetables or nuts" and the healthy-fat check. |
| `history.js` | The History tab's list: every product found is saved in the phone's browser storage (newest first, up to 100), so it can be reopened without internet. Nothing is sent anywhere. |
| `audit-screen.js` | v0.2. The "Audit log" screen: pass-mark summary, export, recent scans, clear the log. |
| `shared-db.js` | v0.4. Products we type in from the pack: keeps them on the phone, sends them to the shared Supabase table (with the contributor passcode), and looks barcodes up in Open Food Facts and our table at the same time. |
| `config.js` | v0.4. The shared database's address and public key. Empty = products stay on the phone. |
| `supabase/setup.sql` | v0.4. Run once in Supabase: creates the table, public reading, and passcode-checked adding. |

There are no frameworks, no build step, and nothing to install. The files are served exactly as they are.

## Run it on your computer

1. Open Terminal and go to this folder: `cd "/Users/nathan_sai/Documents/Temp Storage/nutrition-scanner"`
2. Start a small local web server (Python comes with macOS): `python3 -m http.server 8000`
3. Open <http://localhost:8000> in your browser. Press Ctrl+C in Terminal to stop the server.

Opening `index.html` by double-clicking won't work, because browsers block this kind of script on `file://` pages.
The camera works on `localhost` (your Mac's webcam can scan a barcode held up to it). On a phone, the camera
needs an https:// link, so test phone scanning on the hosted link.

## Hosting

Hosted free on GitHub Pages: <https://nathansaiyasak.github.io/nutrition-scanner/>
GitHub Pages serves the files from the repository's main branch over HTTPS.

## How to update it

Change the files, save, commit and push to GitHub. The live link updates about a minute later.

## Shared product database (v0.4)

Products typed in with the timed form are saved to a shared Supabase table so every phone sees them.
Until it is set up, the app keeps them on the phone (and still shows them when that phone scans them).

Set up once (free plan, no card):

1. Go to https://supabase.com, sign in, and click **New project**. Pick the free plan, name it
   `nutrition-scanner`, region **Southeast Asia (Singapore)**, let it generate a database password
   (save it in your password manager; the app doesn't need it), click **Create new project**, wait ~2 minutes.
2. Left menu: **SQL Editor** → **New query**. Open `supabase/setup.sql` from this repo, copy all of it, paste it.
3. In the pasted text, replace `CHANGE-ME-PASSCODE` with the contributor passcode you pick (e.g. four random
   words). Keep the quotes. Click **Run**. You should see "Success. No rows returned".
4. Left menu: **Project Settings** → **Data API**: copy the **Project URL**. Then **API Keys**: copy the
   **Publishable key** (`sb_publishable_…`; if only legacy keys show, the **anon public** key). Never copy the
   secret / service_role key.
5. Put those two values in `config.js` (or send them to Claude to do it). They are public by design.
6. On each tester's phone: **Audit log** → **Shared product database** → type the passcode → **Save passcode**.

To see, fix or delete added products: Supabase → **Table Editor** → `added_products`.
To change the passcode: see the last lines of `supabase/setup.sql`. A free project pauses after 7 days
unused; open the Supabase dashboard and click **Restore** (the app falls back to Open Food Facts meanwhile).

## Using the audit tool (v0.2)

- **Scanning records itself.** Every barcode you look up is saved to the log on this phone, with how it
  was read (camera, photo or typed), how many tries it took, and what Open Food Facts had. The product
  screen shows "Saved to audit log (#N)".
- **Missing product?** On "We don't have this product yet", tap **Add this product**, type in what the label
  says, and tap **Save**. A found product with missing or incomplete nutrition has the same button under
  its nutrition table in the **Store audit** box. Products added by hand with all 8 values count towards the 90% coverage target.
- **Check the label.** On a found product, open **Store audit: check against the pack** at the bottom, compare the screen with the pack and tap **Matches**, **Differs**
  or **Can't tell**. On Differs, you can note which value is different, and tap **Correct the values from
  the label (timed)** to type in what the pack says. A product marked Differs only counts as covered once
  it's corrected. The Audit log shows how often Open Food Facts matched the pack. The timer measures the "add in 3 minutes or less" pass mark. Leave a box empty
  if the label doesn't show that value.
- **Audit log** (top right) shows the pass-mark figures, the recent scans, and the export buttons.
- **Export after every store visit.** The log lives only in this browser on this phone. iPhone Safari can
  delete a site's saved data if the site isn't opened for 7 days, and clearing Safari's website data
  deletes it too. The CSV file is your safe copy. **Clear the log** asks first, then starts fresh.
- "Read first time" means the first camera start or the first photo read the barcode. Stopping the camera
  and starting again, a photo that couldn't be read, or typing the number all count as not first time.

## Test status (v0.2 acceptance criteria)

| # | Check | Result |
|---|---|---|
| 1 | Camera, photo and typing each add one row with the right "how read", tries and read-first-time | Pass in automated test (22 Nov 2026); not yet tried on a phone |
| 2 | Stop and restart the camera before a read → tries go up, read first time = no | Pass in automated test; not yet tried on a phone |
| 3 | Found product records completeness; unknown barcode records "not found"; network failure records "error" | Pass in automated test; not yet tried on a phone |
| 4 | Log survives closing and reopening the page | Pass in automated test; not yet tried on a phone |
| 5 | CSV opens in Numbers / Excel / Google Sheets with Thai names readable | CSV checked in automated test; **open it on iPhone / Mac to confirm** |
| 6 | Add form timer runs; Save records time and values; blanks stay blank | Pass in automated test; not yet tried on a phone |
| 7 | Summary figures match the CSV; pass mark 4 shown as "checked separately" | Pass in automated test; not yet tried on a phone |
| 8 | Clear log asks first, then empties log and summary | Pass in automated test; not yet tried on a phone |
| 9 | All v0.1 checks still pass | Not yet re-checked on a phone |

The automated tests ran in a headless Chrome browser with Open Food Facts answers simulated, and with a
generated barcode picture fed to the camera and the photo picker. Real-phone checks are still needed.

## Test status (v0.1 acceptance criteria)

| # | Check | Result |
|---|---|---|
| 1 | Scan a product in Open Food Facts → name and nutrition in about 3 s | Pass on iPhone (19 Nov 2026) |
| 2 | Unknown barcode → "Product not found" with the barcode | Pass on iPhone (8856977006192) |
| 3 | Missing nutrients show "Not available", never 0 | Pass (8851351932913: saturated fat, fibre) |
| 4 | Camera denied → clear message, typing still works | Pass in automated test; not yet tried on a phone |
| 5 | Thai names display correctly | Pass on iPhone |
| 6 | Works on iPhone Safari and Android Chrome | iPhone pass; **Android not yet tested** |
| 7 | Open Food Facts credit and link on every product screen | Pass |
| 8 | Test products 8851351932913, 8853445000287, 8858867821632 + a made-up barcode | Pass on iPhone |
| 9 | This README | Done |

## Data and licence notes

- Product data and photos: Open Food Facts, licensed under ODbL (database) and CC BY-SA (photos).
  Every product screen credits Open Food Facts and links to the product's page there.
- Open Food Facts limits product lookups to about 15 per minute per device. That's fine for one
  person scanning, but too many fast lookups will show a "Too many lookups" message.
