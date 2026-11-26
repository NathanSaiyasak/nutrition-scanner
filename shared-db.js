// shared-db.js — products we add ourselves (from the label on the pack, with the timed form).
//
// Every product added is first saved on this phone (browser localStorage), so nothing is lost without
// internet or before the shared database is set up. When the shared database (Supabase, see config.js
// and supabase/setup.sql) is set up and this phone has the contributor passcode, saved products are
// sent there, and any phone that scans the barcode sees them.
//
// Lookups ask Open Food Facts and our own products at the same time. If we have typed the product in
// from its label, our values are shown (testers found Open Food Facts often differs from the pack),
// with the Open Food Facts photo when there is one. Values are kept exactly as typed: a blank box stays
// "not available", "<1" stays "<1".
import { SHARED_DB_URL, SHARED_DB_KEY } from './config.js?v=r8';
import { lookupProduct, NUTRIENTS } from './lookup.js?v=r8';
import { ADD_FIELDS, countAddedValues } from './audit.js?v=r8';

const ADDED_KEY = 'nutrition-scanner-added-products-v1';
const PASSCODE_KEY = 'nutrition-scanner-contributor-passcode';
const TIMEOUT_MS = 6000;
const TABLE = 'added_products';

// Our form's fields → the nutrient rows the result screen uses (lookup.js NUTRIENTS keys).
// Sodium is typed in mg and the screen shows mg, so it needs no conversion.
const FIELD_TO_ROW = {
  energy_kcal: 'energy-kcal', fat_g: 'fat', saturated_fat_g: 'saturated-fat',
  carbohydrates_g: 'carbohydrates', sugars_g: 'sugars', fibre_g: 'fiber',
  protein_g: 'proteins', salt_g: 'salt', sodium_mg: 'sodium',
};

export function sharedConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(SHARED_DB_URL) && SHARED_DB_KEY.length > 20;
}

// ---------- Passcode (kept on this phone only) ----------
export function getPasscode() {
  try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch { return ''; }
}
function setPasscode(value) {
  try {
    if (value) localStorage.setItem(PASSCODE_KEY, value);
    else localStorage.removeItem(PASSCODE_KEY);
    return true;
  } catch { return false; }
}
export function forgetPasscode() { setPasscode(''); }

/** Check a passcode with the database and keep it on this phone if right.
 *  Resolves 'ok' | 'wrong' | 'offline' | 'not-set-up' | 'storage'. */
export async function savePasscode(passcode) {
  if (!sharedConfigured()) return 'not-set-up';
  const res = await callApi('rpc/check_passcode', { method: 'POST', body: { p_passcode: passcode } });
  if (!res.ok) return 'offline';
  if (res.data !== true) return 'wrong';
  return setPasscode(passcode) ? 'ok' : 'storage';
}

// ---------- Products saved on this phone ----------
export function loadAdded() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADDED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.barcode) : [];
  } catch { return []; }
}
function saveAdded(list) {
  try { localStorage.setItem(ADDED_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
export function waitingCount() {
  return loadAdded().filter((p) => !p.shared && !p.rejected).length;
}

/**
 * Keep a product typed in from the label, then try to send it to the shared database.
 * added: the record the timed form saves to the audit log ({ kind, seconds, name, brand, quantity,
 * basis, servingSize, values, ingredients, insNumbers }). Resolves { status, reason } where status is
 * 'shared' | 'phone-only' | 'not-saved'.
 */
export async function keepAddedProduct(barcode, added) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    barcode,
    kind: added.kind,
    seconds: added.seconds,
    name: added.name,
    brand: added.brand,
    quantity: added.quantity,
    basis: added.basis,
    servingSize: added.servingSize,
    values: added.values,
    ingredients: added.ingredients || null,
    insNumbers: added.insNumbers || null,
    shared: false,
  };
  const list = loadAdded();
  list.push(record);
  if (!saveAdded(list)) return { status: 'not-saved', reason: 'storage' };
  const result = await sendWaiting();
  const sent = loadAdded().find((p) => p.id === record.id);
  return sent && sent.shared ? { status: 'shared' } : { status: 'phone-only', reason: result.reason };
}

let sending = null;
/** Send every product still waiting. Resolves { sent, waiting, reason }.
 *  reason (when something is still waiting): 'not-set-up' | 'no-passcode' | 'wrong-passcode' | 'offline' */
export function sendWaiting() {
  if (!sending) sending = doSend().finally(() => { sending = null; });
  return sending;
}
async function doSend() {
  let sent = 0;
  const waiting = () => loadAdded().filter((p) => !p.shared && !p.rejected);
  if (!waiting().length) return { sent, waiting: 0 };
  if (!sharedConfigured()) return { sent, waiting: waiting().length, reason: 'not-set-up' };
  const passcode = getPasscode();
  if (!passcode) return { sent, waiting: waiting().length, reason: 'no-passcode' };

  for (const rec of waiting()) {
    const res = await callApi('rpc/add_product', {
      method: 'POST',
      body: { p_passcode: passcode, p_product: toDbRow(rec) },
    });
    if (res.status === 400) {
      // The database refused this one entry (for example a value it can't accept). Keep it on the
      // phone, stop retrying it, and carry on with the others.
      markItem(rec.id, { rejected: true });
      continue;
    }
    if (!res.ok) {
      const reason = res.status === 403 ? 'wrong-passcode' : 'offline';
      if (reason === 'wrong-passcode') forgetPasscode();
      return { sent, waiting: waiting().length, reason };
    }
    markItem(rec.id, { shared: true, sharedId: res.data ?? null });
    sent += 1;
  }
  return { sent, waiting: waiting().length };
}

// Update one saved product (re-read first: another save may have happened meanwhile).
function markItem(id, changes) {
  const list = loadAdded();
  const item = list.find((p) => p.id === id);
  if (item) { Object.assign(item, changes); saveAdded(list); }
}

function toDbRow(rec) {
  const row = {
    barcode: rec.barcode,
    kind: rec.kind === 'correction' ? 'correction' : 'new',
    name: rec.name,
    brand: rec.brand || null,
    quantity: rec.quantity || null,
    basis: rec.basis,
    serving_size: rec.servingSize || null,
    add_seconds: Number.isFinite(rec.seconds) ? rec.seconds : null,
    added_at: rec.savedAt,
    // Older databases without these two columns simply ignore them (see supabase/add-ingredients.sql).
    ingredients: rec.ingredients || null,
    ins_numbers: rec.insNumbers || null,
  };
  for (const f of ADD_FIELDS) {
    const v = rec.values ? rec.values[f.key] : null;
    row[f.key] = v == null ? null : String(v); // "12.5", "0" or "<1", exactly as typed
  }
  return row;
}

// ---------- Lookup ----------
/**
 * Look a barcode up in Open Food Facts and in our own products at the same time.
 * Resolves like lookupProduct: { kind: 'found', product } or { kind: 'not-found' | 'timeout' | 'busy' | 'network' }.
 * product.source is 'off' (Open Food Facts), 'shared' (our shared database) or 'phone' (added on this phone).
 */
export async function findProduct(barcode) {
  const [off, shared] = await Promise.all([lookupProduct(barcode), lookupShared(barcode)]);
  const local = latestLocal(barcode);

  // Our own entry, the newest of the shared one and the one saved on this phone.
  let ours = shared;
  if (local && (!ours || local.savedAt > ours.savedAt)) ours = local;

  if (ours) {
    const offProduct = off.kind === 'found' ? off.product : null;
    const product = fromAdded(ours, ours === shared ? 'shared' : 'phone');
    if (offProduct) {
      product.image = offProduct.image; // photo from Open Food Facts, values from the label
      product.offUrl = offProduct.offUrl;
      product.photoFromOff = Boolean(offProduct.image);
      // Nothing typed about ingredients: use what Open Food Facts knows, so additives are still checked.
      if (!product.ingredientsKnown && offProduct.ingredientsKnown) {
        product.ingredientsKnown = true;
        product.additives = offProduct.additives;
      }
      if (!product.categories.length) product.categories = offProduct.categories || [];
      if (product.fruitVegNuts == null) product.fruitVegNuts = offProduct.fruitVegNuts ?? null;
    }
    // For the audit's "free databases alone" figure: did Open Food Facts have complete values too?
    product.offComplete = offProduct
      ? offProduct.completeness.present === offProduct.completeness.total : false;
    if (off.kind !== 'found' && off.kind !== 'not-found') product.offComplete = null; // unknown
    return { kind: 'found', product };
  }
  if (off.kind === 'found') off.product.source = 'off';
  return off;
}

function latestLocal(barcode) {
  const mine = loadAdded().filter((p) => p.barcode === barcode);
  return mine.length ? mine[mine.length - 1] : null;
}

// Newest shared entry for a barcode, in the same shape as a phone-saved record, or null.
async function lookupShared(barcode) {
  if (!sharedConfigured() || !/^\d{6,14}$/.test(barcode)) return null;
  const res = await callApi(
    `${TABLE}?barcode=eq.${barcode}&order=created_at.desc&limit=1&select=*`, { method: 'GET' });
  if (!res.ok || !Array.isArray(res.data) || !res.data.length) return null; // any problem: fall back
  const r = res.data[0];
  const values = {};
  for (const f of ADD_FIELDS) values[f.key] = parseValue(r[f.key]);
  return {
    barcode: r.barcode,
    savedAt: r.created_at,
    kind: r.kind,
    name: r.name,
    brand: r.brand,
    quantity: r.quantity,
    basis: r.basis,
    servingSize: r.serving_size,
    values,
    ingredients: r.ingredients || null, // missing on rows added before 24 Nov 2026
    insNumbers: r.ins_numbers || null,
  };
}

// "12.5" → 12.5, "<1" stays "<1", empty → null.
function parseValue(v) {
  if (v == null || v === '') return null;
  const t = String(v).trim();
  if (/^<\d+(\.\d+)?$/.test(t)) return t;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Turn one of our records into the product shape the result screen uses (see lookup.js normalise). */
export function fromAdded(rec, source) {
  const perServing = rec.basis === 'per serving';
  const rows = NUTRIENTS.map((def) => {
    const field = Object.keys(FIELD_TO_ROW).find((k) => FIELD_TO_ROW[k] === def.key);
    const raw = rec.values ? rec.values[field] : null;
    const lessThan = typeof raw === 'string' && raw.startsWith('<');
    const value = raw == null ? null : lessThan ? Number(raw.slice(1)) : Number(raw);
    const v = Number.isFinite(value) ? value : null;
    return {
      ...def,
      per100: perServing ? null : v,
      perServing: perServing ? v : null,
      lessThan: v !== null && lessThan, // label printed "less than"; shown as "<1 g"
    };
  });
  const hasAny = rows.some((r) => r.per100 !== null || r.perServing !== null);
  return {
    barcode: rec.barcode,
    name: rec.name || 'Unnamed product',
    altName: null,
    brands: rec.brand || null,
    quantity: rec.quantity || null,
    servingSize: perServing ? (rec.servingSize || null) : null,
    basis: rec.basis,
    image: null,
    offUrl: null,
    rows,
    hasNutrition: hasAny,
    hasServing: perServing && hasAny,
    completeness: { present: countAddedValues(rec.values || {}), total: 8 },
    source,
    addedAt: rec.savedAt,
    // Typed in the add form (24 Nov 2026). Either box counts as having read the ingredients.
    ingredientsKnown: Boolean(rec.ingredients || rec.insNumbers),
    additives: insCodes(rec.ingredients, rec.insNumbers),
    categories: [],
    fruitVegNuts: null,
  };
}

// INS / E numbers typed in the add form, as additive tags the score reads ("ins:211").
// In the INS box every three digit number counts ("211, 621", "E102", "INS 150d").
// In the ingredients text only numbers written after INS or E count, the same as lookup.js, so
// "100 g" or "250 ml" isn't mistaken for an additive. Longer codes (like 1422) aren't scored.
export function insCodes(ingredients, insNumbers) {
  const codes = new Set();
  for (const m of String(insNumbers || '').matchAll(/(?<!\d)(\d{3})(?!\d)/g)) codes.add(`ins:${m[1]}`);
  for (const m of String(ingredients || '').matchAll(/\b(?:INS|E)\s*-?\s*(\d{3})(?!\d)/gi)) codes.add(`ins:${m[1]}`);
  return [...codes];
}

// ---------- Talking to Supabase (its standard REST interface; no extra library needed) ----------
async function callApi(path, { method, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { apikey: SHARED_DB_KEY };
  // Legacy "anon" keys are tokens that also go in Authorization; new publishable keys must not.
  if (SHARED_DB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SHARED_DB_KEY}`;
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${SHARED_DB_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty answer */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}
