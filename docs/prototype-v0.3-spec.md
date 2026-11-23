# Prototype v0.3 spec — the shopper result screen

Status: Nathan asked to build this on 22 Nov 2026 ("create the interface and push it to GitHub"), using his
Figma redesign ("Nathan's Design" section in the Nutrition Scanner Figma file). Context and rules: `CLAUDE.md`.
Earlier specs: `docs/prototype-v0.1-spec.md`, `docs/prototype-v0.2-spec.md`.

## Goal

Too much information was on the product screen. v0.3 shows a shopper only what matters, in the order
they look for it: what the product is, how good it is overall, what to watch out for, and what is good.
The v0.2 audit tool keeps working exactly as before.

## Screens

| Screen | What it shows |
|---|---|
| Scan | Dark camera screen: "Scan a barcode" and the live camera inside the frame, with a moving scan line. The camera starts by itself when the screen opens (the browser asks for permission the first time); A **"Tap to start the camera"** button covers the frame whenever no camera picture is showing (before it starts, if it fails, if the phone pauses it, or if nothing appears within 3 seconds), because iPhones sometimes only start the camera after a tap. "Stop camera" turns it off. An automatic start only counts as a try (FR-14) if it reads the barcode, so using a photo or typing instead isn't counted as a failed camera try. Then and a bottom panel "Can't scan it?" with **Type the barcode** and **Use a photo of the barcode**. "Audit log" stays at the top. |
| Result | Product card: photo, brand tag, English name, Thai name underneath (when different), size. Verdict pill and score (see "Score"). Then four groups: **Watch out**, **Good points**, **Other**, **Not available**. A "Scan another" button floats at the bottom. No "See full details" (Nathan, 22 Nov 2026). |
| Not found | Icon, "We don't have this product yet", the barcode, **Add this product** (the v0.2 timed form) and **Scan another product**. Error messages (network, timeout, busy) use the same layout. |

The audit-only parts of the old product screen (full nutrition table to compare with the pack, "matches
the label?" buttons, timed correction, "Saved to audit log") move into a closed **Store audit** box under
the groups, so testers can still use them and shoppers don't see them unless they open it.

## Which facts, and which group

Key facts, always shown: **calories, sugar, fat, saturated fat, sodium, protein** (fat added 23 Nov 2026).
Fibre is added when the database has it. A key fact with no value goes in **Not available** ("Not in the
database yet"), never 0.

Criteria updated 23 Nov 2026 (approved by Nathan; stakeholder table in Notion: "Result screen criteria:
Good points, Watch out, Other"). Groups use the UK front-of-pack traffic-light thresholds (FSA guidance,
2016), per 100 g, or per 100 ml for drinks:

| Fact | Low (Good points) | Medium (Watch out, orange) | High (Watch out, red) | Also High if one serving has more than |
|---|---|---|---|---|
| Sugar | ≤ 5 g (drinks ≤ 2.5 g) | in between | > 22.5 g (drinks > 11.25 g) | 27 g (drinks 13.5 g) |
| Fat | ≤ 3 g (drinks ≤ 1.5 g) | in between | > 17.5 g (drinks > 8.75 g) | 21 g (drinks 10.5 g) |
| Saturated fat | ≤ 1.5 g (drinks ≤ 0.75 g) | in between | > 5 g (drinks > 2.5 g) | 6 g (drinks 3 g) |
| Salt (sodium × 2.5) | ≤ 0.3 g | in between | > 1.5 g (drinks > 0.75 g) | 1.8 g (drinks 0.9 g) |
| Calories | ≤ 40 kcal (drinks ≤ 20) is Good (EU "low energy") | otherwise Other | no high warning (Nathan, 23 Nov 2026) | — |
| Protein | Good when ≥ 12% of calories come from protein; "High in protein" at ≥ 20% (EU claims) | otherwise Other | — | — |
| Fibre | Good when ≥ 3 g or ≥ 1.5 g per 100 kcal; "High in fibre" at ≥ 6 g or ≥ 3 g per 100 kcal (EU claims) | otherwise Other | — | — |

The serving rule (UK guidance) applies only when one serving is over 100 g (food) or 150 ml (drinks) and
the serving size is known; the note then says "High in one serving". Drinks with more than 6 g sugar per
100 ml get the note "Taxed as a sugary drink in Thailand" (Thai excise tax); it doesn't change the group.
The sample score still counts only the original five key facts as "missing", so adding fat doesn't hide it.

Each row shows the amount and a bar: the share of a day's amount, using the Thai daily guide (2,000 kcal,
sugar 65 g, fat 65 g, saturated fat 20 g, sodium 2,000 mg, protein 50 g, fibre 25 g). Amounts are **per serving**
when Open Food Facts has per-serving values and a serving size, otherwise per 100 g / 100 ml. The group
heading says which.

Grouping always compares per-100 values. When a label only gives per-serving values but the serving size
is known (e.g. "200 ml"), the per-100 value is worked out from them (18 g in 200 ml = 9 g per 100 ml); a
drink is anything sized in ml or litres and uses the drink thresholds. Without a serving size the facts
can't be compared and stay in Other. The Other group has a one-line explanation under its heading
(added 23 Nov 2026 after a Tipco orange juice showed everything in Other).

## Score

The scoring method is **not agreed yet** (CLAUDE.md). Nathan's design shows a score, so v0.3 shows a
**sample score**, clearly labelled "Sample score · method not agreed yet". All of its logic is in one file,
`score-placeholder.js`, so it can be replaced or removed in one place. It is hidden when more than two key
facts are missing.

## Not in v0.3

History and Favorite tabs (added on 23 Nov 2026, see "Bottom navigation" below) · a real scoring method · Thai interface ·
accounts, tracking, backend · any paid service. LINE Seed Sans TH (Nathan's font, SIL Open Font Licence,
free) is first in the font list, so it shows where it is installed; bundling the font files waits until we
have them (the public GitHub repo only has the Japanese version).

## Acceptance criteria

1. A found product shows the product card, verdict and sample score, and the four groups, with no full
   nutrition table on screen.
2. Mama tom yum (per 100 g: 455 kcal, sat fat 9.1 g, sugar 5.5 g, sodium 3,200 mg) puts sodium, saturated
   fat and calories in Watch out (red) and sugar in Watch out (orange); protein goes in Other.
3. A missing key fact appears under Not available, never as 0.
4. Products found with no nutrition show "Product found, but no nutrition facts yet" and no score.
5. Thai names display correctly.
6. The Store audit box still records Matches / Differs / Can't tell, offers the timed correction, and
   shows "Saved to audit log (#N)". All v0.2 acceptance criteria still pass.
7. Works at phone width (390 px) with no sideways scrolling.

## Bottom navigation (added 23 Nov 2026)

Nathan asked for the Figma bottom bar: **History**, **Scan** (middle), **Favorite**, icons above labels, the
active tab in a rounded grey pill.

- **Scan** is the scan and result flow above. The camera only runs on the Scan screen: it stops when another
  tab opens and starts again when Scan is tapped.
- **History** lists every product found, newest first, saved in this browser on this phone only (up to 100,
  each barcode once). Tapping one reopens its result screen from the saved details, without internet. A
  reopened result isn't a new scan, so nothing is added to the audit log and the Store audit buttons stay
  hidden ("scan it again to check it against the pack"). Empty state: "No scans yet" with **Scan a product**.
  **Clear history** doesn't touch the audit log.
- **Favorite** shows "Coming soon". Favorites need shared storage and sign-in, which aren't decided yet.
- The bar is hidden on the timed add form, so a tap can't lose what has been typed.
