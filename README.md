# Nutrition Scanner — prototype v0.1

A mobile web page: scan or type a product barcode and see its nutrition facts from
[Open Food Facts](https://world.openfoodfacts.org). Project rules are in `CLAUDE.md`, and the build spec is in
`docs/prototype-v0.1-spec.md`.

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The page itself: the screens you see (start, loading, product, message). |
| `style.css` | How it looks. Phone first. Uses the phone's own fonts, which display Thai correctly. |
| `app.js` | Switches between screens and fills in the product details. |
| `scanner.js` | Opens the rear camera and reads the barcode, or reads it from a photo you pick (the photo never leaves the phone). Uses the phone's built-in reader if it has one (Android Chrome), otherwise the library in `vendor/` (iPhone Safari). |
| `vendor/` | The free `barcode-detector` library (v3.2.4) and its reader file `zxing_reader.wasm`, kept in the project so nothing loads from other servers. MIT licence, see `vendor/LICENSES.txt`. |
| `lookup.js` | Asks Open Food Facts about a barcode and tidies up the answer. Missing values stay missing (shown as "Not available"), never 0. |

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
