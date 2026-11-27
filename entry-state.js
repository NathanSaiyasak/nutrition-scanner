// entry-state.js — which of our own entries to show, and whether entries agree (27 Nov 2026, from the
// data plan Nathan approved: https://claude.ai/artifact/FDM814YZyPrgjFfHkQ5JdH, "Product states").
//
// States of our entries:
//   verified — added by a tester with the contributor passcode (every entry so far), or two independent
//              entries agree, or a shopper's entry agrees with Open Food Facts.
//   pending  — one entry from a shopper, not checked yet. There is no way for shoppers to add products
//              yet (that comes with the AI label reader); the rules are here so it works when it does.
//   disputed — the two newest entries disagree. A flag on top of the state: the product goes on the fix
//              list, and is settled when a new entry agrees with one side.
// Before this, the newest entry simply won.
//
// Two entries "agree" when every value both have is within 10% or 1 g, whichever is larger (energy within
// 10 kcal, sodium within 30 mg), after converting both to per 100 g or ml. Blank boxes are skipped. At
// least 3 values must be compared, otherwise we can't tell.

const TOLERANCE = {
  energy_kcal: 10, sodium_mg: 30, salt_g: 0.1,
  fat_g: 1, saturated_fat_g: 1, carbohydrates_g: 1, sugars_g: 1, fibre_g: 1, protein_g: 1,
};

// Serving size in g or ml from text like "1 ซอง (60 ก.)", "30 g", "250 ml". null when unclear.
export function servingGrams(text) {
  if (!text) return null;
  const m = String(text).toLowerCase().replace(',', '.')
    .match(/(\d+(?:\.\d+)?)\s*(ml|มล\.?|cl|l|ลิตร|g|กรัม|ก\.)(?![a-z])/);
  if (!m) return null;
  const n = parseFloat(m[1]) * ({ cl: 10, l: 1000, 'ลิตร': 1000 }[m[2]] || 1);
  return n > 0 ? n : null;
}

// One value as { n, less } ("12.5" → 12.5, "<1" → less than 1), or null when blank.
function parse(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const less = s.startsWith('<');
  const n = Number(less ? s.slice(1) : s);
  return Number.isFinite(n) && n >= 0 ? { n, less } : null;
}

// Multiply to get per 100 g/ml, or null when a per-serving entry has no usable serving size.
function toPer100(entry) {
  if (entry.basis !== 'per serving') return 1;
  const g = servingGrams(entry.servingSize);
  return g ? 100 / g : null;
}

/** true (agree), false (disagree) or null (can't tell: too few values, or no serving size). */
export function entriesAgree(a, b) {
  if (!a || !b || !a.values || !b.values) return null;
  let fa = toPer100(a);
  let fb = toPer100(b);
  if (fa === null || fb === null) {
    // Both per serving with the same unclear serving: compare as printed.
    if (a.basis === b.basis && (a.servingSize || '') === (b.servingSize || '')) { fa = 1; fb = 1; } else return null;
  }
  let compared = 0;
  const skipSalt = parse(a.values.sodium_mg) && parse(b.values.sodium_mg); // salt repeats sodium
  for (const key of Object.keys(TOLERANCE)) {
    if (key === 'salt_g' && skipSalt) continue;
    const x = parse(a.values[key]);
    const y = parse(b.values[key]);
    if (!x || !y) continue;
    compared += 1;
    const xv = x.n * fa;
    const yv = y.n * fb;
    const tol = Math.max(TOLERANCE[key], 0.1 * Math.max(xv, yv));
    if (x.less && y.less) continue;
    if (x.less) { if (yv > xv + tol) return false; continue; }
    if (y.less) { if (xv > yv + tol) return false; continue; }
    if (Math.abs(xv - yv) > tol) return false;
  }
  return compared >= 3 ? true : null;
}

/**
 * Pick the entry to show from our entries for one barcode.
 * entries: newest first, each { status?: 'verified'|'pending', basis, servingSize, values, savedAt }.
 * Returns { entry, state: 'verified'|'pending', disputed } or null when there are none.
 */
export function chooseEntry(entries) {
  const list = (entries || []).filter(Boolean);
  if (!list.length) return null;
  const isPending = (e) => e.status === 'pending';
  const verified = list.filter((e) => !isPending(e));
  const pending = list.filter(isPending);

  if (verified.length) {
    // A tester's newest entry is shown (testers correct their own typing), but if it disagrees with the
    // entry before it, or a newer shopper entry disagrees with it, someone should look at the pack.
    const shown = verified[0];
    const time = (e) => { const ms = new Date(e.savedAt || 0).getTime(); return Number.isFinite(ms) ? ms : 0; };
    const newerPending = pending.filter((e) => time(e) > time(shown));
    const disputed = entriesAgree(shown, verified[1]) === false
      || newerPending.some((e) => entriesAgree(shown, e) === false);
    return { entry: shown, state: 'verified', disputed };
  }

  // Only shoppers' entries: two that agree make it verified; two that disagree keep the older one.
  if (pending.length >= 2) {
    const agree = entriesAgree(pending[0], pending[1]);
    if (agree === true) return { entry: pending[0], state: 'verified', disputed: false };
    if (agree === false) return { entry: pending[1], state: 'pending', disputed: true };
  }
  return { entry: pending[0], state: 'pending', disputed: false };
}
