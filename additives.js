// additives.js — the extra result rows approved with the score on 24 Nov 2026 (docs/prototype-v0.5-spec.md):
// additives, sweeteners, "mostly fruit, vegetables or nuts" and the "mostly healthy fats" check.
//
// Ranked additives (Nathan, 28 Nov 2026, Option D of the diet drink proposal): every additive we track is in
// one of four tiers, and the higher the tier the more points it takes off.
//   High risk      15 points, a red row in Watch Out (counts as a red for the score's ceilings)
//   Moderate risk   8 points, an orange row in Watch Out
//   Limited risk    3 points, a plain line under the lists
//   No known risk   0 points, not shown (anything not listed here)
// All additives together take at most 40 points. Each tier rests on a named review by an official body,
// and the dropdown says which. MSG and the other flavour enhancers are limited risk but take 0 points
// (Nathan, 24 Nov 2026). Benzoates take 8 points again (they were flag only from 25 Nov 2026).
// All wording is whole sentences with no colons (Nathan, 24 Nov 2026), in strings.js under add.*.

import { t, additiveName } from './i18n.js?v=r21';

export const TIER_POINTS = { high: 15, moderate: 8, limited: 3 };
export const ADDITIVE_POINTS_MAX = 40;
// A drink with sweeteners scores at most this (score.js). It also covers drinks whose ingredients we
// can't read but whose name or category says they have no sugar.
export const SWEETENED_DRINK_MAX = 65;

// Additive groups: the tier, and whether the additive is a sweetener (for the Sweeteners row and the
// drink limit). The row line and dropdown for each group are in strings.js (add.<group>.note / .why).
const GROUPS = {
  nitrite: { tier: 'high' },
  banned: { tier: 'high' },
  bha: { tier: 'high' },
  bromate: { tier: 'high' },
  aspartame: { tier: 'high', sweetener: true },
  colour: { tier: 'moderate' },
  sulphite: { tier: 'moderate' },
  fatPreservative: { tier: 'moderate' },
  benzoate: { tier: 'moderate' },
  caramel: { tier: 'moderate' },
  sweetener: { tier: 'moderate', sweetener: true },
  phosphate: { tier: 'limited' },
  emulsifier: { tier: 'limited' },
  erythritol: { tier: 'limited', sweetener: true },
  // Flavour enhancers: limited risk, but no points off (MSG not penalised, Nathan 24 Nov 2026).
  enhancer: { tier: 'limited', points: 0 },
  stevia: { tier: 'none', sweetener: true },
};

// INS / E numbers (the same numbers; Thai labels use INS) → [English name, group]. Thai names: strings.js.
const ADDITIVES = {
  249: ['potassium nitrite', 'nitrite'], 250: ['sodium nitrite', 'nitrite'],
  251: ['sodium nitrate', 'nitrite'], 252: ['potassium nitrate', 'nitrite'],
  171: ['titanium dioxide', 'banned'],
  320: ['BHA', 'bha'],
  924: ['potassium bromate', 'bromate'],
  951: ['aspartame', 'aspartame'], 962: ['aspartame-acesulfame', 'aspartame'],
  102: ['tartrazine', 'colour'], 104: ['quinoline yellow', 'colour'], 110: ['sunset yellow', 'colour'],
  122: ['carmoisine', 'colour'], 124: ['ponceau 4R', 'colour'], 129: ['allura red', 'colour'],
  220: ['sulphur dioxide', 'sulphite'], 221: ['sodium sulphite', 'sulphite'],
  222: ['sodium bisulphite', 'sulphite'], 223: ['sodium metabisulphite', 'sulphite'],
  224: ['potassium metabisulphite', 'sulphite'], 225: ['potassium sulphite', 'sulphite'],
  226: ['calcium sulphite', 'sulphite'], 227: ['calcium bisulphite', 'sulphite'],
  228: ['potassium bisulphite', 'sulphite'],
  319: ['TBHQ', 'fatPreservative'], 321: ['BHT', 'fatPreservative'],
  210: ['benzoic acid', 'benzoate'], 211: ['sodium benzoate', 'benzoate'],
  212: ['potassium benzoate', 'benzoate'], 213: ['calcium benzoate', 'benzoate'],
  '150d': ['caramel colour IV', 'caramel'],
  950: ['acesulfame K', 'sweetener'], 952: ['cyclamate', 'sweetener'], 954: ['saccharin', 'sweetener'],
  955: ['sucralose', 'sweetener'], 961: ['neotame', 'sweetener'], 969: ['advantame', 'sweetener'],
  338: ['phosphoric acid', 'phosphate'], 339: ['sodium phosphates', 'phosphate'],
  340: ['potassium phosphates', 'phosphate'], 341: ['calcium phosphates', 'phosphate'],
  450: ['diphosphates', 'phosphate'], 451: ['triphosphates', 'phosphate'], 452: ['polyphosphates', 'phosphate'],
  407: ['carrageenan', 'emulsifier'], 466: ['CMC', 'emulsifier'], 433: ['polysorbate 80', 'emulsifier'],
  471: ['mono- and diglycerides', 'emulsifier'], 472: ['esters of mono- and diglycerides', 'emulsifier'],
  968: ['erythritol', 'erythritol'],
  621: ['MSG', 'enhancer'], 627: ['disodium guanylate', 'enhancer'],
  631: ['disodium inosinate', 'enhancer'], 635: ['disodium ribonucleotides', 'enhancer'],
  960: ['stevia', 'stevia'],
};
const TIER_ORDER = { high: 0, moderate: 1, limited: 2, none: 3 };

// Wording is in strings.js under add.* (English and Thai side by side).
function say(key, vars = {}) {
  return t(`add.${key}`, vars);
}

/**
 * INS numbers in a product that we rank, from Open Food Facts tags ("en:e250", "en:e150d") or codes read
 * from the ingredients ("ins:211", see ingredients-read.js). Strings, e.g. "211" or "150d".
 */
export function additiveCodes(p) {
  const codes = new Set();
  for (const tag of p.additives || []) {
    const m = /(?:^|:)(?:e|ins)?\s*(\d{3,4})([a-d])?/i.exec(String(tag));
    if (!m) continue;
    const withLetter = `${m[1]}${(m[2] || '').toLowerCase()}`;
    if (ADDITIVES[withLetter]) codes.add(withLetter);
    else if (ADDITIVES[m[1]] && m[1] !== '150') codes.add(m[1]); // plain caramel (150a) is no known risk
  }
  return [...codes].sort((a, b) => TIER_ORDER[GROUPS[ADDITIVES[a][1]].tier] - TIER_ORDER[GROUPS[ADDITIVES[b][1]].tier]);
}

function joinList(names) {
  return names.length > 1
    ? t('common.and', { a: names.slice(0, -1).join(t('common.listGap')), b: names[names.length - 1] }) : names[0];
}

/**
 * Extra rows for the result screen and what the score needs from them.
 * Returns { items, additivePoints, sweetener, infoLine }
 *   items: rows shaped like nutrition-view.js items, with group 'watch' | 'good' | 'other'.
 *   sweetener: true when the product has sweeteners (the drink limit in score.js uses it).
 */
export function extraRows(p, { drink, sugar100, nutType }) {
  const items = [];
  let additivePoints = 0;
  const sweeteners = [];
  const limited = [];
  const enhancers = [];

  if (p.ingredientsKnown) {
    for (const code of additiveCodes(p)) {
      const [english, groupKey] = ADDITIVES[code];
      const name = additiveName(code, english);
      const g = GROUPS[groupKey];
      if (g.sweetener) sweeteners.push(name);
      if (g.tier === 'none') continue;
      const points = g.points ?? TIER_POINTS[g.tier];
      additivePoints += points;
      if (groupKey === 'enhancer') { enhancers.push(name); continue; }
      if (g.tier === 'limited') { limited.push(`${name} (INS ${code})`); continue; }
      // Only why it is a watch out, not how many points it takes off (Nathan, 28 Nov 2026).
      const details = [say(`tier.${g.tier}`), say(`${groupKey}.why`), say('insCode', { code })];
      items.push({
        key: `additive-${code}`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        amount: '',
        note: say(`${groupKey}.note`, { name }),
        details: [details.join(' ')],
        pct: null,
        tone: g.tier === 'high' ? 'bad' : 'warn',
        level: g.tier === 'high' ? 'high' : 'medium',
        group: 'watch',
        extra: 'additive',
        tier: g.tier,
        points,
      });
    }
  }

  // Sweeteners: from the ingredients, or a drink whose name says it has no sugar and that has
  // (almost) no sugar. "No sugar added" juices don't count.
  const name = `${p.name || ''} ${p.altName || ''}`;
  const noSugarDrink = drink && sugar100 !== null && sugar100 <= 0.5;
  const byName = noSugarDrink
    && (/\b(zero|diet|sugar[ -]?free|no sugar(?! added))\b/i.test(name) || /ไม่มีน้ำตาล/.test(name));
  // Also: Open Food Facts files it as an artificially sweetened drink, or a "Max" drink with no sugar
  // (Nathan, 26 Nov 2026: Pepsi Max scored above Coke Zero because neither name said "zero").
  const cats = (p.categories || []).map((c) => String(c).toLowerCase());
  const byCategory = noSugarDrink && cats.some((c) => /^en:(artificially-sweetened-beverages|diet-beverages)$/.test(c));
  const byMax = noSugarDrink && (/\bmax\b/i.test(name) || /แม็กซ์|แมกซ์|แม๊กซ์|แม๊ก/.test(name));
  const sweetener = sweeteners.length > 0 || byName || byCategory || byMax;
  // One Sweeteners row on drinks (it explains the limit of 65), and on foods when we only know about the
  // sweeteners from the name. Each named sweetener also has its own row with its tier.
  if (sweetener && (drink || !sweeteners.length)) {
    const found = sweeteners.length ? say('sweetenerFound', { list: joinList(sweeteners) })
      : byName ? say('sweetenerByName') : byCategory ? say('sweetenerByCategory') : say('sweetenerByMax');
    const note = !drink ? say('sweetenerNote')
      : sugar100 !== null && sugar100 > 0.5 ? say('sweetenerNoteBoth') : say('sweetenerNoteZero');
    items.push({
      key: 'sweeteners',
      name: say('sweetenerName'),
      amount: '',
      note,
      details: [`${say(drink ? 'sweetenerDrinkWhy' : 'sweetenerWhy')} ${found}`],
      pct: null,
      tone: 'warn',
      level: 'medium',
      group: 'watch',
      extra: 'sweetener',
      points: 0,
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

  // Plain lines under the lists: limited risk additives (3 points each), then flavour enhancers (0 points).
  const lines = [];
  if (limited.length) {
    lines.push(say(limited.length > 1 ? 'limitedMany' : 'limitedOne', { list: joinList(limited) }));
  }
  if (enhancers.length) lines.push(say(enhancers.length > 1 ? 'enhancerMany' : 'enhancerOne', { list: joinList(enhancers) }));
  return {
    items,
    additivePoints: Math.min(additivePoints, ADDITIVE_POINTS_MAX),
    sweetener,
    infoLine: lines.length ? lines.join(' ') : null,
  };
}

/**
 * 'nuts' for nuts, seeds and nut butters; 'oil' for plain plant oils; null otherwise. Used for the
 * "mostly healthy fats" rule. From Open Food Facts categories, or the name. Drinks never count
 * (soy milk is not a nut).
 */
export function nutType(p, drink, fat100 = null) {
  if (drink) return null;
  const cats = (p.categories || []).map((c) => String(c).toLowerCase());
  if (cats.some((c) => /^en:(nuts|nuts-and-their-products|mixed-nuts|peanuts|almonds|cashew-nuts|pistachios|walnuts|hazelnuts|macadamia-nuts|seeds|sunflower-seeds|pumpkin-seeds|nut-butters|peanut-butters)$/.test(c))) return 'nuts';
  if (cats.some((c) => /^en:(vegetable-oils|olive-oils|rice-bran-oils|sunflower-oils|rapeseed-oils|soybean-oils)$/.test(c))) return 'oil';
  const name = `${p.name || ''} ${p.altName || ''}`;
  // A plain plant oil by its name, when almost all of it is fat (26 Nov 2026). Palm and coconut oil
  // still fail the healthy-fat test (a quarter or more of the fat is saturated).
  if (fat100 !== null && fat100 >= 80 && (/\boils?\b/i.test(name) || /น้ำมัน/.test(name))) return 'oil';
  if (/\b(nuts?|almonds?|cashews?|peanuts?|pistachios?|walnuts?|hazelnuts?|macadamias?|seeds?)\b/i.test(name)
    || /(ถั่ว|อัลมอนด์|มะม่วงหิมพานต์|พิสตาชิโอ|วอลนัท|เมล็ด)/.test(name)) return 'nuts';
  return null;
}
