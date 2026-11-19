# Prototype v0.1 spec — scan a barcode, show the nutrition facts

Status: approved by Nathan, 19 Nov 2026. Context and rules: `CLAUDE.md`.

## Goal

A mobile web page that a person opens on their phone, points at a product's barcode, and sees that
product's nutrition facts within a few seconds. It proves the basic loop works on real Thai products
and real phones, and is the base that v0.2 (the audit tool) builds on.

## User stories

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-1 | 7-Eleven shopper | scan a product's barcode with my phone camera | I don't have to type anything |
| US-2 | 7-Eleven shopper | see the product's nutrition facts clearly | I know what I'm about to eat or drink |
| US-3 | 7-Eleven shopper | be told clearly when a product isn't found or data is missing | I don't trust a wrong or empty result |
| US-4 | 7-Eleven shopper | type the barcode number if the camera can't read it | a damaged or curved barcode doesn't stop me |

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Open the phone's rear camera from the page and read EAN-13 / EAN-8 / UPC-A barcodes | Must |
| FR-2 | Manual entry: a field to type a barcode number, as a fallback | Must |
| FR-3 | Look the barcode up in Open Food Facts | Must |
| FR-4 | Show product name, brand, quantity and a front photo if available | Must |
| FR-5 | Show a nutrition table per 100 g / 100 ml: energy (kcal), fat, saturated fat, carbohydrates, sugars, fibre, protein, salt (and sodium if salt is absent). Per serving too if available | Must |
| FR-6 | Every missing value shows "Not available", never 0 or blank | Must |
| FR-7 | Clear "Product not found" screen showing the barcode, with "Scan another" | Must |
| FR-8 | Clear error states: camera permission denied, no camera, network error, lookup timed out | Must |
| FR-9 | "Data from Open Food Facts" attribution with a link to the product's Open Food Facts page | Must |
| FR-10 | "Scan another" returns to the scanner in one tap | Must |
| FR-11 | A small "data completeness" note when key nutrients are missing (e.g. "3 of 8 values missing") | Should |
| FR-12 | Photo fallback: pick or take a photo of a barcode and read it on the phone (added 19 Nov 2026) | Should |

## Non-functional requirements

- **Mobile first:** works on current iPhone Safari and Android Chrome. Test both.
- **HTTPS:** browsers only allow camera access on secure (HTTPS) pages or localhost.
- **Fast:** result on screen within about 3 seconds on a normal mobile connection.
- **Free:** free libraries and free hosting only.
- **English interface**, but product names and text from the database may be Thai and must display
  correctly (UTF-8, a font that renders Thai).
- **Privacy:** no accounts, no tracking, no analytics, nothing stored about the user.
- **Simple to change:** prefer a small, readable codebase over a heavy framework. Explain the choice.

## Technical notes (verify; do not take on trust)

- **Barcode reading:** the browser `BarcodeDetector` API is not available in every browser (check iOS
  Safari support at build time). Use a maintained open-source JavaScript barcode library as the main
  reader or as the fallback, so iPhone and Android both work. Pick one, explain why, note its licence.
- **Open Food Facts API:** read-only product lookup by barcode needs no account. Check the current API
  docs (https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) for the endpoint,
  the fields to request (ask only for the fields you show), the response for "not found", and their
  rules for apps (e.g. identifying the app with a custom User-Agent, rate limits). Follow those rules.
- **Hosting:** a free static host with HTTPS (e.g. GitHub Pages, Netlify or Vercel free tiers). Propose
  one and explain the steps for Nathan.

## Out of scope for v0.1

Score or verdict · scan log or export (v0.2) · adding missing products (v0.2) · user accounts ·
history or favourites · Thai interface · offline mode · native apps · any paid service.

## Acceptance criteria (done means all of these pass)

1. On Nathan's phone, opening the hosted link and scanning a product found in Open Food Facts shows its
   name and nutrition table within about 3 seconds.
2. Scanning or typing a barcode that isn't in Open Food Facts shows "Product not found" with the barcode.
3. A product with missing nutrients shows "Not available" for each missing value, never 0.
4. Denying camera permission shows a clear message and the manual-entry field still works.
5. Thai product names display correctly.
6. Works on iPhone Safari and on Android Chrome.
7. Open Food Facts attribution and link are visible on every product screen.
8. Test with at least these Thai products found on Open Food Facts during the desk check:
   `8851351932913` (7-Eleven cake: has a nutrition table but saturated fat and fibre missing),
   `8858867821632` (EZY Sweet Thai tea eclair), `8853445000287` (Srifah honey toast), plus one made-up
   barcode to test "not found".
9. README explains in plain language how to run it locally, how it is hosted, and how to update it.
