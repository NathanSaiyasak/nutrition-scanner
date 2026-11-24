// additives.js — the extra result rows approved with the score on 24 Nov 2026 (docs/prototype-v0.5-spec.md):
// additives of concern, sweeteners, "mostly fruit, vegetables or nuts" and the "mostly healthy fats" check.
// Only additives that an official body has banned or warned about take points off. All wording is
// whole sentences with no colons (Nathan, 24 Nov 2026), ready for a Thai translation later.

// Additive groups. points: taken off the score for each additive found (all additives together at most 30).
// tone/level: how the row looks; a 'high' additive counts as a red warning for the score's ceilings.
const GROUPS = {
  nitrite: {
    level: 'high', points: 15,
    note: 'Contains {name}, a preservative used in processed meat',
    why: 'Nitrites and nitrates can form cancer-causing compounds, and the WHO\'s cancer agency classes processed meat as a cause of cancer.',
  },
  banned: {
    level: 'high', points: 15,
    note: 'Contains {name}, a colour banned in Europe',
    why: 'It has been banned in food in the European Union since 2022.',
  },
  bha: {
    level: 'high', points: 15,
    note: 'Contains {name}, a preservative rated possibly cancer-causing',
    why: 'The WHO\'s cancer agency rates it as possibly cancer-causing.',
  },
  colour: {
    level: 'medium', points: 8,
    note: 'Contains {name}, a colour linked to hyperactivity in children',
    why: 'In Europe, food with this colour must carry a warning that it may affect activity and attention in children.',
  },
  benzoate: {
    level: 'medium', points: 8,
    note: 'Contains {name}, a preservative',
    why: 'With vitamin C it can form small amounts of benzene.',
  },
  sulphite: {
    level: 'medium', points: 8,
    note: 'Contains {name}, a preservative that can trigger asthma',
    why: 'Sulphites can cause asthma attacks in sensitive people.',
  },
  fatPreservative: {
    level: 'medium', points: 8,
    note: 'Contains {name}, a preservative for fats and oils',
    why: 'There is a strict limit on how much of it is safe to eat each day.',
  },
  // Flavour enhancers: a plain info line under the lists, no points off (MSG not penalised, 24 Nov 2026).
  enhancer: { level: 'info', points: 0 },
  sweetener: { level: 'sweetener', points: 0 },
};

// INS / E numbers (the same numbers; Thai labels use INS) → [name, group].
const ADDITIVES = {
  249: ['potassium nitrite', 'nitrite'], 250: ['sodium nitrite', 'nitrite'],
  251: ['sodium nitrate', 'nitrite'], 252: ['potassium nitrate', 'nitrite'],
  171: ['titanium dioxide', 'banned'],
  320: ['BHA', 'bha'],
  102: ['tartrazine', 'colour'], 104: ['quinoline yellow', 'colour'], 110: ['sunset yellow', 'colour'],
  122: ['carmoisine', 'colour'], 124: ['ponceau 4R', 'colour'], 129: ['allura red', 'colour'],
  210: ['benzoic acid', 'benzoate'], 211: ['sodium benzoate', 'benzoate'],
  212: ['potassium benzoate', 'benzoate'], 213: ['calcium benzoate', 'benzoate'],
  220: ['sulphur dioxide', 'sulphite'], 221: ['sodium sulphite', 'sulphite'],
  222: ['sodium bisulphite', 'sulphite'], 223: ['sodium metabisulphite', 'sulphite'],
  224: ['potassium metabisulphite', 'sulphite'], 225: ['potassium sulphite', 'sulphite'],
  226: ['calcium sulphite', 'sulphite'], 227: ['calcium bisulphite', 'sulphite'],
  228: ['potassium bisulphite', 'sulphite'],
  319: ['TBHQ', 'fatPreservative'], 321: ['BHT', 'fatPreservative'],
  621: ['MSG', 'enhancer'], 627: ['disodium guanylate', 'enhancer'],
  631: ['disodium inosinate', 'enhancer'], 635: ['disodium ribonucleotides', 'enhancer'],
  950: ['acesulfame K', 'sweetener'], 951: ['aspartame', 'sweetener'], 952: ['cyclamate', 'sweetener'],
  954: ['saccharin', 'sweetener'], 955: ['sucralose', 'sweetener'], 960: ['stevia', 'sweetener'],
  961: ['neotame', 'sweetener'], 962: ['aspartame-acesulfame', 'sweetener'], 969: ['advantame', 'sweetener'],
};

export const ADDITIVE_POINTS_MAX = 30;

const TEXT = {
  pointsOff: 'Takes {n} points off the score.',
  insCode: 'Shown on the pack as INS {code}.',
  sweetenerName: 'Sweeteners',
  sweetenerNote: 'Contains sweeteners',
  sweetenerWhy: 'Sweeteners replace sugar. A product with sweeteners can score 50 at most.',
  sweetenerFound: 'Found {list}.',
  sweetenerByName: 'The product name says it has no sugar, which usually means sweeteners.',
  fruitName: 'Fruit, vegetables or nuts',
  fruitNote: 'Mostly fruit or vegetables',
  nutsNote: 'Mostly nuts',
  fruitWhy: 'At least 80% of it is fruit, vegetables, pulses or nuts. Adds 10 points to the score.',
  enhancerOne: 'Also contains {list}, a flavour enhancer. It is considered safe at normal amounts, so it doesn\'t change the score.',
  enhancerMany: 'Also contains {list}, flavour enhancers. They are considered safe at normal amounts, so they don\'t change the score.',
  and: '{a} and {b}',
};

function say(key, vars = {}) {
  return TEXT[key].replace(/\{(\w+)\}/g, (_, k) => vars[k]);
}

/** INS numbers in a product, from Open Food Facts tags ("en:e250") or codes typed in ("250"). */
export function additiveCodes(p) {
  const codes = new Set();
  for (const tag of p.additives || []) {
    const m = /(?:^|:)(?:e|ins)?\s*(\d{3})/i.exec(String(tag));
    if (m) codes.add(Number(m[1]));
  }
  return [...codes].filter((c) => ADDITIVES[c]);
}

/**
 * Extra rows for the result screen and what the score needs from them.
 * Returns { items, additivePoints, sweetener, infoLine }
 *   items: rows shaped like nutrition-view.js items, with group 'watch' | 'good' | 'other'.
 */
export function extraRows(p, { drink, sugar100, nutType }) {
  const items = [];
  let additivePoints = 0;
  const sweeteners = [];
  const enhancers = [];

  if (p.ingredientsKnown) {
    for (const code of additiveCodes(p)) {
      const [name, groupKey] = ADDITIVES[code];
      const g = GROUPS[groupKey];
      if (g.level === 'sweetener') { sweeteners.push(name); continue; }
      if (g.level === 'info') { enhancers.push(name); continue; }
      const details = [g.why];
      if (g.points) details.push(say('pointsOff', { n: g.points }));
      details.push(say('insCode', { code }));
      items.push({
        key: `additive-${code}`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        amount: '',
        note: g.note.replace('{name}', name),
        details: [details.join(' ')],
        pct: null,
        tone: g.level === 'high' ? 'bad' : 'warn',
        level: g.level,
        group: 'watch',
        extra: 'additive',
        points: g.points,
      });
      additivePoints += g.points;
    }
  }

  // Sweeteners: from the ingredients, or a drink whose name says it has no sugar and that has
  // (almost) no sugar. "No sugar added" juices don't count.
  const name = `${p.name || ''} ${p.altName || ''}`;
  const byName = drink && sugar100 !== null && sugar100 <= 0.5
    && (/\b(zero|diet|sugar[ -]?free|no sugar(?! added))\b/i.test(name) || /ไม่มีน้ำตาล/.test(name));
  if (sweeteners.length || byName) {
    items.push({
      key: 'sweeteners',
      name: say('sweetenerName'),
      amount: '',
      note: say('sweetenerNote'),
      details: [`${say('sweetenerWhy')} ${sweeteners.length ? say('sweetenerFound', { list: sweeteners.join(', ') }) : say('sweetenerByName')}`],
      pct: null,
      tone: 'warn',
      level: 'medium',
      group: 'watch',
      extra: 'sweetener',
    });
  }

  // Mostly fruit, vegetables, pulses or nuts (80% or more): Open Food Facts' estimate from the
  // ingredients, or "100%" juice in the name.
  const juice100 = /100\s*%/.test(name)
    && /(juice|น้ำผลไม้|น้ำส้ม|น้ำองุ่น|น้ำแอปเปิ้ล|น้ำมะพร้าว|น้ำฝรั่ง|น้ำสับปะรด)/i.test(name);
  if ((p.fruitVegNuts !== null && p.fruitVegNuts !== undefined && p.fruitVegNuts >= 80) || juice100) {
    items.push({
      key: 'fruit',
      name: say('fruitName'),
      amount: '',
      note: say(nutType === 'nuts' ? 'nutsNote' : 'fruitNote'),
      details: [say('fruitWhy')],
      pct: null,
      tone: 'good',
      level: 'good',
      group: 'good',
      extra: 'fruit',
    });
  }

  const list = enhancers.length > 1
    ? say('and', { a: enhancers.slice(0, -1).join(', '), b: enhancers[enhancers.length - 1] }) : enhancers[0];
  const infoLine = enhancers.length ? say(enhancers.length > 1 ? 'enhancerMany' : 'enhancerOne', { list }) : null;
  return {
    items,
    additivePoints: Math.min(additivePoints, ADDITIVE_POINTS_MAX),
    sweetener: items.some((i) => i.extra === 'sweetener'),
    infoLine,
  };
}

/**
 * 'nuts' for nuts, seeds and nut butters; 'oil' for plain plant oils; null otherwise. Used for the
 * "mostly healthy fats" rule. From Open Food Facts categories, or the name. Drinks never count
 * (soy milk is not a nut).
 */
export function nutType(p, drink) {
  if (drink) return null;
  const cats = (p.categories || []).map((c) => String(c).toLowerCase());
  if (cats.some((c) => /^en:(nuts|nuts-and-their-products|mixed-nuts|peanuts|almonds|cashew-nuts|pistachios|walnuts|hazelnuts|macadamia-nuts|seeds|sunflower-seeds|pumpkin-seeds|nut-butters|peanut-butters)$/.test(c))) return 'nuts';
  if (cats.some((c) => /^en:(vegetable-oils|olive-oils|rice-bran-oils|sunflower-oils|rapeseed-oils|soybean-oils)$/.test(c))) return 'oil';
  const name = `${p.name || ''} ${p.altName || ''}`;
  if (/\b(nuts?|almonds?|cashews?|peanuts?|pistachios?|walnuts?|hazelnuts?|macadamias?|seeds?)\b/i.test(name)
    || /(ถั่ว|อัลมอนด์|มะม่วงหิมพานต์|พิสตาชิโอ|วอลนัท|เมล็ด)/.test(name)) return 'nuts';
  return null;
}
