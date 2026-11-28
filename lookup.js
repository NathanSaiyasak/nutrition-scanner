// lookup.js — talks to Open Food Facts and turns its answer into something the screens can show.
// Rule: never invent or estimate a value. If Open Food Facts has no number, we return null
// and the screen shows "Not available".

import { readAdditives } from './ingredients-read.js?v=r22';

const OFF_PRODUCT_API = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_PRODUCT_PAGE = 'https://world.openfoodfacts.org/product/';
const TIMEOUT_MS = 8000;

// Ask only for the fields we show (Open Food Facts asks apps to do this).
const FIELDS = [
  'code', 'product_name', 'product_name_en', 'product_name_th',
  'brands', 'quantity', 'serving_size', 'image_front_small_url', 'nutriments',
  // For the score (24 Nov 2026): additives, whether there is an ingredients list, product type.
  'ingredients_text', 'ingredients_n', 'additives_tags', 'categories_tags',
].join(',');

// The nutrition table rows, in display order.
// counts: true = one of the 8 values used for the "data completeness" note.
export const NUTRIENTS = [
  { key: 'energy-kcal',   label: 'Energy',        unit: 'kcal', counts: true },
  { key: 'fat',           label: 'Fat',           unit: 'g',    counts: true },
  { key: 'saturated-fat', label: 'Saturated fat', unit: 'g',    counts: true, sub: true },
  { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g',    counts: true },
  { key: 'sugars',        label: 'Sugars',        unit: 'g',    counts: true, sub: true },
  { key: 'fiber',         label: 'Fibre',         unit: 'g',    counts: true },
  { key: 'proteins',      label: 'Protein',       unit: 'g',    counts: true },
  { key: 'salt',          label: 'Salt',          unit: 'g',    counts: true },
  // Thai labels give sodium in mg. Open Food Facts stores sodium in grams, so we multiply by 1000
  // (a unit change, not an estimate). It is shown but not counted separately from salt.
  { key: 'sodium',        label: 'Sodium',        unit: 'mg',   counts: false, factor: 1000 },
];

/**
 * Look up a barcode. Always resolves (never throws) with one of:
 *   { kind: 'found', product }   { kind: 'not-found' }   { kind: 'timeout' }
 *   { kind: 'busy' }             { kind: 'network' }
 */
export async function lookupProduct(barcode) {
  const url = `${OFF_PRODUCT_API}${encodeURIComponent(barcode)}?fields=${FIELDS}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // A plain GET with no custom headers: browsers do not let a page set its own User-Agent,
    // and extra headers would trigger a CORS pre-check that could be refused.
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return { kind: 'not-found' };
    if (res.status === 429 || res.status === 503) return { kind: 'busy' };
    if (!res.ok) return { kind: 'network' };

    const data = await res.json();
    if (data.status !== 1 || !data.product) return { kind: 'not-found' };
    return { kind: 'found', product: normalise(data.product, barcode) };
  } catch (err) {
    if (err && err.name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// Turn a raw Open Food Facts product into the shape the screen uses.
export function normalise(raw, barcode) {
  const n = raw.nutriments || {};
  const en = clean(raw.product_name_en);
  const generic = clean(raw.product_name);
  const th = clean(raw.product_name_th);
  const name = en || generic || th || 'Unnamed product';
  // Show the Thai name underneath when it differs from the main one.
  const altName = th && th !== name ? th : null;

  const rows = NUTRIENTS.map((def) => ({
    ...def,
    per100: readNumber(n[`${def.key}_100g`], def.factor),
    perServing: readNumber(n[`${def.key}_serving`], def.factor),
  }));

  // Completeness: the 8 values from the spec, per 100 g/ml. Salt counts as present if either
  // salt or sodium is present, because Open Food Facts treats them as the same measure.
  const sodiumRow = rows.find((r) => r.key === 'sodium');
  const counted = rows.filter((r) => r.counts);
  const present = counted.filter((r) =>
    r.per100 !== null || (r.key === 'salt' && sodiumRow.per100 !== null)).length;

  const hasAny = rows.some((r) => r.per100 !== null || r.perServing !== null);
  const hasServing = rows.some((r) => r.perServing !== null);

  // Ingredients and additives, for the score. Additives come from Open Food Facts' own list, plus any
  // INS / E numbers written in the ingredients text (Thai labels write "INS 211"), which Open Food
  // Facts may miss when it can't read the Thai text.
  const ingredientsText = clean(raw.ingredients_text);
  const additives = Array.isArray(raw.additives_tags) ? raw.additives_tags.map(String) : [];
  // Also additives named in Thai or English words ("ซูคราโลส", "sodium benzoate"), not only by number
  // (28 Nov 2026: Thai Sprite's sweeteners were missed because the label names them in Thai).
  if (ingredientsText) additives.push(...readAdditives(ingredientsText));
  const fvn = readNumber(n['fruits-vegetables-nuts-estimate-from-ingredients_100g'])
    ?? readNumber(n['fruits-vegetables-legumes-estimate-from-ingredients_100g'])
    ?? readNumber(n['fruits-vegetables-nuts_100g']);

  return {
    barcode: clean(raw.code) || barcode,
    name,
    altName,
    brands: clean(raw.brands),
    quantity: clean(raw.quantity),
    servingSize: clean(raw.serving_size),
    image: clean(raw.image_front_small_url),
    offUrl: OFF_PRODUCT_PAGE + encodeURIComponent(clean(raw.code) || barcode),
    rows,
    hasNutrition: hasAny,
    hasServing,
    completeness: { present, total: counted.length },
    ingredientsKnown: Boolean(ingredientsText) || Number(raw.ingredients_n) > 0,
    additives,
    categories: Array.isArray(raw.categories_tags) ? raw.categories_tags.map(String) : [],
    fruitVegNuts: fvn,
  };
}

// A number, or null if missing. Never turns "missing" into 0.
// An explicit 0 recorded in Open Food Facts stays 0 (agreed with Nathan, 19 Nov 2026).
function readNumber(value, factor = 1) {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num * factor;
}

function clean(value) {
  if (typeof value !== 'string') return value == null ? null : String(value);
  const t = value.trim();
  return t === '' ? null : t;
}
