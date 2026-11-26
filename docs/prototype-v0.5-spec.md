# Prototype v0.5 — the 0–100 score

Approved by Nathan on 24 Nov 2026 (Notion: "Scoring method proposal: the 0–100 score", items 1–4;
MSG is not penalised). Replaces the sample score from v0.3. Everything else in v0.3/v0.4 is unchanged.

## How the score works (`score.js`)

1. Start at 100.
2. Take points off for each nutrient in Watch out:

   | Nutrient | Orange (medium) | Red (high) |
   |---|---|---|
   | Sugar | −15 | −35 |
   | Sugar in a drink over 6 g per 100 ml (Thai sugar tax line) | −15, plus 8 per gram over 6 (at most 35 more) | −35, plus 8 per gram over 6 (at most 35 more) |
   | Sodium | −15 | −35 |
   | Saturated fat | −12 | −30 |
   | Total fat | −8 | −20 |
   | Calories | 0 | — |

   **Very high** (more than twice the UK red line: sugar over 45 g per 100 g or 22.5 g per 100 ml,
   saturated fat over 10 g or 5 g, salt over 3 g or 1.5 g; not total fat): 10 more points off, and it
   counts as a second red for the ceilings. Row line "Far too much sugar" (changed 26 Nov 2026).

3. Take points off for additives of concern (below): −15 or −8 each, at most −30 in total. Benzoates
   are flagged but take no points off (changed 25 Nov 2026).
4. Add points for Good points: protein and fibre +5 (source) or +10 (high); mostly fruit, vegetables,
   pulses or nuts (80% or more) +10. At most +20 in total. Since 26 Nov 2026 protein needs at least 3 g
   per 100 g (1.5 g per 100 ml in a drink) and fibre at least 1.5 g to count as a good point.
5. Ceilings: any orange item, no Good point, or no ingredients list → at most 89. One red → 70, two reds
   → 45, three or more → 20 (a red additive counts as a red).
6. Sweeteners take 10 points off, after the ceilings, so they always count (changed 25 Nov 2026; this
   replaces the old "at most 50" ceiling). Example, Singha lemon soda zero sugar: 89 → 79 Good.
7. Labels: 90–100 Great (dark green), 75–89 Good, 50–74 OK, 25–49 Poor, 0–24 Bad.

The score is shown only when calories, sugar, fat, saturated fat and sodium can all be judged; otherwise
the screen says "Not enough information to score yet." Under the score: "Based on nutrition and
additives." or "Ingredients not available, so additives weren't checked." A closed "How the score works"
dropdown explains it in plain words.

## New rows and rules (`additives.js`, `nutrition-view.js`)

- **Mostly healthy fats.** Nuts, seeds, nut butters and plain plant oils (Open Food Facts category, or the
  name; never drinks) where less than a quarter of the fat is saturated: fat and saturated fat go to the
  Nutrition facts list with "Mostly healthy fats" and take no points off.
- **Sweeteners** (INS 950, 951, 952, 954, 955, 960, 961, 962, 969, or a drink with ≤ 0.5 g sugar whose
  name says Zero / Diet / Sugar free / No sugar / ไม่มีน้ำตาล): orange row "Contains sweeteners", 10 points
  off the score (until 25 Nov 2026 the score was capped at 50). Dropdown: "Sweeteners replace sugar, and
  the WHO advises against using them to control weight. Takes 10 points off the score." plus what was found.
- **Fruit, vegetables or nuts** (Open Food Facts estimate ≥ 80%, or "100%" juice in the name): green row.
- **Additives** (only when there is an ingredients list), from Open Food Facts' additive tags plus any
  "INS 211" / "E211" written in the ingredients text:

  | Group | INS numbers | Points | Row |
  |---|---|---|---|
  | Nitrites and nitrates | 249–252 | −15, red | "Contains sodium nitrite, a preservative used in processed meat" |
  | Banned in Europe | 171 | −15, red | "Contains titanium dioxide, a colour banned in Europe" |
  | Possible carcinogen | 320 | −15, red | "Contains BHA, a preservative rated possibly cancer-causing" |
  | Colours with EU hyperactivity warning | 102, 104, 110, 122, 124, 129 | −8, orange | "Contains sunset yellow, a colour linked to hyperactivity in children" |
  | Benzoates | 210–213 | 0, orange flag only (was −8 until 25 Nov 2026) | "Contains sodium benzoate, a preservative". Dropdown: "With vitamin C it can form small amounts of benzene, and one study linked it to hyperactivity in children. It is allowed at normal levels, so it is only flagged and takes no points off." |
  | Sulphites | 220–228 | −8, orange | "Contains sodium metabisulphite, a preservative that can trigger asthma" |
  | Fat preservatives | 319, 321 | −8, orange | "Contains TBHQ, a preservative for fats and oils" |
  | Flavour enhancers | 621, 627, 631, 635 | 0, info line | "Also contains MSG, a flavour enhancer. It is considered safe at normal amounts, so it doesn't change the score." (one plain line under the lists) |

Screen wording uses plain sentences with no colons (Nathan, 24 Nov 2026).

## Changed 25 Nov 2026 (Nathan)

- Sweeteners: the "at most 50" ceiling is gone. They now take 10 points off, applied after the ceilings
  (applied before, a zero-calorie diet drink would hit the 89 ceiling and score the same as water).
- Benzoates (INS 210–213): still an orange row in Watch out, which also keeps the product out of Great,
  but no points off. The dropdown says why it is flagged.
- "Not enough information to score yet." stays as it is for now (to be improved in a later version).
- Sample scores: Singha lemon soda zero sugar (sucralose and sodium benzoate) 50 OK → 79 Good; Singha
  soda water (no sweetener) 89 Good, unchanged.

## Changed 26 Nov 2026 (Nathan approved the 7 fixes from the fairness review)

Review doc: https://claude.ai/artifact/JksBczqjUimnoWdp73XYq7 (296 Thai products from Open Food Facts plus
our 2 typed-in products). Point sizes, bonuses, ceilings, sweetener −10, additives and labels unchanged.

1. **Drink or food.** Cooking oil (category, or "oil" / น้ำมัน in the name with 80 g fat or more) and ice
   cream are never drinks, even when sold in ml. A product with no size at all counts as a drink when
   Open Food Facts files it under beverages. Plain plant oils now get the healthy-fat rule (olive oil
   45 → 89; palm oil stays red for saturated fat).
2. **Very high** (above): 10 more points off and a second red.
3. **Sugary drinks.** Instead of doubling the sugar points above 6 g per 100 ml, each gram over 6 costs 8
   more points, at most 35. Removes the jump where 6.4 g scored 35 points lower than 6.0 g.
4. **Good points need a real amount** (protein ≥ 3 g per 100 g or 1.5 g per 100 ml, fibre ≥ 1.5 g). The
   dropdown says "There is too little protein in it to count as a good point."
5. **Sweeteners** also flagged for a drink with ≤ 0.5 g sugar that Open Food Facts files as artificially
   sweetened or diet, or whose name says Max (แม็กซ์).
6. **Total fat 0 means saturated fat 0**, for judging only (the screen still lists saturated fat as not
   available). Lets these products get a score.
7. **Portion rule without a serving size** uses the pack when it is a drink in a single can or bottle of
   600 ml or less, so a can of cola is judged the same with or without a serving size. Food packs are
   left alone (a 450 ml ice cream tub or a 230 g can of nuts is not one serving).

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
