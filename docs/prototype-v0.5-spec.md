# Prototype v0.5 — the 0–100 score

Approved by Nathan on 24 Nov 2026 (Notion: "Scoring method proposal: the 0–100 score", items 1–4;
MSG is not penalised). Replaces the sample score from v0.3. Everything else in v0.3/v0.4 is unchanged.

## How the score works (`score.js`)

1. Start at 100.
2. Take points off for each nutrient in Watch out:

   | Nutrient | Orange (medium) | Red (high) |
   |---|---|---|
   | Sugar | −15 | −35 |
   | Sugar in a drink over 6 g per 100 ml (Thai sugar tax line) | −30 | −70 |
   | Sodium | −15 | −35 |
   | Saturated fat | −12 | −30 |
   | Total fat | −8 | −20 |
   | Calories | 0 | — |

3. Take points off for additives of concern (below): −15 or −8 each, at most −30 in total.
4. Add points for Good points: protein and fibre +5 (source) or +10 (high); mostly fruit, vegetables,
   pulses or nuts (80% or more) +10. At most +20 in total.
5. Ceilings: any orange item, no Good point, or no ingredients list → at most 89. One red → 70, two reds
   → 45, three or more → 20 (a red additive counts as a red). Sweeteners → 50.
6. Labels: 90–100 Great (dark green), 75–89 Good, 50–74 OK, 25–49 Poor, 0–24 Bad.

The score is shown only when calories, sugar, fat, saturated fat and sodium can all be judged; otherwise
the screen says "Not enough information to score yet." Under the score: "Based on nutrition and
additives." or "Ingredients not available, so additives weren't checked." A closed "How the score works"
dropdown explains it in plain words.

## New rows and rules (`additives.js`, `nutrition-view.js`)

- **Mostly healthy fats.** Nuts, seeds, nut butters and plain plant oils (Open Food Facts category, or the
  name; never drinks) where less than a quarter of the fat is saturated: fat and saturated fat go to the
  Nutrition facts list with "Mostly healthy fats" and take no points off.
- **Sweeteners** (INS 950, 951, 952, 954, 955, 960, 961, 962, 969, or a drink with ≤ 0.5 g sugar whose
  name says Zero / Diet / Sugar free / No sugar / ไม่มีน้ำตาล): orange row "Contains sweeteners", score
  at most 50.
- **Fruit, vegetables or nuts** (Open Food Facts estimate ≥ 80%, or "100%" juice in the name): green row.
- **Additives** (only when there is an ingredients list), from Open Food Facts' additive tags plus any
  "INS 211" / "E211" written in the ingredients text:

  | Group | INS numbers | Points | Row |
  |---|---|---|---|
  | Nitrites and nitrates | 249–252 | −15, red | "Contains sodium nitrite, a preservative used in processed meat" |
  | Banned in Europe | 171 | −15, red | "Contains titanium dioxide, a colour banned in Europe" |
  | Possible carcinogen | 320 | −15, red | "Contains BHA, a preservative rated possibly cancer-causing" |
  | Colours with EU hyperactivity warning | 102, 104, 110, 122, 124, 129 | −8, orange | "Contains sunset yellow, a colour linked to hyperactivity in children" |
  | Benzoates | 210–213 | −8, orange | "Contains sodium benzoate, a preservative" |
  | Sulphites | 220–228 | −8, orange | "Contains sodium metabisulphite, a preservative that can trigger asthma" |
  | Fat preservatives | 319, 321 | −8, orange | "Contains TBHQ, a preservative for fats and oils" |
  | Flavour enhancers | 621, 627, 631, 635 | 0, info line | "Also contains MSG, a flavour enhancer. It is considered safe at normal amounts, so it doesn't change the score." (one plain line under the lists) |

Screen wording uses plain sentences with no colons (Nathan, 24 Nov 2026).

## Not in this step

- The add form doesn't ask "nuts, seeds or plant oil" yet.

## Added later (24 Nov 2026): ingredients in the add form

- Two optional free-text boxes under the nutrition boxes, "Ingredients list" and "INS or E numbers".
  Saved on the phone, in the CSV export and in the shared database (columns `ingredients` and
  `ins_numbers`, added by `supabase/add-ingredients.sql`; older rows just have them empty).
- Either box filled counts as having the ingredients list, so additives are checked and Great is possible.
  Every three digit number in the INS box counts; in the ingredients text only numbers after INS or E.
- When both boxes are empty and Open Food Facts has ingredients for the barcode, those are used instead.
- No change to the scoring rules.
- Organic, emulsifiers and phosphates.
