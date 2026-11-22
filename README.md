# Nutrition Scanner — prototype v0.2 (audit tool)

A mobile web page: scan or type a product barcode and see its nutrition facts from
[Open Food Facts](https://world.openfoodfacts.org). Version 0.2 adds the store audit tool: every scan is
recorded on the phone, the record can be exported as a spreadsheet, missing products can be typed in with
a timer, and an "Audit log" screen shows the figures against the go/no-go pass marks.
Project rules are in `CLAUDE.md`. Build specs: `docs/prototype-v0.1-spec.md` and `docs/prototype-v0.2-spec.md`.

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The page itself: the screens you see (start, loading, product, message). |
| `style.css` | How it looks. Phone first. Uses the phone's own fonts, which display Thai correctly. |
| `app.js` | Switches between screens and fills in the product details. |
| `scanner.js` | Opens the rear camera and reads the barcode, or reads it from a photo you pick (the photo never leaves the phone). Uses the phone's built-in reader if it has one (Android Chrome), otherwise the library in `vendor/` (iPhone Safari). |
| `vendor/` | The free `barcode-detector` library (v3.2.4) and its reader file `zxing_reader.wasm`, kept in the project so nothing loads from other servers. MIT licence, see `vendor/LICENSES.txt`. |
| `lookup.js` | Asks Open Food Facts about a barcode and tidies up the answer. Missing values stay missing (shown as "Not available"), never 0. |
| `audit.js` | v0.2. The scan log: saves each scan in the phone's browser storage, makes the CSV spreadsheet, and works out the pass-mark figures. |
| `add-form.js` | v0.2. The timed "Add this product" form for products Open Food Facts doesn't have. |
| `audit-screen.js` | v0.2. The "Audit log" screen: pass-mark summary, export, recent scans, clear the log. |

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

## Using the audit tool (v0.2)

- **Scanning records itself.** Every barcode you look up is saved to the log on this phone, with how it
  was read (camera, photo or typed), how many tries it took, and what Open Food Facts had. The product
  screen shows "Saved to audit log (#N)".
- **Missing product?** On "Product not found", tap **Add this product (timed)**, type in what the label
  says, and tap **Save**. The timer measures the "add in 3 minutes or less" pass mark. Leave a box empty
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
