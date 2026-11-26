# Nutrition Scanner — project context for Claude Code

Read this file before doing anything. The current build spec is `docs/prototype-v0.5-spec.md` (the score; earlier: `docs/prototype-v0.4-spec.md`, `docs/prototype-v0.3-spec.md`, `docs/prototype-v0.2-spec.md`, `docs/prototype-v0.1-spec.md`).

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
| 26 Nov 2026 | Thai translation (Nathan: "continue with Thai translation", preview before merging): every on-screen text in English and Thai, side by side in `strings.js` (`i18n.js` picks the language). EN / ไทย switch at the top of the More menu, remembered on the phone; English stays the main language (Nathan: "Keep English as the main"), so the first visit is always English and the product card keeps the English name first. Thai is casual and natural, no full stops or colons; amounts keep g, mg and kcal, sentences use กรัม, มิลลิกรัม, กิโลแคลอรี; Thai dates use the Thai year. Product names, brands and ingredients from the database stay as stored. Font LINE Seed Sans TH (already bundled, has Thai). Scoring unchanged. English text unchanged. Files at ?v=r9. Long-term goal noted: 7-Eleven first, then any product with a barcode. |
| 26 Nov 2026 | Landing page built from the Figma W1 Home frames (desktop 1440, phone 390): hero with result screen preview, three steps, score bands, honest data, call to action with a QR code to the app, footer crediting Open Food Facts (ODbL). Lives at `/landing/` so the app keeps its URL at the site root. About and Privacy links left out until those pages (W4, W5) are agreed. Free hosting (GitHub Pages). |
| 26 Nov 2026 | Restyled to Bettr (Nathan: "Go ahead and restyle the live app"), from the Bettr Figma file (RIrEdDkVclTeFbX3GGMbnN, page "Bettr wireframes"): name Bettr with the wordmark; caramel, coffee and cream palette with a baby blue accent; five score colours (Great, Good, OK, Poor, Bad each its own colour) and three level colours; Figma type scale; new tab bar (raised Scan disc), buttons, score ring, rating tag pill, nutrient rows with a round icon tinted by level (Nutrition Facts caramel, replacing the per-nutrient colours), Not Available as one card. New screens: splash, skeleton loading, typing panel, light camera-blocked screen, More menu (score, data, about, Audit log for testers) opened from the menu button on Scan, torch button where the phone supports it, history grouped by day with small score circles. Welcome screen skipped (marked new idea). Store audit box stays on the result. Scoring and data unchanged. Files at ?v=r8. |
| 25 Nov 2026 | Scoring softened (Nathan): sweeteners no longer cap the score at 50; they take 10 points off, after the ceilings (Singha lemon soda zero sugar 50 → 79 Good). Sodium benzoate and other benzoates stay flagged in Watch Out but take no points off, and the dropdown explains why. "Not enough information to score yet" unchanged for now. See `docs/prototype-v0.5-spec.md`. |
| 24 Nov 2026 | Round 6 (Nathan): rating tag fixed (his phone mixed the new page with old cached code, so the tag stayed hidden; files now carry a version, `?v=r6`, bump it on every release); gauge bands overlap so no seam shows between green, orange and red; a thin line where each dropdown begins, and text-only dropdowns (additives) line up with the row title; dropdown text drops "One serving has…" and starts with the Thai daily guide ("The Thai daily guide says no more than 65 g of sugar a day."). Scoring unchanged. |
| 24 Nov 2026 | Round 5 (Nathan): score ring a little smaller (104 px); the rating tag (Good, OK…) moves out of the ring to sit above the quick stats, left-aligned with Calories, so the ring holds only the score; gauge dot a touch smaller; gauge bands joined with no gaps and flat joins, round ends only at the start and end of the arc. Scan screen: the live camera fills the whole screen behind the title, frame, buttons and "Can't scan it?" panel, with a soft dark gradient for readability; frame corners now mark the frame's real edges. Scanning, scoring and fallbacks unchanged. |
| 24 Nov 2026 | Result screen round 4 (Nathan): bigger score ring; quick stats show only values that exist (hidden when none), left-aligned with a fixed gap and more room after the ring; a Nutrition Facts value that is missing moves to the Not Available list instead of showing "Not available" in the list; dropdown chevron sits at the right of each row's title line (same spot with or without a bar); brand tag below the English and Thai names; gauge dot has no white edge, is a little bigger and darker than its band; dropdowns use real amounts (g, mg, kcal) instead of %, in the gauge and the sentence ("One serving has 33 g of protein, and the Thai daily guide is 50 g a day."). Bars, band positions and scoring unchanged. |
| 24 Nov 2026 | Result screen round 3 (Nathan, with his product card mockup): the card gets photo or bowl icon, brand chip, English and Thai names, a thin line, then a score ring coloured by rating (score/100 and label inside) and three quick stats (Calories, Protein, Fibre with their icons, same amounts as the lists). Gauge marker is a solid dot in the colour of the band under it (nutrient colour on Nutrition Facts); the % uses that colour. Dropdowns drop the UK traffic-light sentence and use slightly smaller text (14 px). Calories get a neutral size word that matches the bar, from the share of a 2,000 kcal day: under 10% Light on calories, 10 to 25% Moderate calories, 25% or more Energy-rich (Low in calories with a tick stays); carbs the same (Light on carbs, Moderate carbs, Carb-rich) with "Carbs are the body's main source of energy". Protein and fibre without a good point say Not much / Some / A fair amount by the same bar; good points with a short bar add "for its calories". "For information, not rated" removed. Scoring unchanged. |
| 24 Nov 2026 | Result screen round 2 (Nathan): product card shows only brand, name and rating (the "ingredients not available" note moves to a small developer note at the very bottom); serving size written "Per serving of 30 g (half a bag)"; headings in Title Case (Watch Out, Good Points, Nutrition Facts) with equal gaps; all Nutrition Facts icons stroke style (Carbs is now a bread slice); smaller product card corners. Each dropdown gets a half-circle gauge: three bands (green, orange, red) for Watch Out and Good Points rows, matching the three UK traffic-light levels, marker always inside the row's own band, % of the Thai daily guide in the middle; Nutrition Facts rows get a plain fill to the % of the day in the nutrient's colour. Dropdowns slide open and closed (about 0.3 s), the gauge moves from zero, reduce-motion respected. Scoring unchanged. |
| 24 Nov 2026 | Result screen polish (Nathan): product photo fills its frame (fixed a bug that showed an empty placeholder box beside it); weight line under the name removed (shown in "Per serving (70g)"); "Based on nutrition and additives" and "How the score works" removed (the no-ingredients note stays); tighter heading spacing and smaller card corners; Nutrition facts rows get an icon in each nutrient's own colour (bar in the same colour, green tick badge for good points). Watch out and Good points keep status dots. Scoring unchanged. |
| 24 Nov 2026 | Add form gets two optional free-text boxes, Ingredients list and INS or E numbers, saved on the phone and in Supabase (new columns `ingredients`, `ins_numbers`, see `supabase/add-ingredients.sql`). Either box filled counts as having the ingredients, so additives are checked. When both are empty, Open Food Facts' ingredients are used if it has them. Scoring rules unchanged. |
| 24 Nov 2026 | Five UX fixes from the UX review (Nathan: "Fix all five"): typing and photo buttons side by side so they show above the tabs on iPhone; floating "Scan another" removed (the Scan tab does it); "Try again" on network, timeout and busy errors with plain titles ("No internet connection"); an "Add the nutrition facts" button when a found product has none; on-screen text without colons and row text at least 14 px. Scoring, colours and criteria unchanged. Review: https://claude.ai/artifact/43ymoagdNx1rnD9b7kKNzJ |
| 24 Nov 2026 | Score wording on screen uses plain sentences with no colons, e.g. "Contains sodium nitrite, a preservative used in processed meat". |
| 24 Nov 2026 | 0–100 score approved (replaces the sample score): start at 100, points off per orange/red nutrient, additives of concern −15/−8 (max −30, MSG not penalised), bonus for protein, fibre and mostly fruit/veg/nuts (max +20), ceilings for warnings and sweeteners (50); healthy-fat rule for nuts, seeds and plant oils; labels Great 90+ (needs nothing in Watch out, a good point and an ingredients list), Good 75, OK 50, Poor 25, Bad. See `docs/prototype-v0.5-spec.md`. |
| 24 Nov 2026 | Replace the "Other" group with a fixed **Nutrition facts** list under Watch out / Good points: always Calories, Protein, Fibre, Carbs with amounts. Protein and fibre get a green tick at the EU claim levels (calories when low); calories are never a warning; carbs not rated. Colour rules and sample score unchanged. |
| 23 Nov 2026 | Plainer result row wording: the line under each name says what the colour means ("A bit too much sugar", "Low in sodium", "Good amount of protein"), no percentage. The dropdown is one or two sentences: % of the Thai daily guide and the reason (UK traffic-light level, EU claim, Thai sugar tax). Criteria unchanged. |
| 23 Nov 2026 | Result rows simplified: name, one short "% of recommended daily limit" line, amount, bar; the reasons (level, serving rule, sugar-tax note) move into a dropdown with a chevron, closed by default. Criteria unchanged. |
| 23 Nov 2026 | Result screen criteria (Nathan approved the Notion proposal): UK traffic-light thresholds per 100 g/ml plus the UK per-serving rule (servings > 100 g / 150 ml), total fat added, calories only judged as "low" (no high warning), protein and fibre use the EU claim levels (source / high), and drinks over 6 g sugar per 100 ml get a Thai sugar tax note. See `docs/prototype-v0.3-spec.md`. |
| 23 Nov 2026 | Shared storage for products we add: Supabase free plan (approved by Nathan). Reads public; writes only with a shared contributor passcode checked in the database (interim until contributor sign-in is decided). Values typed from the pack are shown before Open Food Facts. Products wait on the phone until they can be sent. History stays on the phone. See `docs/prototype-v0.4-spec.md`. |
| 23 Nov 2026 | Add the bottom navigation from the Figma design: History, Scan, Favorite. History lists found products saved on the phone (tap to reopen the result; reopening isn't logged as a scan). Favorite shows "Coming soon" until shared storage and sign-in are decided. |
| 22 Nov 2026 | Build v0.3, the shopper result screen from Nathan's Figma redesign: scan screen, result with verdict + score, Watch out / Good points (plus Other and Not available), not-found screen. No "See full details". Audit tools kept in a closed "Store audit" box. History and Favorite tabs not built. |
| 22 Nov 2026 | Until a scoring method is agreed, the result screen shows a **sample** score, labelled "Sample score · method not agreed yet", with all logic in `score-placeholder.js`. |
| 22 Nov 2026 | Key facts for shoppers: calories, sugar, saturated fat, sodium, protein (fibre when present). Grouped with UK front-of-pack traffic-light thresholds; bars show % of the Thai daily guide. |
| 22 Nov 2026 | Font: LINE Seed Sans TH (free, SIL OFL), with phone fonts as fallback. |
| 22 Nov 2026 | Add a "matches the label?" check to the audit (Matches / Differs / Can't tell, optional note) and let testers correct a found product's values with the timed form. A product marked Differs doesn't count as covered unless corrected. Reason: store check of 10 products found Open Food Facts values that didn't match the pack (e.g. Mama sodium 1280 vs 1760 mg, Oishi 80 vs 60 kcal). |
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
- **Don't add user accounts, analytics or tracking** unless a later spec says so. The score follows `docs/prototype-v0.5-spec.md`.
- The Supabase key in `config.js` is public by design. Never commit the contributor passcode or any secret/service key.

## What comes after v0.1 (not now)

- v0.2 — turn the prototype into the audit tool: log every scan (barcode, read first time?, found?,
  nutrition complete?), export the log as CSV, and a form to add a missing product from a label photo
  with a timer. This measures the pass marks during the 7-Eleven audit.
- Later — the 0–100 score, once a scoring method is agreed; Thai interface; native apps if the project
  passes go/no-go.
