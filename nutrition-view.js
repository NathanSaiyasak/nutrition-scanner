// nutrition-view.js — v0.3 (criteria updated 23 Nov 2026). Turns a product from lookup.js into the shopper view:
// Watch out / Good points / Other / Not available. Rules and thresholds: docs/prototype-v0.3-spec.md.
// Never invents a value: a missing number goes in "Not available".

// Thai daily guide amounts, used for the "% of a day" bars.
const DAILY = { energy: 2000, sugars: 65, fat: 65, satfat: 20, sodium: 2000, protein: 50, fibre: 25 };

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
 * Returns { basisLabel, groups: [{ id, title, items }], missingCount }
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
  const fibre = row('fiber');
  if (fibre.per100 !== null || fibre.perServing !== null) facts.push(fact('fibre', 'Fibre', 'g', fibre));

  // Per serving only when every fact that has a value also has a per-serving value, and either the
  // serving size is known or there are no per-100 values at all (a label typed in "per serving").
  const present = facts.filter((f) => f.per100 !== null || f.perServing !== null);
  const allServing = present.length > 0 && present.every((f) => f.perServing !== null);
  const useServing = allServing && (Boolean(p.servingSize) || present.every((f) => f.per100 === null));
  const basisLabel = useServing
    ? (p.servingSize ? `Per serving (${p.servingSize})` : 'Per serving')
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
  const items = facts.map((f) => {
    const amountValue = useServing ? f.perServing : f.per100;
    if (amountValue === null) {
      return { key: f.key, name: f.name, amount: 'Not available', note: missingNote, details: [], pct: null, tone: 'na', group: 'missing' };
    }
    const pct = Math.round((amountValue / DAILY[f.key]) * 100);
    const amount = `${f.lessThan ? '<' : ''}${format(amountValue, f.unit)} ${f.unit}`;
    const { level, why } = classify(f, drink, energy100);
    // The row shows one short line; the reasons go in a dropdown under it (Nathan, 23 Nov 2026).
    const isLimit = ['sugars', 'fat', 'satfat', 'sodium'].includes(f.key);
    const note = f.key === 'energy' ? `${pct}% of a day`
      : `${pct}% of recommended daily ${isLimit ? 'limit' : 'amount'}`;
    const details = explain(f, { level, why, drink, energy100, servingAmount });
    const tone = { high: 'bad', medium: 'warn', low: 'good', good: 'good', neutral: 'na' }[level];
    const group = level === 'high' || level === 'medium' ? 'watch' : level === 'neutral' ? 'other' : 'good';
    return { key: f.key, name: f.name, amount, note, details, pct, tone, level, group };
  });

  const order = { high: 0, medium: 1 };
  const watch = items.filter((i) => i.group === 'watch')
    .sort((a, b) => (order[a.level] - order[b.level]) || (b.pct - a.pct));

  // judged: at least one fact could be compared with the limits (needs a per-100 value, or a
  // per-serving value with a known serving size). If none could, there are no colours and no sample score.
  const judged = facts.some((f) => f.judge100 !== null);
  const otherItems = items.filter((i) => i.group === 'other');
  const unjudgedOther = otherItems.some((i) => facts.find((f) => f.key === i.key).judge100 === null);
  const otherHint = unjudgedOther
    ? 'The label was typed in per serving without the serving size, so we can\'t compare these with the limits yet.'
    : 'In the middle: not high enough to watch out for, not low enough to count as a good point.';

  const groups = [
    { id: 'watch', title: 'Watch out', items: watch },
    { id: 'good', title: 'Good points', items: items.filter((i) => i.group === 'good') },
    { id: 'other', title: 'Other', hint: otherHint, items: otherItems },
    { id: 'missing', title: 'Not available', items: items.filter((i) => i.group === 'missing') },
  ].filter((g) => g.items.length > 0);

  // Fat (added 23 Nov 2026) isn't counted here, so the sample score shows for the same products as before.
  const missingCount = items.filter((i) => i.group === 'missing' && i.key !== 'fat').length;
  return { basisLabel, groups, missingCount, items, judged };
}

// Plain-language reasons for a row's colour, shown in its dropdown. Uses the same thresholds as
// classify() and only describes what classify() decided; it never changes the group.
function explain(f, { level, why, drink, energy100, servingAmount }) {
  const kind = drink ? 'drink' : 'food';
  const per100 = `per 100 ${drink ? 'ml' : 'g'}`;
  const out = [];
  const v = f.judge100;
  if (v === null) {
    out.push('The label was typed in per serving without the serving size, so this can\'t be compared with the limits yet.');
  } else if (['sugars', 'fat', 'satfat', 'sodium'].includes(f.key)) {
    const limitKey = f.key === 'sodium' ? 'salt' : f.key;
    const fromSalt = f.key === 'sodium' ? 400 : 1; // salt g → sodium mg
    const [low, high] = LIMITS[limitKey][kind].map((x) => x * fromSalt);
    const n = (x) => `${format(x, f.unit)} ${f.unit}`;
    const has = `This product has ${n(v)} ${per100}.`;
    if (level === 'high' && why === 'portion') {
      const limit = PORTION_HIGH[limitKey][kind] * fromSalt;
      out.push(`High in one serving: ${n(f.portion)} in one ${format(servingAmount, 'g')} ${drink ? 'ml' : 'g'} serving, more than the ${n(limit)} limit for one ${kind} serving.`);
      out.push(`Per 100 ${drink ? 'ml' : 'g'} it has ${n(v)}, which on its own would be ${v <= low ? 'low' : 'medium'}.`);
    } else if (level === 'high') {
      out.push(`High: more than ${n(high)} ${per100}. ${has}`);
    } else if (level === 'medium') {
      out.push(`Medium: between ${n(low)} and ${n(high)} ${per100}. ${has}`);
    } else {
      out.push(`Low: ${n(low)} or less ${per100}. ${has}`);
    }
    out.push('Levels from the UK front-of-pack traffic-light guide.');
  } else if (f.key === 'energy') {
    const lowCal = drink ? 20 : 40;
    out.push(level === 'low'
      ? `Low in calories: ${lowCal} kcal or less ${per100}. This product has ${format(v, 'kcal')} kcal.`
      : `Calories only count as a good point when they're low (${lowCal} kcal or less ${per100}). There is no "high" warning for calories.`);
  } else if (f.key === 'protein') {
    if (!energy100) out.push('Can\'t be judged without the calories.');
    else {
      const share = Math.round(((v * 4) / energy100) * 100);
      out.push(level === 'good'
        ? `${why === 'high' ? 'High in protein: 20%' : 'Source of protein: 12%'} or more of the calories come from protein. Here it's ${share}%.`
        : `Counts as a good point when 12% or more of the calories come from protein. Here it's ${share}%.`);
    }
  } else if (f.key === 'fibre') {
    const rule = (g) => `${g} g or more ${per100}, or ${g / 2} g or more per 100 kcal`;
    out.push(level === 'good'
      ? `${why === 'high' ? `High in fibre: ${rule(6)}` : `Source of fibre: ${rule(3)}`}. This product has ${format(v, 'g')} g ${per100}.`
      : `Counts as a good point at ${rule(3)}. This product has ${format(v, 'g')} g ${per100}.`);
  }
  if (f.key === 'sugars' && drink && v !== null && v > THAI_SUGAR_TAX) {
    out.push(`Taxed as a sugary drink in Thailand (more than ${THAI_SUGAR_TAX} g sugar per 100 ml).`);
  }
  out.push(`The bar compares with the Thai daily guide of ${format(DAILY[f.key], f.unit)} ${f.unit} a day.`);
  return out;
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
