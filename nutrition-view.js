// nutrition-view.js — v0.3. Turns a product from lookup.js into the shopper view:
// Watch out / Good points / Other / Not available. Rules and thresholds: docs/prototype-v0.3-spec.md.
// Never invents a value: a missing number goes in "Not available".

// Thai daily guide amounts, used for the "% of a day" bars.
const DAILY = { energy: 2000, sugars: 65, satfat: 20, sodium: 2000, protein: 50, fibre: 25 };

// UK front-of-pack traffic-light thresholds, per 100 g (food) or per 100 ml (drinks): [low ≤, high >].
const LIMITS = {
  sugars: { food: [5, 22.5], drink: [2.5, 11.25] },
  satfat: { food: [1.5, 5], drink: [0.75, 2.5] },
  salt:   { food: [0.3, 1.5], drink: [0.3, 0.75] },
};

const LEVEL_WORD = { high: 'High', medium: 'Medium', low: 'Low' };

/**
 * Build the shopper view of a product.
 * Returns { basisLabel, groups: [{ id, title, items }], missingCount }
 * Each item: { key, name, amount, note, pct (0–100+ or null), tone: 'bad'|'warn'|'good'|'na', level }
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

  const facts = [
    { key: 'energy', name: 'Calories', unit: 'kcal', per100: row('energy-kcal').per100, perServing: row('energy-kcal').perServing },
    { key: 'sugars', name: 'Sugar', unit: 'g', per100: row('sugars').per100, perServing: row('sugars').perServing },
    { key: 'satfat', name: 'Saturated fat', unit: 'g', per100: row('saturated-fat').per100, perServing: row('saturated-fat').perServing },
    { key: 'sodium', name: 'Sodium', unit: 'mg', per100: sodium100, perServing: sodiumServ },
    { key: 'protein', name: 'Protein', unit: 'g', per100: row('proteins').per100, perServing: row('proteins').perServing },
  ];
  const fibre = row('fiber');
  if (fibre.per100 !== null || fibre.perServing !== null) {
    facts.push({ key: 'fibre', name: 'Fibre', unit: 'g', per100: fibre.per100, perServing: fibre.perServing });
  }

  // Per serving only when every fact that has a value also has a per-serving value.
  const present = facts.filter((f) => f.per100 !== null || f.perServing !== null);
  const useServing = Boolean(p.servingSize) && present.length > 0 && present.every((f) => f.perServing !== null);
  const basisLabel = useServing ? `Per serving (${p.servingSize})` : `Per 100 ${per}`;

  const energy100 = facts[0].per100;
  const items = facts.map((f) => {
    const amountValue = useServing ? f.perServing : f.per100;
    if (amountValue === null) {
      return { key: f.key, name: f.name, amount: 'Not available', note: 'Not in the database yet', pct: null, tone: 'na', group: 'missing' };
    }
    const pct = Math.round((amountValue / DAILY[f.key]) * 100);
    const amount = `${format(amountValue, f.unit)} ${f.unit}`;
    const level = classify(f, drink, energy100);
    const isLimit = ['energy', 'sugars', 'satfat', 'sodium'].includes(f.key);
    const share = `${pct}% of ${isLimit ? 'daily limit' : 'daily need'}`;
    let note = share;
    if (level === 'good' && !isLimit) note = `Good source • ${share}`;
    else if (LEVEL_WORD[level]) note = `${LEVEL_WORD[level]} • ${share}`;
    const tone = { high: 'bad', medium: 'warn', low: 'good', good: 'good', neutral: 'na' }[level];
    const group = level === 'high' || level === 'medium' ? 'watch' : level === 'neutral' ? 'other' : 'good';
    return { key: f.key, name: f.name, amount, note, pct, tone, level, group };
  });

  const order = { high: 0, medium: 1 };
  const watch = items.filter((i) => i.group === 'watch')
    .sort((a, b) => (order[a.level] - order[b.level]) || (b.pct - a.pct));

  const groups = [
    { id: 'watch', title: 'Watch out', items: watch },
    { id: 'good', title: 'Good points', items: items.filter((i) => i.group === 'good') },
    { id: 'other', title: 'Other', items: items.filter((i) => i.group === 'other') },
    { id: 'missing', title: 'Not available', items: items.filter((i) => i.group === 'missing') },
  ].filter((g) => g.items.length > 0);

  const missingCount = items.filter((i) => i.group === 'missing').length;
  return { basisLabel, groups, missingCount, items };
}

// high / medium / low for nutrients to limit; good / neutral for the others. Uses per-100 values.
function classify(f, drink, energy100) {
  const v = f.per100;
  if (v === null) return 'neutral'; // only a per-serving value: show it, but don't judge it
  const kind = drink ? 'drink' : 'food';
  if (f.key === 'sugars' || f.key === 'satfat') return level(v, LIMITS[f.key][kind]);
  if (f.key === 'sodium') return level(v / 400, LIMITS.salt[kind]); // compare as salt (g)
  if (f.key === 'energy') {
    if (v <= (drink ? 20 : 40)) return 'low';
    if (!drink && v > 400) return 'high';
    return 'neutral';
  }
  if (f.key === 'protein') {
    return energy100 && (v * 4) / energy100 >= 0.12 ? 'good' : 'neutral';
  }
  if (f.key === 'fibre') return v >= 3 ? 'good' : 'neutral';
  return 'neutral';
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

function format(value, unit) {
  if (unit === 'kcal' || unit === 'mg') return Math.round(value).toLocaleString('en-US');
  if (value === 0) return '0';
  if (value < 0.1) return value.toFixed(2);
  return String(Math.round(value * 10) / 10);
}
