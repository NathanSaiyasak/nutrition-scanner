// score.js — the 0–100 score, approved by Nathan on 24 Nov 2026 (docs/prototype-v0.5-spec.md;
// Notion "Scoring method proposal: the 0–100 score"). It is built from the same levels as the
// Watch out / Good points rows (nutrition-view.js, additives.js), so the score and the colours agree.
//
// 1. Start at 100.
// 2. Take points off for each nutrient in Watch out (POINTS below). A drink over 6 g sugar per 100 ml
//    (the Thai sugar tax line) loses 8 more points for each gram over 6, at most 35. "Very high" (more
//    than twice the UK red line) loses 10 more and counts as a second red (Nathan, 26 Nov 2026).
// 3. Take points off for additives by their risk tier (Nathan, 28 Nov 2026; additives.js): high risk 15,
//    moderate 8, limited 3, no known risk 0, at most 40 in all. MSG takes 0 (Nathan, 24 Nov 2026).
// 4. Add points for Good points: protein, fibre (+5 source, +10 high), mostly fruit/vegetables/nuts (+10).
//    At most +20.
// 5. Ceilings: any orange, no Good point, or no ingredients list → 89 (so Great needs none of these);
//    1 red → 70, 2 reds → 45, 3 or more → 20 (a high risk additive counts as a red).
// 6. A drink with sweeteners scores 65 at most (Nathan, 28 Nov 2026). Each named sweetener is ranked as an
//    additive (aspartame high, acesulfame K and sucralose moderate…), so the old 10 points for any
//    sweetener (25 Nov 2026) is gone. The limit also catches diet drinks whose ingredients we can't read.
// 7. Labels: 90+ Great, 75+ Good, 50+ OK, 25+ Poor, else Bad.
// Shown only when calories, sugar, fat, saturated fat and sodium can all be judged, and the numbers
// pass the automatic hard checks (checks.js, 27 Nov 2026). The points themselves are unchanged.

import { SWEETENED_DRINK_MAX } from './additives.js?v=r18';
import { t } from './i18n.js?v=r18';

const POINTS = {
  sugars: { medium: 15, high: 35 },
  sodium: { medium: 15, high: 35 },
  satfat: { medium: 12, high: 30 },
  fat: { medium: 8, high: 20 },
};
const SUGARY_DRINK = 6; // g per 100 ml (Thai sugar tax line)
// Each gram of sugar over the line costs 8 more points, at most 35 (Nathan, 26 Nov 2026). This replaced
// "double the sugar points", which made 6.4 g score 35 points lower than 6.0 g.
const SUGAR_TAX_PER_GRAM = 8;
const SUGAR_TAX_MAX = 35;
const VERY_HIGH_POINTS = 10; // more than twice the UK red line: 10 more points and a second red
const BONUS = { protein: { good: 5, high: 10 }, fibre: { good: 5, high: 10 } };
const BONUS_MAX = 20;
const REQUIRED = ['energy', 'sugars', 'fat', 'satfat', 'sodium'];

export const SCORE_TEXT = {
  checked: '', // nothing shown when the ingredients were checked (Nathan, 24 Nov 2026)
  unchecked: t('score.unchecked'),
  missing: t('score.missing'),
  flagged: t('score.flagged'),
};

/**
 * Score a view from nutrition-view.js buildView().
 * Returns null when there is nothing to judge, { missing: true } when a key value is missing,
 * { missing: true, flagged: true } when a number fails a hard check (checks.js),
 * otherwise { score, verdict, tone, note }.
 */
export function computeScore(view) {
  if (!view || !view.judged) return null;
  const known = (key) => view.facts.some((f) => f.key === key && f.judge100 !== null);
  if (!REQUIRED.every(known)) return { missing: true, note: SCORE_TEXT.missing };
  // Numbers that can't be right (sugar above carbs, kJ stored as kcal…): show them, but don't score them.
  if (view.checks && view.checks.hard.length) return { missing: true, flagged: true, note: SCORE_TEXT.flagged };

  let minus = 0;
  let reds = 0;
  let oranges = 0;
  for (const item of view.items) {
    const pts = POINTS[item.key];
    if (!pts || (item.level !== 'medium' && item.level !== 'high')) continue;
    let p = pts[item.level];
    if (item.key === 'sugars' && view.drink) {
      const sugar = view.facts.find((f) => f.key === 'sugars').judge100;
      if (sugar > SUGARY_DRINK) p += Math.min(SUGAR_TAX_MAX, Math.round(SUGAR_TAX_PER_GRAM * (sugar - SUGARY_DRINK)));
    }
    if (item.why === 'veryHigh') { p += VERY_HIGH_POINTS; reds += 1; }
    minus += p;
    if (item.level === 'high') reds += 1; else oranges += 1;
  }

  const extras = view.extras.items;
  minus += view.extras.additivePoints;
  for (const item of extras) {
    if (item.group !== 'watch') continue;
    if (item.level === 'high') reds += 1; else oranges += 1;
  }

  let bonus = 0;
  for (const item of view.items) {
    const b = BONUS[item.key];
    if (b && item.level === 'good') bonus += item.why === 'high' ? b.high : b.good;
  }
  if (extras.some((i) => i.extra === 'fruit')) bonus += 10;
  bonus = Math.min(bonus, BONUS_MAX);

  let ceiling = 100;
  if (oranges > 0 || bonus === 0 || !view.ingredientsKnown) ceiling = 89;
  if (reds === 1) ceiling = 70;
  else if (reds === 2) ceiling = 45;
  else if (reds >= 3) ceiling = 20;

  let score = Math.max(0, Math.min(ceiling, 100 - minus + bonus));
  // Sweetened drinks: at most 65 (OK), so a diet drink never ends up near water (89).
  if (view.drink && view.extras.sweetener) score = Math.min(score, SWEETENED_DRINK_MAX);
  // verdict stays the English name (it picks the colour); the screen shows it in the chosen language.
  const [verdict, tone] = score >= 90 ? ['Great', 'great']
    : score >= 75 ? ['Good', 'good']
      : score >= 50 ? ['OK', 'warn']
        : score >= 25 ? ['Poor', 'bad']
          : ['Bad', 'bad'];
  return { score, verdict, tone, note: view.ingredientsKnown ? SCORE_TEXT.checked : SCORE_TEXT.unchecked };
}
