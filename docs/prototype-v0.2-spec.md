# Prototype v0.2 spec — the store audit tool

Status: Nathan approved building v0.2 on 22 Nov 2026 (no further sign-off needed). Context and rules:
`CLAUDE.md`. v0.1 spec: `docs/prototype-v0.1-spec.md`.

## Goal

Turn the v0.1 prototype into the tool Nathan uses for the 7-Eleven audit. Every scan is recorded on the
phone, so after a store visit the app can say, with real numbers, how the product measures up against
the four go/no-go pass marks. Everything v0.1 does keeps working exactly as before.

## The four pass marks (from `CLAUDE.md`)

| # | Pass mark | How v0.2 measures it |
|---|---|---|
| PM-1 | Barcodes scan cleanly ≥ 90% | Share of scans **read first time**: read by the first camera session or the first photo, without stopping and retrying, and without typing the number. |
| PM-2 | Products covered with complete nutrition ≥ 90% (changed 22 Nov 2026, was "found in free databases ≥ 40%") | Share of **different products** looked up (by barcode) that have all 8 key values (the same 8 as the v0.1 completeness note) **from either source**: Open Food Facts, or added by hand with the timed form. The target applies to this total. The summary also shows the free-database figure on its own (Open Food Facts only), so we can see how much depends on adding data ourselves. An Open Food Facts product marked **Differs** from the label (FR-22) does not count unless its label values are typed in with the timed form. Lookups that failed (network error, timeout, too many lookups) are left out. If a barcode is scanned twice, the latest lookup counts, and a product added by hand stays covered. |
| PM-3 | Manual add of a missing product ≤ 3 min | Time from tapping "Add this product" to tapping "Save" on the timed form. The summary shows how many adds took 3 minutes or less, and the typical (median) and slowest time. It counts as a pass when the typical time is 3 minutes or less. |
| PM-4 | At least one data source licensed for commercial use | **Not measured by the app.** It's a licence check done on paper. The summary says so and notes that Open Food Facts is ODbL (commercial use allowed with attribution and share-alike). |

## User stories

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-5 | auditor in a store | have every scan recorded without extra taps | I can focus on scanning the shelf |
| US-6 | auditor | export the record as a spreadsheet | I can keep it, share it and analyse it later |
| US-7 | auditor | type in a missing product from its label, with a timer running | we learn whether adding products by hand is quick enough |
| US-8 | Nathan | see the coverage figures against the pass marks | I can make the go/no-go call on evidence |

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-13 | **Scan log.** Every barcode that is looked up adds one row, saved on the phone: entry number, date and time, barcode, how it was read (camera / photo / typed), number of tries, read first time (yes/no), seconds the camera took to read it, lookup result (found / not found / error), product name, how many of the 8 key values are present, nutrition complete (yes/no). | Must |
| FR-14 | **Tries.** Counted from the start screen until a barcode is read: each camera start and each photo picked is one try. Stopping the camera and starting again, or a photo that can't be read, adds a try. Typing the number always counts as *not* read first time. | Must |
| FR-15 | **Export as CSV.** One button saves the whole log as a `.csv` spreadsheet file (opens in Excel, Numbers, Google Sheets). Thai text must display correctly. Where the phone offers it, a Share button sends the file to Files, Mail, LINE, etc. | Must |
| FR-16 | **Timed add form.** On "Product not found", and on a found product whose nutrition is missing or incomplete, an "Add this product (timed)" button opens a form with a running timer: name (required), brand, quantity, whether the values are per 100 g, per 100 ml or per serving (with serving size), then energy, fat, saturated fat, carbohydrates, sugars, fibre, protein, salt and sodium (mg). Blank means "not on the label", never 0. Save stops the timer and stores the entry and its time on the same log row. Cancel stores nothing. | Must |
| FR-17 | **Label photo, on the phone only.** The add form can take or pick a photo of the label to look at while typing. The photo is shown on screen only. It is not uploaded and not saved. | Should |
| FR-18 | **Audit summary screen.** Reached from an "Audit log" link at the top. Shows PM-1 to PM-4 with the figure, the count behind it (e.g. "18 of 20 scans"), the target, and pass / not yet. Also: total scans, products found, products found with any nutrition, lookup errors. Warns when the sample is small (fewer than 30 products). | Must |
| FR-19 | **Recent scans list** on the summary screen (newest first, last 20), so the auditor can check that scans are being recorded. | Should |
| FR-20 | **Clear log** button, with a "are you sure?" check, for starting a fresh audit after exporting. | Must |
| FR-21 | The product and "not found" screens show a small "Saved to audit log (#N)" line. | Should |
| FR-22 | **Matches the label?** (added 22 Nov 2026) On a found product with nutrition facts, the tester compares the screen with the pack and taps Matches, Differs or Can't tell. On Differs, an optional note says which value differs (e.g. "sodium 1760 mg on pack"). Saved on the scan's log row and in the CSV (`matches_label`, `label_difference_note`). Reason: Nathan's 10-product store check found Open Food Facts data that didn't match the pack (old recipe, different size or flavour under the same barcode). | Must |
| FR-23 | **Correct a found product.** After Differs, a "Correct the values from the label (timed)" button opens the timed form with the product name filled in. Saved values count towards coverage, and the CSV marks the row "yes (correction)". | Must |
| FR-24 | The Audit log shows an "Open Food Facts matches the label" figure: matches out of products checked (Matches + Differs), with Can't tell and not-checked counts. It has no pass mark yet. Unchecked products are not treated as different. | Must |

## Non-functional requirements

- **Stays on the phone.** The log lives in the browser's own storage on that phone (localStorage). No
  accounts, no backend, no tracking, nothing sent anywhere except the Open Food Facts lookup v0.1
  already does.
- **Free.** No new libraries, services or costs.
- **v0.1 unchanged.** Scanning, photo fallback, typing, the product screen and all error messages behave
  as before.
- **Honest numbers.** The summary only counts what was recorded. Values typed in the add form are kept
  as typed (no conversion, no estimates).
- **Safe spreadsheet.** Values that start with `=`, `+`, `-` or `@` get a leading apostrophe in the CSV, so
  a strange product name can't act as a spreadsheet formula.

## Known limits (tell Nathan)

- **Export after every store visit.** iPhone Safari can delete a website's saved data if the site isn't
  opened for 7 days, and clearing Safari's history or website data deletes it too. The CSV file is the
  safe copy. The app asks the browser to keep the data ("persistent storage"), but Safari may not agree.
- The log belongs to one browser on one phone. Two auditors means two logs (two CSV files).
- Products added by hand are kept in the log only. They are not sent to Open Food Facts and not shown
  if that barcode is scanned again (that could be a later step).

## Out of scope for v0.2

Score or verdict · shopper-facing design · user accounts or cloud sync · sending added products to Open
Food Facts · saving label photos · Thai interface · offline mode · native apps · any paid service.

## Acceptance criteria

1. Scanning, photo and typing each add one row with the right "how read", tries and read-first-time.
2. Stopping the camera and starting it again before a read gives tries = 2 and read first time = no.
3. A found product records its completeness (e.g. 6 of 8, complete = no); a not-found barcode records
   "not found"; a network failure records "error".
4. The log survives closing and reopening the page.
5. Export gives a CSV that opens in Numbers/Excel/Google Sheets with Thai names readable.
6. The add form shows a running timer; Save records the time and the typed values on the right row;
   blanks stay blank in the CSV.
8a. Tapping Differs on a complete product takes it out of coverage; correcting it with the timed form puts
   it back. The label-check figure and CSV columns match what was tapped.
7. The summary screen shows PM-1 to PM-3 figures that match the CSV, and PM-4 as "checked separately". PM-2
   shows total coverage (Open Food Facts plus added by hand) against 90%, and the Open Food Facts figure
   on its own.
8. Clear log asks first, then empties the log and the summary.
9. All v0.1 acceptance checks still pass (iPhone Safari; Android Chrome still to be tested).
