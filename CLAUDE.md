# Nutrition Scanner — project context for Claude Code

Read this file before doing anything. The current build spec is `docs/prototype-v0.2-spec.md` (v0.1: `docs/prototype-v0.1-spec.md`).

## What this project is

A Yuka-style phone app for Thailand: scan the barcode on a packaged product and see what is in it.
First users are people shopping at **7-Eleven Thailand**. Owner: **Nathan Sai** (Bangkok, UTC+7).

It is a low-cost, self-funded project. The current phase is **feasibility**: the goal is to find out,
with evidence, whether the product is worth building commercially. The hardest problem is **data, not
scanning**: a barcode only identifies a product, so the app depends on a database that maps barcodes to
nutrition facts, and Thai coverage is unproven.

## Where the decisions live

These are the source of truth. Code follows them; if code and docs disagree, ask Nathan.

- Requirements doc (Notion, stakeholder-facing): https://app.notion.com/p/41bec8857c46819d949bdf7caf6efb0c
- Task board (Notion): https://app.notion.com/p/41bec8857c4681dc84d6f8b7571bbe57
- Living project brief (Claude doc, private to Nathan): https://claude.ai/artifact/Sdb3G45TaHKryfdXCZYmMD
- Audit tracker sheet (Claude sheet): https://claude.ai/artifact/8iyyyEuPoH4sPAQH8skdkW

You may not be able to open these links. Everything you need for the current build is in this repo.

## Decisions already made (do not reopen without asking Nathan)

| Date | Decision |
|---|---|
| 22 Nov 2026 | Coverage pass mark changed: the app must cover ≥ 90% of 7-Eleven products with complete nutrition, counting products we add ourselves where free databases have no data (replaces "found in free databases ≥ 40%"). The audit shows free-database coverage and total coverage; the 90% target applies to the total. Creating and storing our own data is part of the plan. |
| 22 Nov 2026 | Build v0.2, the audit tool (scan log on the phone, CSV export, timed add form, pass-mark summary), with no further spec sign-off. Data stays on the phone; no backend or accounts. |
| 19 Nov 2026 | Added to v0.1: read a barcode from a photo (taken or from the photo library) as another fallback to the live camera. The photo is read on the phone, never uploaded. |
| 19 Nov 2026 | Tech approach approved: plain HTML/CSS/JS (no framework, no build step), `barcode-detector` library (MIT) for scanning, Open Food Facts API v2, GitHub Pages hosting. |
| 19 Nov 2026 | Sodium is always shown in mg next to salt (Thai labels use sodium). |
| 19 Nov 2026 | An explicit 0 recorded in Open Food Facts is shown as 0; "Not available" only when there is no value (OK for now). |
| 19 Nov 2026 | A product found with no nutrition data shows "Product found, but no nutrition facts yet". |
| 19 Nov 2026 | Completeness counts the 8 FR-5 values per 100 g/ml (salt counts if salt or sodium present); per-serving values shown but not counted. |
| 19 Nov 2026 | Product name: English as main name, Thai name shown underneath when different. |
| 19 Nov 2026 | Build with Claude Code. |
| 19 Nov 2026 | Prototype platform: **mobile web** (opens from a link; no app store). |
| 19 Nov 2026 | Prototype v0.1 scope: **scan a barcode → show nutrition facts**. Nothing else yet. |
| 19 Nov 2026 | **No score** in the prototype ("75/100 – Good" waits until the scoring method is agreed). |
| 17 Nov 2026 | Direction: prototype first, later used as the audit tool in 7-Eleven stores. |
| 17 Nov 2026 | Interface language: **English first**, Thai later. |
| 17 Nov 2026 | Keep cost as low as possible. Any paid option is flagged to Nathan for a decision first. |
| 17 Nov 2026 | Go/no-go pass marks: barcodes scan cleanly ≥ 90%; products found with complete nutrition ≥ 40% (changed 22 Nov 2026, see above); manual add of a missing product ≤ 3 min; at least one data source licensed for commercial use. |

## What we know about the data

- Product data comes from **Open Food Facts** (free, open, community-edited; licence ODbL, which
  requires attribution and share-alike for the database; images have their own terms).
- A desk check on 17 Nov 2026 found about 9,750 products sold in Thailand on Open Food Facts; about 85%
  have a nutrition table and about 60% have ingredients. 7-Eleven own brands (7-11, CP, EZY Taste,
  EZY Sweet, EZYGO) are present. How much of a real 7-Eleven shelf is covered is **unknown**.
- Many Thai entries are incomplete (e.g. saturated fat or fibre missing) and Thai ingredient text is often
  unrecognised. The app must handle missing fields honestly, never show a blank as zero.
- Thai retail barcodes are usually EAN-13 starting with 885.

## How to work on this project

- **Stay in scope.** Build only what the current spec asks for. If something else seems needed, propose
  it and wait for a yes.
- **Free first.** No paid APIs, services or accounts without Nathan's explicit approval. Say what it
  costs and what the free alternative is.
- **Explain in plain language.** Nathan is learning how software projects run. After each piece of work,
  say in a few sentences what you did, why, and how to try it. Avoid unexplained jargon.
- **Small steps, working at each step.** Commit in small, working increments with clear messages.
- **Honest data display.** Show the data source, show "not available" for missing values, never invent
  or estimate nutrition values.
- **Log decisions.** When Nathan decides something new, add a row to the table above (newest first).
- **Don't add a score, user accounts, analytics or tracking** unless a later spec says so.

## What comes after v0.1 (not now)

- v0.2 — turn the prototype into the audit tool: log every scan (barcode, read first time?, found?,
  nutrition complete?), export the log as CSV, and a form to add a missing product from a label photo
  with a timer. This measures the pass marks during the 7-Eleven audit.
- Later — the 0–100 score, once a scoring method is agreed; Thai interface; native apps if the project
  passes go/no-go.
