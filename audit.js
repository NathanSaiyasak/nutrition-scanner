// audit.js — the v0.2 audit log. Records every scan on this phone only (browser localStorage),
// turns the log into a CSV spreadsheet, and works out the figures for the go/no-go pass marks.
// Nothing here is sent anywhere.

const STORAGE_KEY = 'nutrition-scanner-audit-log-v1';

// Fields of the timed "add this product" form, in label order. Blank = not on the label (null).
export const ADD_FIELDS = [
  { key: 'energy_kcal',   label: 'Energy',        unit: 'kcal', counts: true },
  { key: 'fat_g',         label: 'Fat',           unit: 'g',    counts: true },
  { key: 'saturated_fat_g', label: 'Saturated fat', unit: 'g',  counts: true },
  { key: 'carbohydrates_g', label: 'Carbohydrates', unit: 'g',  counts: true },
  { key: 'sugars_g',      label: 'Sugars',        unit: 'g',    counts: true },
  { key: 'fibre_g',       label: 'Fibre',         unit: 'g',    counts: true },
  { key: 'protein_g',     label: 'Protein',       unit: 'g',    counts: true },
  { key: 'salt_g',        label: 'Salt',          unit: 'g',    counts: true },
  { key: 'sodium_mg',     label: 'Sodium',        unit: 'mg',   counts: false },
];

export const ADD_TARGET_SECONDS = 180; // pass mark: manual add in 3 minutes or less
export const SMALL_SAMPLE = 30;

// ---------- Storage ----------
// Every read and write is wrapped: private browsing or full storage must not break scanning.

export function loadLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}

export function clearLog() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
}

// Ask the browser not to delete the log when space runs low. Safari may say no; that's fine.
export function askToKeepData() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* not supported */ }
}

/**
 * Add one scan to the log. Returns the entry number, or null if the phone wouldn't save it.
 * scan: { barcode, method: 'camera'|'photo'|'typed', tries, readSeconds, result, errorKind,
 *         productName, valuesPresent, valuesTotal }
 */
export function logScan(scan) {
  const log = loadLog();
  const entry = log.reduce((max, row) => Math.max(max, row.entry || 0), 0) + 1;
  const complete = scan.result === 'found' && scan.valuesPresent != null
    ? scan.valuesPresent === scan.valuesTotal : null;
  log.push({
    entry,
    time: new Date().toISOString(),
    barcode: scan.barcode,
    method: scan.method,
    tries: scan.tries,
    readFirstTime: scan.method !== 'typed' && scan.tries === 1,
    readSeconds: scan.readSeconds ?? null,
    result: scan.result,              // 'found' | 'not-found' | 'error'
    errorKind: scan.errorKind ?? null, // 'timeout' | 'busy' | 'network'
    productName: scan.productName ?? null,
    valuesPresent: scan.valuesPresent ?? null,
    valuesTotal: scan.valuesTotal ?? null,
    complete,
    labelCheck: null, // 'matches' | 'differs' | 'cant-tell', set on the product screen
    labelNote: null,
    added: null,
  });
  return saveLog(log) ? entry : null;
}

/** Store a hand-added product on the log row it belongs to. Returns true if saved. */
export function attachAddedProduct(entry, added) {
  const log = loadLog();
  const row = log.find((r) => r.entry === entry);
  if (!row) return false;
  row.added = added;
  return saveLog(log);
}

/** Record whether the Open Food Facts data matches the printed label. Returns true if saved. */
export function setLabelCheck(entry, check, note) {
  const log = loadLog();
  const row = log.find((r) => r.entry === entry);
  if (!row) return false;
  row.labelCheck = check;
  row.labelNote = note || null;
  return saveLog(log);
}

export function countAddedValues(values) {
  // Salt counts as present if salt or sodium was typed (same rule as Open Food Facts lookups).
  return ADD_FIELDS.filter((f) => f.counts).filter((f) =>
    values[f.key] != null || (f.key === 'salt_g' && values.sodium_mg != null)).length;
}

// ---------- Summary for the pass marks ----------

export function summarise(log) {
  const scans = log.length;
  const firstTime = log.filter((r) => r.readFirstTime).length;

  // Coverage: one result per different barcode (the latest), lookup errors left out.
  // A product added by hand with all 8 values stays covered even if it is scanned again later.
  const latest = new Map();
  const addedComplete = new Set();
  for (const row of log) {
    if (row.result === 'error') continue;
    latest.set(row.barcode, row);
    if (row.added && countAddedValues(row.added.values) === 8) addedComplete.add(row.barcode);
  }
  const products = [...latest.values()];
  const found = products.filter((r) => r.result === 'found');
  const withNutrition = found.filter((r) => (r.valuesPresent || 0) > 0);
  const complete = found.filter((r) => r.complete === true);
  // Open Food Facts covers a product only if its data is complete and wasn't marked as
  // different from the label. Typed-in label values (new or correction) cover it either way.
  const freeDbCovered = complete.filter((r) => r.labelCheck !== 'differs');
  const covered = products.filter((r) =>
    addedComplete.has(r.barcode) || (r.complete === true && r.labelCheck !== 'differs'));
  const byHand = covered.length - freeDbCovered.filter((r) => !addedComplete.has(r.barcode)).length;

  // Label check, on different products found with nutrition facts (latest scan of each).
  const checked = withNutrition.filter((r) => r.labelCheck === 'matches' || r.labelCheck === 'differs');

  const addTimes = log.filter((r) => r.added).map((r) => r.added.seconds).sort((a, b) => a - b);
  const underTarget = addTimes.filter((s) => s <= ADD_TARGET_SECONDS).length;

  return {
    scans,
    errors: log.filter((r) => r.result === 'error').length,
    byMethod: {
      camera: log.filter((r) => r.method === 'camera').length,
      photo: log.filter((r) => r.method === 'photo').length,
      typed: log.filter((r) => r.method === 'typed').length,
    },
    scanClean: { count: firstTime, of: scans, target: 0.9 },
    products: products.length,
    found: found.length,
    withNutrition: withNutrition.length,
    freeDb: { count: freeDbCovered.length, of: products.length },
    freeDbDiffers: complete.filter((r) => r.labelCheck === 'differs' && !addedComplete.has(r.barcode)).length,
    covered: { count: covered.length, of: products.length, target: 0.9 },
    coveredByHand: byHand,
    label: {
      matches: checked.filter((r) => r.labelCheck === 'matches').length,
      checked: checked.length,
      cantTell: withNutrition.filter((r) => r.labelCheck === 'cant-tell').length,
      notChecked: withNutrition.filter((r) => !r.labelCheck).length,
    },
    adds: {
      count: addTimes.length,
      underTarget,
      median: median(addTimes),
      slowest: addTimes.length ? addTimes[addTimes.length - 1] : null,
    },
  };
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------- CSV ----------

const CSV_COLUMNS = [
  ['entry', (r) => r.entry],
  ['date_time', (r) => localDateTime(r.time)],
  ['barcode', (r) => r.barcode],
  ['how_read', (r) => r.method],
  ['tries', (r) => r.tries],
  ['read_first_time', (r) => yesNo(r.readFirstTime)],
  ['camera_seconds_to_read', (r) => r.readSeconds],
  ['lookup_result', (r) => (r.result === 'error' ? `error (${r.errorKind || 'unknown'})` : r.result)],
  ['product_name', (r) => r.productName],
  ['nutrition_values_present', (r) => (r.valuesPresent == null ? '' : `${r.valuesPresent} of ${r.valuesTotal}`)],
  ['nutrition_complete', (r) => yesNo(r.complete)],
  ['matches_label', (r) => ({ matches: 'matches', differs: 'differs', 'cant-tell': "can't tell" }[r.labelCheck] || '')],
  ['label_difference_note', (r) => r.labelNote],
  ['added_by_hand', (r) => (r.added ? (r.added.kind === 'correction' ? 'yes (correction)' : 'yes (new product)') : 'no')],
  ['add_seconds', (r) => r.added?.seconds],
  ['add_within_3_min', (r) => (r.added ? yesNo(r.added.seconds <= ADD_TARGET_SECONDS) : '')],
  ['added_name', (r) => r.added?.name],
  ['added_brand', (r) => r.added?.brand],
  ['added_quantity', (r) => r.added?.quantity],
  ['added_values_per', (r) => r.added?.basis],
  ['added_serving_size', (r) => r.added?.servingSize],
  ...ADD_FIELDS.map((f) => [`added_${f.key}`, (r) => r.added?.values?.[f.key]]),
  ['added_values_present', (r) => (r.added ? `${countAddedValues(r.added.values)} of 8` : '')],
];

export function toCsv(log) {
  const lines = [CSV_COLUMNS.map(([name]) => name).join(',')];
  for (const row of log) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(','));
  // The invisible "BOM" at the start tells Excel the file is UTF-8, so Thai text shows correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Stop a value like "=SUM(...)" in a product name from running as a spreadsheet formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function yesNo(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

// "2026-11-22 14:05:09" in the phone's own time zone (easy to read and sort in a spreadsheet).
export function localDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function csvFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `scan-log-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `-${p(date.getHours())}${p(date.getMinutes())}.csv`;
}
