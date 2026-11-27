// checks.js — automatic number checks (Nathan approved the data plan, 27 Nov 2026:
// https://claude.ai/artifact/FDM814YZyPrgjFfHkQ5JdH, "Automatic number checks").
//
// Every product, from Open Food Facts or typed in by us, is checked on its per 100 g or ml values
// before it is scored. The checks catch typing slips, unit mix-ups and impossible numbers. They can't
// catch a number that is plausible but wrong (an old recipe), only comparing with the pack does that.
//
//   hard: something is clearly wrong. The values are still shown, but there is no score, and the
//         barcode goes on the fix list (Audit log).
//   soft: unusual but possible. Scored as normal, the barcode goes on the fix list for a look.
//
// The thresholds are first proposals, to tune with the store test data. Nothing here changes a value.
// Tried on 285 Thai products from Open Food Facts on 27 Nov 2026: 5 failed a hard check (2%), and all 5
// looked genuinely wrong (saturated fat above fat, 720 kcal rice with no carbs, 111 g in 100 g).

const SLACK_G = 0.5; // labels round, so "sugar 10.2 g, carbs 10 g" is not an error

/**
 * facts: the facts from nutrition-view.js buildView() (each has key and judge100, per 100 g/ml).
 * p: the product (for the raw salt and sodium rows, the serving size and the categories).
 * Returns { hard: string[], soft: string[] } with check codes (see CHECK_CODES).
 */
export function checkNumbers(p, facts, { drink = false, servingAmount = null } = {}) {
  const hard = [];
  const soft = [];
  const v = (key) => {
    const f = facts.find((x) => x.key === key);
    return f && f.judge100 !== null && Number.isFinite(f.judge100) ? f.judge100 : null;
  };
  const energy = v('energy');
  const fat = v('fat');
  const sat = v('satfat');
  const carbs = v('carbs');
  const sugars = v('sugars');
  const protein = v('protein');
  const fibre = v('fibre');
  const sodium = v('sodium'); // mg
  const cats = (p.categories || []).map((c) => String(c).toLowerCase());
  const name = `${p.name || ''} ${p.altName || ''}`.toLowerCase();

  // Values that can't be bigger than the value they are part of.
  if (sugars !== null && carbs !== null && sugars > carbs + SLACK_G) hard.push('sugarOverCarbs');
  if (sat !== null && fat !== null && sat > fat + SLACK_G) hard.push('satOverFat');

  // 100 g can't hold more than 100 g of carbs, protein and fat (5 g slack for rounding). Salt is left
  // out: tried on 285 Thai products from Open Food Facts (27 Nov 2026), it flagged real soup powders.
  const parts = [carbs, protein, fat];
  if (parts.filter((x) => x !== null).length >= 2) {
    const total = parts.reduce((sum, x) => sum + (x ?? 0), 0);
    if (total > 105) hard.push('tooHeavy');
  }

  // Pure fat is 900 kcal per 100 g, nothing is higher. 950 leaves room for labels that round per
  // serving (coconut oil printed as 130 kcal per 14 g works out at 929).
  if (energy !== null && energy > 950) hard.push('energyTooHigh');

  // Calories against the macros: 4 kcal per g of carbs and protein, 9 per g of fat.
  if (energy !== null && carbs !== null && protein !== null && fat !== null) {
    const fromMacros = 4 * carbs + 4 * protein + 9 * fat;
    const ratio = fromMacros > 0 ? energy / fromMacros : null;
    if (fromMacros >= 20 && ratio !== null && ratio >= 3.8 && ratio <= 4.6) {
      hard.push('looksLikeKj'); // kilojoules typed or stored as kcal (1 kcal = 4.184 kJ)
    } else {
      const gap = Math.abs(energy - fromMacros);
      // Small servings round a lot (1 g of protein in 15 ml of sauce is 6.7 g per 100), so the hard
      // check allows 25 kcal either way, the soft one 15, plus 2 kcal per gram of fibre.
      const allowed = (pct, kcal) => Math.max(pct * Math.max(energy, fromMacros), kcal + 2 * (fibre ?? 0));
      // Sugar alcohols, sweeteners and alcohol don't follow the 4-4-9 rule, so only flag softly there.
      const otherEnergy = /sugar[- ]?free|no[- ]sugar|zero|diet|light|ไม่มีน้ำตาล|ไม่เติมน้ำตาล/.test(name)
        || cats.some((c) => /sugar-free|artificially-sweetened|no-added-sugar|diet|alcoholic/.test(c));
      if (gap > allowed(0.3, 25) && !otherEnergy) hard.push('energyVsMacros');
      else if (gap > allowed(0.2, 15)) soft.push('energyVsMacros');
    }
  }

  // A food with nothing in it at all (water and zero drinks really are all zeros).
  if (!drink && [energy, fat, carbs, protein].every((x) => x === 0)) hard.push('allZero');

  // Salt and sodium both on the label: salt is sodium × 2.5.
  const saltRow = (p.rows || []).find((r) => r.key === 'salt');
  const sodiumRow = (p.rows || []).find((r) => r.key === 'sodium');
  if (saltRow && sodiumRow && saltRow.per100 !== null && sodiumRow.per100 !== null && saltRow.per100 > 0) {
    const saltFromSodium = (sodiumRow.per100 * 2.5) / 1000; // sodium row is in mg
    if (Math.abs(saltRow.per100 - saltFromSodium) > Math.max(0.1 * saltRow.per100, 0.05)) soft.push('saltVsSodium');
  }

  // Sodium in micrograms by mistake (the Hooray milk case: about 0.1 mg per 100 ml).
  if (sodium !== null && sodium > 0 && sodium < 1 && energy !== null && energy > 20) soft.push('sodiumTiny');

  // Unusual for the type of product.
  if (drink && energy !== null && energy > 100) soft.push('drinkEnergy');
  const salty = cats.some((c) => /sauce|seasoning|condiment|salt|stock|bouillon|soy|fish-sauce|paste/.test(c))
    || /sauce|seasoning|paste|ซอส|น้ำปลา|ซีอิ๊ว|เครื่องปรุง|ผงปรุงรส|เกลือ|กะปิ/.test(name);
  if (!drink && sodium !== null && sodium > 8000 && !salty) soft.push('sodiumVeryHigh');

  // Per serving and per 100 both on the label: they should agree with the serving size.
  if (servingAmount) {
    for (const r of p.rows || []) {
      if (r.per100 === null || r.perServing === null || r.per100 === undefined || r.perServing === undefined) continue;
      const expected = (r.per100 * servingAmount) / 100;
      if (Math.abs(expected - r.perServing) > Math.max(0.1 * Math.max(expected, r.perServing), r.key === 'sodium' ? 5 : 0.3)) {
        soft.push('servingMaths');
        break;
      }
    }
  }

  return { hard: [...new Set(hard)], soft: [...new Set(soft)] };
}

// The codes above, in the order they are listed in the Audit log and the CSV.
export const CHECK_CODES = [
  'sugarOverCarbs', 'satOverFat', 'tooHeavy', 'energyTooHigh', 'looksLikeKj', 'energyVsMacros', 'allZero',
  'saltVsSodium', 'sodiumTiny', 'drinkEnergy', 'sodiumVeryHigh', 'servingMaths',
];
