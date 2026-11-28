// nutrition-view.js — v0.3 (criteria updated 23 Nov 2026; healthy fats and extra rows added 24 Nov 2026).
// Turns a product from lookup.js into the shopper view: Watch out / Good points / Nutrition facts / Not available.
// Rules and thresholds: docs/prototype-v0.3-spec.md and docs/prototype-v0.5-spec.md.
// Never invents a value: a missing number goes in "Not available".
import { extraRows, nutType } from './additives.js?v=r21';
import { t, lang } from './i18n.js?v=r21';
import { checkNumbers } from './checks.js?v=r21';

// Thai daily guide amounts, used for the "% of a day" bars.
const DAILY = { energy: 2000, sugars: 65, fat: 65, satfat: 20, sodium: 2000, protein: 50, fibre: 25, carbs: 300 };

// UK front-of-pack traffic-light thresholds (FSA guidance, 2016), per 100 g (food) or per 100 ml
// (drinks): [low ≤, high >]. Salt is in g (sodium mg ÷ 400).
const LIMITS = {
  sugars: { food: [5, 22.5], drink: [2.5, 11.25] },
  fat:    { food: [3, 17.5], drink: [1.5, 8.75] },
  satfat: { food: [1.5, 5], drink: [0.75, 2.5] },
  salt:   { food: [0.3, 1.5], drink: [0.3, 0.75] },
};

// UK portion rule: when one portion is over 100 g (food) or 150 ml (drinks), a nutrient is High if the
// portion has more than this (30% of the daily maximum for food, 15% for drinks). Salt in g.
const PORTION_MIN = { food: 100, drink: 150 };
const PORTION_HIGH = {
  sugars: { food: 27, drink: 13.5 },
  fat:    { food: 21, drink: 10.5 },
  satfat: { food: 6, drink: 3 },
  salt:   { food: 1.8, drink: 0.9 },
};

// Thai excise tax on sugary drinks applies above 6 g sugar per 100 ml (score.js adds points per gram over it).
const THAI_SUGAR_TAX = 6;

// Smallest amounts that can count as a good point (Nathan, 26 Nov 2026), per 100 g or 100 ml.
const PROTEIN_MIN = { food: 3, drink: 1.5 };
const FIBRE_MIN = 1.5;

/**
 * Build the shopper view of a product.
 * Returns { basisLabel, groups: [{ id, title, items }], items, facts, drink, healthyFat, extras, ingredientsKnown, judged, checks }
 * Each item: { key, name, amount, note, details (string[]), pct (0–100+ or null), tone: 'bad'|'warn'|'good'|'na', level }
 */
export function buildView(p) {
  const row = (key) => p.rows.find((r) => r.key === key);
  const drink = isDrink(p, row('fat').per100);
  const per = drink ? 'ml' : 'g';

  // Sodium in mg: from sodium, or from salt (salt ÷ 2.5 = sodium; a unit conversion, not an estimate).
  const sodium = row('sodium');
  const salt = row('salt');
  const sodium100 = sodium.per100 ?? (salt.per100 !== null ? salt.per100 * 400 : null);
  const sodiumServ = sodium.perServing ?? (salt.perServing !== null ? salt.perServing * 400 : null);
  const sodiumLess = sodium.per100 !== null || sodium.perServing !== null ? sodium.lessThan : salt.lessThan;

  // lessThan: the label printed "less than" (e.g. "<1 g"), only for products we typed in.
  const fact = (key, name, unit, r) => ({ key, name, unit, per100: r.per100, perServing: r.perServing, lessThan: Boolean(r.lessThan) });
  const facts = [
    fact('energy', t('nut.energy'), 'kcal', row('energy-kcal')),
    fact('sugars', t('nut.sugars'), 'g', row('sugars')),
    fact('fat', t('nut.fat'), 'g', row('fat')),
    fact('satfat', t('nut.satfat'), 'g', row('saturated-fat')),
    fact('sodium', t('nut.sodium'), 'mg', { per100: sodium100, perServing: sodiumServ, lessThan: sodiumLess }),
    fact('protein', t('nut.protein'), 'g', row('proteins')),
  ];
  facts.push(fact('fibre', t('nut.fibre'), 'g', row('fiber')));
  facts.push(fact('carbs', t('nut.carbs'), 'g', row('carbohydrates')));
  // The facts that decide the basis, the colours and the sample score: the same set as before
  // 24 Nov 2026 (fibre only when it has a value). Carbs are shown with a plain description, never rated.
  const core = facts.filter((f) => f.key !== 'carbs' && !(f.key === 'fibre' && f.per100 === null && f.perServing === null));

  // Per serving only when every fact that has a value also has a per-serving value, and either the
  // serving size is known or there are no per-100 values at all (a label typed in "per serving").
  const present = core.filter((f) => f.per100 !== null || f.perServing !== null);
  const allServing = present.length > 0 && present.every((f) => f.perServing !== null);
  const useServing = allServing && (Boolean(p.servingSize) || present.every((f) => f.per100 === null));
  const basisLabel = useServing
    ? servingText(p.servingSize)
    : t('basis.per100', { unit: t(`unit.${per}`) });
  const missingNote = t(p.source === 'shared' || p.source === 'phone' ? 'result.missingTyped' : 'result.missingDb');

  // Judging uses per-100 values. When the label only gave per-serving values but the serving size is
  // known (e.g. "200 ml"), work out per 100 from it: plain arithmetic on the label's own numbers,
  // like salt to sodium, not an estimate. Without a serving size the fact can't be judged.
  const servingAmount = parseServing(p.servingSize);
  // The portion for the UK portion rule: the serving size, or, for a drink with none, the whole can or
  // bottle when it is 600 ml or less (Nathan, 26 Nov 2026). Without this, the same can of cola was red
  // with a serving size and orange without one. Food packs are left alone: a 450 ml ice cream tub or a
  // 230 g can of nuts is not one serving.
  const portionAmount = servingAmount ?? (drink ? singlePack(p.quantity) : null);
  for (const f of facts) {
    f.judge100 = f.per100 ?? (f.perServing !== null && servingAmount ? (f.perServing * 100) / servingAmount : null);
    // Amount in one portion, for the UK portion rule (only for big portions, see PORTION_MIN).
    const bigPortion = portionAmount && portionAmount > PORTION_MIN[drink ? 'drink' : 'food'];
    f.portion = !bigPortion ? null
      : (servingAmount ? f.perServing : null) ?? (f.per100 !== null ? (f.per100 * portionAmount) / 100 : null);
  }
  // No fat at all means no saturated fat: plain arithmetic, like salt to sodium, not an estimate
  // (Nathan, 26 Nov 2026). Used only for judging; the screen still shows saturated fat as not available.
  const fatFact = facts.find((f) => f.key === 'fat');
  const satFact = facts.find((f) => f.key === 'satfat');
  if (satFact.judge100 === null && fatFact.judge100 === 0) satFact.judge100 = 0;

  const energy100 = facts[0].judge100;
  // Mostly healthy fats (approved 24 Nov 2026): nuts, seeds and plain plant oils where less than a
  // quarter of the fat is saturated aren't warned about for fat or saturated fat.
  const fat100 = facts.find((f) => f.key === 'fat').judge100;
  const type = nutType(p, drink, fat100);
  const sat100 = facts.find((f) => f.key === 'satfat').judge100;
  const healthyFat = Boolean(type) && fat100 !== null && sat100 !== null && fat100 > 0 && sat100 / fat100 < 0.25;
  const items = facts.map((f) => {
    const amountValue = useServing ? f.perServing : f.per100;
    if (amountValue === null) {
      // A fact with no value isn't listed under Nutrition Facts or in the card's quick stats (Nathan,
      // 24 Nov 2026). It goes in the "Not Available" list at the bottom, so a blank is never hidden.
      const group = 'missing';
      return { key: f.key, name: f.name, amount: t('common.notAvailable'), note: missingNote, details: [], pct: null, tone: 'na', group, missing: true };
    }
    const pct = Math.round((amountValue / DAILY[f.key]) * 100);
    const amount = `${f.lessThan ? '<' : ''}${format(amountValue, f.unit)} ${f.unit}`;
    const { level, why } = healthyFat && (f.key === 'fat' || f.key === 'satfat')
      ? { level: 'neutral', why: 'healthyFat' } : classify(f, drink, energy100);
    // The row shows one plain line ("A bit too much sugar"); a one- or two-sentence dropdown under it
    // gives the % of the daily guide and why (Nathan, 23 Nov 2026). All wording is in strings.js.
    const note = subtitle(f, level, why, energy100, pct, useServing);
    const details = [explain(f, { level, why, drink, pct, amountValue, useServing, energy100 })];
    const gauge = gaugeFor(f, { level, why, drink, pct, amountValue, useServing, servingAmount });
    const tone = { high: 'bad', medium: 'warn', low: 'good', good: 'good', neutral: 'na' }[level];
    // Calories, protein, fibre and carbs always go in the Nutrition facts list (Nathan, 24 Nov 2026),
    // with a green tick when they are a good point. The rules that decide good are unchanged.
    const group = FACT_KEYS.includes(f.key) ? 'facts'
      : level === 'high' || level === 'medium' ? 'watch' : level === 'neutral' ? 'facts' : 'good';
    const mark = group === 'facts' && tone === 'good' ? 'tick' : null;
    return { key: f.key, name: f.name, amount, note, details, pct, tone, level, why, group, mark, gauge };
  });

  // Additives, sweeteners and "mostly fruit, vegetables or nuts" (approved 24 Nov 2026).
  const sugar100 = facts.find((f) => f.key === 'sugars').judge100;
  const extras = extraRows(p, { drink, sugar100, nutType: type });
  const all = [...items, ...extras.items];

  const order = { high: 0, medium: 1 };
  const watch = all.filter((i) => i.group === 'watch')
    .sort((a, b) => (order[a.level] - order[b.level]) || ((b.pct ?? -1) - (a.pct ?? -1)));

  // judged: at least one fact could be compared with the limits (needs a per-100 value, or a
  // per-serving value with a known serving size). If none could, there are no colours and no sample score.
  const judged = core.some((f) => f.judge100 !== null);
  // Nutrition facts: calories, protein, fibre, carbs in that order, then any fact that couldn't be rated
  // or that has mostly healthy fats.
  const rank = (i) => (FACT_KEYS.includes(i.key) ? FACT_KEYS.indexOf(i.key) : FACT_KEYS.length);
  const factItems = all.filter((i) => i.group === 'facts').sort((a, b) => rank(a) - rank(b));
  const unjudged = factItems.some((i) => !i.missing && !i.extra && i.key !== 'carbs'
    && facts.find((f) => f.key === i.key).judge100 === null);
  const factsHint = unjudged
    ? t('result.factsHint')
    : null;

  const groups = [
    { id: 'watch', title: t('group.watch'), items: watch },
    { id: 'good', title: t('group.good'), items: all.filter((i) => i.group === 'good') },
    { id: 'facts', title: t('group.facts'), hint: factsHint, items: factItems },
    { id: 'missing', title: t('group.missing'), items: items.filter((i) => i.group === 'missing') },
  ].filter((g) => g.items.length > 0);

  // Automatic number checks (27 Nov 2026, checks.js): a hard failure means no score.
  const checks = checkNumbers(p, facts, { drink, servingAmount });

  return {
    basisLabel, groups, items, facts, drink, healthyFat, extras, judged, checks,
    infoLine: extras.infoLine,
    ingredientsKnown: Boolean(p.ingredientsKnown),
  };
}

// All shopper-facing wording for the rows lives in strings.js (English and Thai side by side), under
// row.* (subtitles), why.* (dropdown sentences), noun.* and nut.*. {n} = nutrient word, {daily} = the daily
// guide amount. Each entry is a whole sentence or phrase (no pieces glued together), so Thai can change
// the word order.
const sub = (key, vars) => t(`row.${key}`, vars); // the line under a row's name
const whyText = (key, vars) => t(`why.${key}`, vars); // the dropdown sentences
const noun = (key) => t(`noun.${key}`);

const LIMIT_KEYS = ['sugars', 'fat', 'satfat', 'sodium'];
// Always listed under "Nutrition facts", in this order (Nathan, 24 Nov 2026).
const FACT_KEYS = ['energy', 'protein', 'fibre', 'carbs'];

// The one-line subtitle under a row's name. Describes what classify() decided; never changes it.
function subtitle(f, level, why, energy100, pct, useServing) {
  const n = noun(f.key);
  // Carbs and calories: a size word that matches the bar (share of a day). Thresholds 10% and 25%.
  const size = pct < 10 ? 0 : pct < 25 ? 1 : 2;
  if (f.key === 'carbs') return sub(['carbsSmall', 'carbsModerate', 'carbsLarge'][size]);
  if (f.judge100 === null) return sub('cantRate');
  if (why === 'healthyFat') return sub('healthyFats');
  if (LIMIT_KEYS.includes(f.key)) {
    if (level === 'high' && why === 'portion') {
      // Amounts shown per 100: name the serving's amount, so "10 g" isn't read as the serving (UX item 12).
      if (!useServing && f.portion !== null) {
        return sub('tooMuchPortion', { n, amount: `${f.lessThan ? '<' : ''}${format(f.portion, f.unit)} ${f.unit}` });
      }
      return sub('tooMuchServing', { n });
    }
    if (level === 'high') return sub(why === 'veryHigh' ? 'wayTooMuch' : 'tooMuch', { n });
    return sub(level === 'medium' ? 'bitTooMuch' : 'lowIn', { n });
  }
  if (f.key === 'energy') {
    return level === 'low' ? sub('lowIn', { n }) : sub(['caloriesLight', 'caloriesModerate', 'caloriesRich'][size]);
  }
  if (f.key === 'protein' && !energy100) return sub('cantRate');
  // Protein and fibre: a good point is judged against the calories (EU claims), so a short bar gets
  // "for its calories" to explain it. Otherwise the words follow the bar.
  if (level === 'good') {
    if (pct < 10) return sub(why === 'high' ? 'highForCalories' : 'goodForCalories', { n });
    return sub(why === 'high' ? 'highIn' : 'goodAmount', { n });
  }
  return sub(['notMuch', 'some', 'fairAmount'][size], { n });
}

// The dropdown text: one or two short sentences (Nathan, 23 Nov 2026: understandable at a glance).
function explain(f, { level, why, drink, pct, useServing, energy100 }) {
  const daily = `${format(DAILY[f.key], f.unit)} ${t(`unitWord.${f.unit}`)}`; // in a sentence: 65 กรัม in Thai
  const shareKey = LIMIT_KEYS.includes(f.key) ? 'shareLimit' : f.key === 'energy' ? 'shareCalories' : 'shareAmount';
  const share = whyText(shareKey, { daily, n: noun(f.key) });
  const v = f.judge100;
  let reason = null;
  const size = pct < 10 ? 0 : pct < 25 ? 1 : 2;
  if (f.key === 'carbs') reason = whyText('carbsAbout');
  else if (v === null) reason = whyText('noServingSize');
  else if (why === 'healthyFat') reason = whyText('healthyFat');
  else if (LIMIT_KEYS.includes(f.key)) {
    // The UK traffic-light sentence is gone (Nathan, 24 Nov 2026: too much text); the colour says it.
    if (f.key === 'sugars' && drink && v > THAI_SUGAR_TAX) reason = whyText('sugarTax');
    else if (level === 'high' && why === 'veryHigh') reason = whyText('veryHigh');
    else if (level === 'high' && why === 'portion') reason = whyText('portionBig');
  } else if (f.key === 'energy') {
    // The snack or meal comparison only makes sense for one serving, not for 100 g.
    if (level === 'low') reason = whyText('lowCalories');
    else if (useServing) reason = whyText(['caloriesLight', 'caloriesModerate', 'caloriesRich'][size]);
  } else if (f.key === 'protein') {
    reason = !energy100 ? whyText('proteinNoCalories')
      : why === 'tooLittle' ? whyText('proteinTooLittle')
      : level === 'good' ? whyText(why === 'high' ? 'proteinHigh' : 'proteinSource') : whyText('proteinLow');
  } else if (f.key === 'fibre') {
    reason = why === 'tooLittle' ? whyText('fibreTooLittle')
      : level === 'good' ? whyText(why === 'high' ? 'fibreHigh' : 'fibreSource') : whyText('fibreLow');
  }
  return reason ? `${share} ${reason}` : share;
}

// The gauge in a row's dropdown (Nathan's mockup, 24 Nov 2026). It never decides anything: it draws
// what classify() already decided.
// - 'bands': nutrients to limit that got a colour (Watch Out and Good Points). Three equal bands, the
//   same three colours as the rows (low green, medium orange, high red), because the UK traffic-light
//   guide has exactly three levels. The marker sits in the band of the row's own rating, at the spot
//   between that band's limits (the UK limits turned into the amount shown, per serving or per 100).
// - 'fill': everything else with a % of the daily guide (Nutrition Facts). These aren't rated against
//   the daily guide, so the arc simply fills to the % of the day, in the nutrient's own colour.
// pos: 0 to 1 along the arc. value, unit, less: the amount shown in the middle, in g, mg or kcal
// (Nathan, 24 Nov 2026; it used to be the % of the daily guide).
function gaugeFor(f, { level, why, drink, pct, amountValue, useServing, servingAmount }) {
  if (pct === null) return null;
  const shown = { value: amountValue, unit: f.unit, less: Boolean(f.lessThan) };
  const fill = { kind: 'fill', ...shown, pos: Math.min(1, pct / 100) };
  const band = { low: 0, medium: 1, high: 2 }[level];
  if (!LIMIT_KEYS.includes(f.key) || band === undefined || why === 'healthyFat') return fill;
  const kind = drink ? 'drink' : 'food';
  const limitKey = f.key === 'sodium' ? 'salt' : f.key;
  const fromSalt = f.key === 'sodium' ? 400 : 1; // salt g → sodium mg
  // The UK limits are per 100 g/ml. Turn them into the amount on screen (per serving needs the size).
  const scale = useServing ? (servingAmount ? servingAmount / 100 : null) : 1;
  let edges = null;
  if (scale) {
    const [low, high] = LIMITS[limitKey][kind].map((t) => t * fromSalt * scale);
    // Big servings: the UK portion rule can make "high" start earlier.
    const top = useServing && f.portion !== null ? Math.min(high, PORTION_HIGH[limitKey][kind] * fromSalt) : high;
    edges = [0, Math.min(low, top), top, top * 2];
  }
  let within = 0.5;
  if (edges && edges[band + 1] > edges[band]) {
    within = (amountValue - edges[band]) / (edges[band + 1] - edges[band]);
  }
  // Keep the marker inside its own band, so it always matches the row's colour.
  within = Math.min(0.9, Math.max(0.1, within));
  return { kind: 'bands', ...shown, tone: ['good', 'warn', 'bad'][band], pos: (band + within) / 3 };
}

// "0.5 bag (30 g)" → "Per serving of 30 g (half a bag)". Open Food Facts writes serving sizes in many
// ways; the weight or volume comes first because the values are for that amount. In Thai the words in
// brackets stay as the database wrote them ("0.5 bag"), like product names.
const HOW_MANY = { '0.5': 'half a', '1/2': 'half a', '0.25': 'a quarter of a', '1/4': 'a quarter of a', '1': '1' };
export function servingText(size) {
  if (!size) return t('serving.plain');
  const text = String(size).trim().replace(/\s+/g, ' ');
  const amount = (t) => t.replace(/(\d)\s*(g|ml|mg|kg|l|cl|กรัม|มล)(?![a-z])/gi, '$1 $2').trim();
  const m = text.match(/^(.*?)\s*\(([^()]*\d[^()]*)\)$/);
  if (m && m[1] && /\d\s*(g|ml|l|cl|กรัม|มล)/i.test(m[2])) {
    let what = m[1].trim();
    const n = what.match(/^(\d+(?:[.,]\d+)?|\d\/\d)\s+(.+)$/);
    if (lang === 'en' && n && HOW_MANY[n[1].replace(',', '.')]) what = `${HOW_MANY[n[1].replace(',', '.')]} ${n[2]}`;
    return t('serving.ofWhat', { amount: amount(m[2]), what });
  }
  if (/^\d+(?:[.,]\d+)?\s*(g|ml|l|cl|กรัม|มล)$/i.test(text)) return t('serving.of', { amount: amount(text) });
  return t('serving.other', { text });
}

// high / medium / low for nutrients to limit; good / neutral for the others. Uses per-100 values.
// Returns { level, why }: why is 'portion' when the UK portion rule made it High, 'high' for
// "high in protein / fibre".
function classify(f, drink, energy100) {
  const v = f.judge100;
  if (v === null) return { level: 'neutral' }; // only a per-serving value: show it, but don't judge it
  const kind = drink ? 'drink' : 'food';
  if (['sugars', 'fat', 'satfat', 'sodium'].includes(f.key)) {
    const limitKey = f.key === 'sodium' ? 'salt' : f.key;
    const toSalt = f.key === 'sodium' ? 1 / 400 : 1; // sodium mg → salt g
    const byHundred = level(v * toSalt, LIMITS[limitKey][kind]);
    // Very high: more than twice the UK high line (sugar, saturated fat, salt; not total fat). It costs
    // extra points and counts as a second red (Nathan, 26 Nov 2026), so 64 g of sugar isn't judged like 23 g.
    if (byHundred === 'high' && f.key !== 'fat' && v * toSalt > 2 * LIMITS[limitKey][kind][1]) {
      return { level: 'high', why: 'veryHigh' };
    }
    if (byHundred !== 'high' && f.portion !== null && f.portion * toSalt > PORTION_HIGH[limitKey][kind]) {
      return { level: 'high', why: 'portion' };
    }
    return { level: byHundred };
  }
  // Calories: only "low" (EU low-energy claim) is judged; there is no high warning (Nathan, 23 Nov 2026).
  if (f.key === 'energy') return { level: v <= (drink ? 20 : 40) ? 'low' : 'neutral' };
  // Protein: EU "source of protein" ≥ 12% of calories, "high protein" ≥ 20%.
  // A good point also needs a real amount (Nathan, 26 Nov 2026): at least 3 g protein per 100 g, or
  // 1.5 g per 100 ml in a drink; at least 1.5 g fibre. Otherwise a near-zero-calorie drink with a trace
  // of protein passes the calorie-share test.
  if (f.key === 'protein') {
    const share = energy100 ? (v * 4) / energy100 : 0;
    const tooLittle = v < (drink ? PROTEIN_MIN.drink : PROTEIN_MIN.food);
    if (share >= 0.12 && tooLittle) return { level: 'neutral', why: 'tooLittle' };
    if (share >= 0.2) return { level: 'good', why: 'high' };
    return { level: share >= 0.12 ? 'good' : 'neutral' };
  }
  // Fibre: EU "source of fibre" ≥ 3 g/100 g or ≥ 1.5 g/100 kcal; "high fibre" ≥ 6 g or ≥ 3 g/100 kcal.
  if (f.key === 'fibre') {
    const per100kcal = energy100 ? (v * 100) / energy100 : 0;
    const passes = v >= 3 || per100kcal >= 1.5;
    if (passes && v < FIBRE_MIN) return { level: 'neutral', why: 'tooLittle' };
    if (v >= 6 || per100kcal >= 3) return { level: 'good', why: 'high' };
    return { level: passes ? 'good' : 'neutral' };
  }
  return { level: 'neutral' };
}

function level(v, [low, high]) {
  if (v > high) return 'high';
  if (v <= low) return 'low';
  return 'medium';
}

// A drink if the size or serving is in ml/litres (Open Food Facts stores drinks per 100 ml).
// Cooking oil and ice cream are never drinks, even when sold in ml (Nathan, 26 Nov 2026: olive oil
// scored like palm oil because drinks don't get the healthy-fat rule). A product with no size at all
// counts as a drink when Open Food Facts files it under beverages.
function isDrink(p, fat100) {
  const cats = (p.categories || []).map((c) => String(c).toLowerCase());
  const name = `${p.name || ''} ${p.altName || ''}`;
  const oil = cats.some((c) => /^en:(.+-oils|vegetable-oils|fats)$/.test(c))
    || (fat100 !== null && fat100 >= 80 && /\boils?\b|น้ำมัน/i.test(name));
  const iceCream = cats.some((c) => /^en:(ice-creams|frozen-desserts|ice-cream-tubs|ice-cream-bars)$/.test(c))
    || /\bice[ -]?creams?\b|ไอศกรีม|ไอศครีม|ไอติม/i.test(name);
  if (oil || iceCream) return false;
  const text = `${p.quantity || ''} ${p.servingSize || ''}`.toLowerCase();
  if (/\d\s*(ml|cl|l|มล|ลิตร)\b/.test(text) || /มล|ลิตร/.test(text)) return true;
  const hasUnit = /\d\s*(g|kg|กรัม|กก)\b/.test(text);
  return !hasUnit && cats.includes('en:beverages');
}

// A single can or bottle ("325 ml") of 600 or less, for the UK portion rule. null otherwise.
function singlePack(quantity) {
  if (!quantity) return null;
  const m = String(quantity).toLowerCase().replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)\s*(ml|มล)\s*$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 && n <= 600 ? n : null;
}

// Serving size in g or ml, e.g. "200 ml", "30g", "1 bottle (250 ml)", "0.5 l". null when unclear.
function parseServing(text) {
  if (!text) return null;
  const m = String(text).toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(ml|มล|cl|l|ลิตร|g|กรัม)(?![a-z])/);
  if (!m) return null;
  const n = parseFloat(m[1]) * ({ cl: 10, l: 1000, 'ลิตร': 1000 }[m[2]] || 1);
  return n > 0 ? n : null;
}

function format(value, unit) {
  if (unit === 'kcal' || unit === 'mg') return Math.round(value).toLocaleString('en-US');
  if (value === 0) return '0';
  if (value < 0.1) return value.toFixed(2);
  return String(Math.round(value * 10) / 10);
}
