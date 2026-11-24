// nutrition-view.js — v0.3 (criteria updated 23 Nov 2026; healthy fats and extra rows added 24 Nov 2026).
// Turns a product from lookup.js into the shopper view: Watch out / Good points / Nutrition facts / Not available.
// Rules and thresholds: docs/prototype-v0.3-spec.md and docs/prototype-v0.5-spec.md.
// Never invents a value: a missing number goes in "Not available".
import { extraRows, nutType } from './additives.js';

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

// Thai excise tax on sugary drinks applies above 6 g sugar per 100 ml. Shown as a note only.
const THAI_SUGAR_TAX = 6;

/**
 * Build the shopper view of a product.
 * Returns { basisLabel, groups: [{ id, title, items }], items, facts, drink, healthyFat, extras, ingredientsKnown, judged }
 * Each item: { key, name, amount, note, details (string[]), pct (0–100+ or null), tone: 'bad'|'warn'|'good'|'na', level }
 */
export function buildView(p) {
  const row = (key) => p.rows.find((r) => r.key === key);
  const drink = isDrink(p);
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
    fact('energy', 'Calories', 'kcal', row('energy-kcal')),
    fact('sugars', 'Sugar', 'g', row('sugars')),
    fact('fat', 'Fat', 'g', row('fat')),
    fact('satfat', 'Saturated fat', 'g', row('saturated-fat')),
    fact('sodium', 'Sodium', 'mg', { per100: sodium100, perServing: sodiumServ, lessThan: sodiumLess }),
    fact('protein', 'Protein', 'g', row('proteins')),
  ];
  facts.push(fact('fibre', 'Fibre', 'g', row('fiber')));
  facts.push(fact('carbs', 'Carbs', 'g', row('carbohydrates')));
  // The facts that decide the basis, the colours and the sample score: the same set as before
  // 24 Nov 2026 (fibre only when it has a value). Carbs are shown for information only, never rated.
  const core = facts.filter((f) => f.key !== 'carbs' && !(f.key === 'fibre' && f.per100 === null && f.perServing === null));

  // Per serving only when every fact that has a value also has a per-serving value, and either the
  // serving size is known or there are no per-100 values at all (a label typed in "per serving").
  const present = core.filter((f) => f.per100 !== null || f.perServing !== null);
  const allServing = present.length > 0 && present.every((f) => f.perServing !== null);
  const useServing = allServing && (Boolean(p.servingSize) || present.every((f) => f.per100 === null));
  const basisLabel = useServing
    ? servingText(p.servingSize)
    : `Per 100 ${per}`;
  const missingNote = p.source === 'shared' || p.source === 'phone' ? 'Not typed in from the label' : 'Not in the database yet';

  // Judging uses per-100 values. When the label only gave per-serving values but the serving size is
  // known (e.g. "200 ml"), work out per 100 from it: plain arithmetic on the label's own numbers,
  // like salt to sodium, not an estimate. Without a serving size the fact can't be judged.
  const servingAmount = parseServing(p.servingSize);
  for (const f of facts) {
    f.judge100 = f.per100 ?? (f.perServing !== null && servingAmount ? (f.perServing * 100) / servingAmount : null);
    // Amount in one portion, for the UK portion rule (only for big portions, see PORTION_MIN).
    const bigPortion = servingAmount && servingAmount > PORTION_MIN[drink ? 'drink' : 'food'];
    f.portion = !bigPortion ? null
      : f.perServing ?? (f.per100 !== null ? (f.per100 * servingAmount) / 100 : null);
  }

  const energy100 = facts[0].judge100;
  // Mostly healthy fats (approved 24 Nov 2026): nuts, seeds and plain plant oils where less than a
  // quarter of the fat is saturated aren't warned about for fat or saturated fat.
  const type = nutType(p, drink);
  const fat100 = facts.find((f) => f.key === 'fat').judge100;
  const sat100 = facts.find((f) => f.key === 'satfat').judge100;
  const healthyFat = Boolean(type) && fat100 !== null && sat100 !== null && fat100 > 0 && sat100 / fat100 < 0.25;
  const items = facts.map((f) => {
    const amountValue = useServing ? f.perServing : f.per100;
    if (amountValue === null) {
      const group = FACT_KEYS.includes(f.key) ? 'facts' : 'missing';
      return { key: f.key, name: f.name, amount: 'Not available', note: missingNote, details: [], pct: null, tone: 'na', group, missing: true };
    }
    const pct = Math.round((amountValue / DAILY[f.key]) * 100);
    const amount = `${f.lessThan ? '<' : ''}${format(amountValue, f.unit)} ${f.unit}`;
    const { level, why } = healthyFat && (f.key === 'fat' || f.key === 'satfat')
      ? { level: 'neutral', why: 'healthyFat' } : classify(f, drink, energy100);
    // The row shows one plain line ("A bit too much sugar"); a one- or two-sentence dropdown under it
    // gives the % of the daily guide and why (Nathan, 23 Nov 2026). All wording is in TEXT below.
    const note = subtitle(f, level, why, energy100);
    const details = [explain(f, { level, why, drink, pct, useServing, energy100 })];
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
    ? 'The label was typed in per serving without the serving size, so we can\'t rate these yet.'
    : null;

  const groups = [
    { id: 'watch', title: 'Watch Out', items: watch },
    { id: 'good', title: 'Good Points', items: all.filter((i) => i.group === 'good') },
    { id: 'facts', title: 'Nutrition Facts', hint: factsHint, items: factItems },
    { id: 'missing', title: 'Not Available', items: items.filter((i) => i.group === 'missing') },
  ].filter((g) => g.items.length > 0);

  return {
    basisLabel, groups, items, facts, drink, healthyFat, extras, judged,
    infoLine: extras.infoLine,
    ingredientsKnown: Boolean(p.ingredientsKnown),
  };
}

// All shopper-facing wording for the rows, in one place so it can be translated to Thai later.
// {n} = nutrient word, {pct} = % of the daily guide, {daily} = the daily guide amount. Each entry is a
// whole sentence or phrase (no pieces glued together), so a translation can change the word order.
const TEXT = {
  noun: { energy: 'calories', sugars: 'sugar', fat: 'fat', satfat: 'saturated fat', sodium: 'sodium', protein: 'protein', fibre: 'fibre', carbs: 'carbs' },
  // Row subtitle, by level.
  tooMuch: 'Too much {n}',
  tooMuchServing: 'Too much {n} per serving',
  bitTooMuch: 'A bit too much {n}',
  lowIn: 'Low in {n}',
  highIn: 'High in {n}',
  goodAmount: 'Good amount of {n}',
  notMuch: 'Not much {n}',
  notLowCalories: 'Not low in calories',
  cantRate: 'Can\'t rate this yet',
  healthyFats: 'Mostly healthy fats',
  forInfo: 'For information, not rated',
  // Dropdown, first sentence: share of the Thai daily guide.
  shareLimit: '{basis} {pct}% of the recommended daily limit, based on the Thai daily guide ({daily} a day).',
  shareAmount: '{basis} {pct}% of the recommended daily amount, based on the Thai daily guide ({daily} a day).',
  shareCalories: '{basis} {pct}% of a day\'s calories, based on the Thai daily guide ({daily} a day).',
  basisServing: 'One serving has',
  basisFood: '100 g of this has',
  basisDrink: '100 ml of this has',
  // Dropdown, second sentence: why it got its colour.
  rateHigh: 'Rated high by the UK traffic-light guide.',
  rateHighTax: 'Rated high by the UK traffic-light guide, and taxed as a sugary drink in Thailand.',
  ratePortion: 'Rated high by the UK traffic-light guide because one serving is large.',
  ratePortionTax: 'Rated high by the UK traffic-light guide because one serving is large, and taxed as a sugary drink in Thailand.',
  rateMedium: 'Rated medium by the UK traffic-light guide.',
  rateMediumTax: 'Rated medium by the UK traffic-light guide, and taxed as a sugary drink in Thailand.',
  rateLow: 'Rated low by the UK traffic-light guide.',
  lowCalories: 'Counts as low in calories under EU rules.',
  proteinHigh: 'At least 20% of its calories come from protein.',
  proteinSource: 'At least 12% of its calories come from protein.',
  proteinLow: 'Less than 12% of its calories come from protein.',
  proteinNoCalories: 'It can\'t be rated without the calories.',
  fibreHigh: 'Enough to count as high in fibre under EU rules.',
  fibreSource: 'Enough to count as a source of fibre under EU rules.',
  fibreLow: 'Not enough to count as a source of fibre under EU rules.',
  carbsInfo: 'Carbs aren\'t rated, so they get no colour.',
  noServingSize: 'The label didn\'t give the serving size, so we can\'t rate it yet.',
  healthyFatWhy: 'Less than a quarter of the fat is saturated, which is typical of nuts, seeds and plant oils, so it isn\'t a warning.',
};

function say(key, vars = {}) {
  return TEXT[key].replace(/\{(\w+)\}/g, (_, k) => vars[k]);
}

const LIMIT_KEYS = ['sugars', 'fat', 'satfat', 'sodium'];
// Always listed under "Nutrition facts", in this order (Nathan, 24 Nov 2026).
const FACT_KEYS = ['energy', 'protein', 'fibre', 'carbs'];

// The one-line subtitle under a row's name. Describes what classify() decided; never changes it.
function subtitle(f, level, why, energy100) {
  const n = TEXT.noun[f.key];
  if (f.key === 'carbs') return say('forInfo');
  if (f.judge100 === null) return say('cantRate');
  if (why === 'healthyFat') return say('healthyFats');
  if (LIMIT_KEYS.includes(f.key)) {
    if (level === 'high') return say(why === 'portion' ? 'tooMuchServing' : 'tooMuch', { n });
    return say(level === 'medium' ? 'bitTooMuch' : 'lowIn', { n });
  }
  if (f.key === 'energy') return level === 'low' ? say('lowIn', { n }) : say('notLowCalories');
  if (f.key === 'protein' && !energy100) return say('cantRate');
  if (level === 'good') return say(why === 'high' ? 'highIn' : 'goodAmount', { n });
  return say('notMuch', { n });
}

// The dropdown text: one or two short sentences (Nathan, 23 Nov 2026: understandable at a glance).
function explain(f, { level, why, drink, pct, useServing, energy100 }) {
  const basis = say(useServing ? 'basisServing' : drink ? 'basisDrink' : 'basisFood');
  const daily = `${format(DAILY[f.key], f.unit)} ${f.unit}`;
  const shareKey = LIMIT_KEYS.includes(f.key) ? 'shareLimit' : f.key === 'energy' ? 'shareCalories' : 'shareAmount';
  const share = say(shareKey, { basis, pct, daily });
  const v = f.judge100;
  let reason = null;
  if (f.key === 'carbs') reason = say('carbsInfo');
  else if (v === null) reason = say('noServingSize');
  else if (why === 'healthyFat') reason = say('healthyFatWhy');
  else if (LIMIT_KEYS.includes(f.key)) {
    const tax = f.key === 'sugars' && drink && v > THAI_SUGAR_TAX ? 'Tax' : '';
    if (level === 'high') reason = say((why === 'portion' ? 'ratePortion' : 'rateHigh') + tax);
    else if (level === 'medium') reason = say('rateMedium' + tax);
    else reason = say('rateLow');
  } else if (f.key === 'energy') {
    if (level === 'low') reason = say('lowCalories');
  } else if (f.key === 'protein') {
    reason = !energy100 ? say('proteinNoCalories')
      : level === 'good' ? say(why === 'high' ? 'proteinHigh' : 'proteinSource') : say('proteinLow');
  } else if (f.key === 'fibre') {
    reason = level === 'good' ? say(why === 'high' ? 'fibreHigh' : 'fibreSource') : say('fibreLow');
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
// pos and pct: 0 to 1 along the arc. pct: the % of the daily guide shown in the middle.
function gaugeFor(f, { level, why, drink, pct, amountValue, useServing, servingAmount }) {
  if (pct === null) return null;
  const fill = { kind: 'fill', pct, pos: Math.min(1, pct / 100) };
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
  return { kind: 'bands', pct, tone: ['good', 'warn', 'bad'][band], pos: (band + within) / 3 };
}

// "0.5 bag (30 g)" → "Per serving of 30 g (half a bag)". Open Food Facts writes serving sizes in many
// ways; the weight or volume comes first because the values are for that amount.
const HOW_MANY = { '0.5': 'half a', '1/2': 'half a', '0.25': 'a quarter of a', '1/4': 'a quarter of a', '1': '1' };
export function servingText(size) {
  if (!size) return 'Per serving';
  const text = String(size).trim().replace(/\s+/g, ' ');
  const amount = (t) => t.replace(/(\d)\s*(g|ml|mg|kg|l|cl|กรัม|มล)(?![a-z])/gi, '$1 $2').trim();
  const m = text.match(/^(.*?)\s*\(([^()]*\d[^()]*)\)$/);
  if (m && m[1] && /\d\s*(g|ml|l|cl|กรัม|มล)/i.test(m[2])) {
    let what = m[1].trim();
    const n = what.match(/^(\d+(?:[.,]\d+)?|\d\/\d)\s+(.+)$/);
    if (n && HOW_MANY[n[1].replace(',', '.')]) what = `${HOW_MANY[n[1].replace(',', '.')]} ${n[2]}`;
    return `Per serving of ${amount(m[2])} (${what})`;
  }
  if (/^\d+(?:[.,]\d+)?\s*(g|ml|l|cl|กรัม|มล)$/i.test(text)) return `Per serving of ${amount(text)}`;
  return `Per serving, ${text}`;
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
    if (byHundred !== 'high' && f.portion !== null && f.portion * toSalt > PORTION_HIGH[limitKey][kind]) {
      return { level: 'high', why: 'portion' };
    }
    return { level: byHundred };
  }
  // Calories: only "low" (EU low-energy claim) is judged; there is no high warning (Nathan, 23 Nov 2026).
  if (f.key === 'energy') return { level: v <= (drink ? 20 : 40) ? 'low' : 'neutral' };
  // Protein: EU "source of protein" ≥ 12% of calories, "high protein" ≥ 20%.
  if (f.key === 'protein') {
    const share = energy100 ? (v * 4) / energy100 : 0;
    if (share >= 0.2) return { level: 'good', why: 'high' };
    return { level: share >= 0.12 ? 'good' : 'neutral' };
  }
  // Fibre: EU "source of fibre" ≥ 3 g/100 g or ≥ 1.5 g/100 kcal; "high fibre" ≥ 6 g or ≥ 3 g/100 kcal.
  if (f.key === 'fibre') {
    const per100kcal = energy100 ? (v * 100) / energy100 : 0;
    if (v >= 6 || per100kcal >= 3) return { level: 'good', why: 'high' };
    return { level: v >= 3 || per100kcal >= 1.5 ? 'good' : 'neutral' };
  }
  return { level: 'neutral' };
}

function level(v, [low, high]) {
  if (v > high) return 'high';
  if (v <= low) return 'low';
  return 'medium';
}

// A drink if the size or serving is in ml/litres (Open Food Facts stores drinks per 100 ml).
function isDrink(p) {
  const text = `${p.quantity || ''} ${p.servingSize || ''}`.toLowerCase();
  return /\d\s*(ml|cl|l|มล|ลิตร)\b/.test(text) || /มล|ลิตร/.test(text);
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
