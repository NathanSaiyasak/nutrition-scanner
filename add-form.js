// add-form.js — the v0.2 timed form for typing in a product that Open Food Facts doesn't have.
// app.js shows the screen after calling openAddForm. A hidden timer measures the "manual add in 3 minutes or less" pass mark
// (shown in the Audit log, not on the form: UX review item 10, 26 Nov 2026). Values are stored exactly
// as typed: a blank box stays blank (not on the label), never 0.
import { ADD_FIELDS, attachAddedProduct } from './audit.js?v=r20';
import { t } from './i18n.js?v=r20';

// Add-form field key → label text key in strings.js.
const LABEL_KEY = {
  energy_kcal: 'energy', fat_g: 'fat', saturated_fat_g: 'saturated-fat', carbohydrates_g: 'carbohydrates',
  sugars_g: 'sugars', fibre_g: 'fibre', protein_g: 'protein', salt_g: 'salt', sodium_mg: 'sodium',
};

const $ = (id) => document.getElementById(id);

let startedAt = 0;
let current = null; // { entry, barcode, onDone, onCancel }
let photoUrl = null;

// The boxes follow the order of a Thai nutrition label (UX review item 10). Salt has no box: Thai labels
// print sodium only, and sodium counts for salt in the completeness check (audit.js).
const FORM_ORDER = ['energy_kcal', 'fat_g', 'saturated_fat_g', 'protein_g', 'carbohydrates_g', 'fibre_g', 'sugars_g', 'sodium_mg'];
const FORM_FIELDS = FORM_ORDER.map((key) => ADD_FIELDS.find((f) => f.key === key));

// Build the nutrient boxes once.
const grid = $('add-nutrients');
for (const f of FORM_FIELDS) {
  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = `add-${f.key}`;
  label.textContent = `${LABEL_KEY[f.key] ? t(`label.${LABEL_KEY[f.key]}`) : f.label} (${f.unit})`;
  const input = document.createElement('input');
  input.id = `add-${f.key}`;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.maxLength = 12;
  wrap.append(label, input);
  grid.append(wrap);
}

// mode: 'new' (not in Open Food Facts) or 'correction' (found, but missing values or
// different from the label). For a correction the product name is filled in to save time.
export function openAddForm({ entry, barcode, mode = 'new', name = '', onDone, onCancel }) {
  current = { entry, barcode, mode, onDone, onCancel };
  $('add-form').reset();
  $('add-title').textContent = t(mode === 'correction' ? 'form.correctTitle' : 'form.addTitle');
  $('add-name').value = name;
  for (const el of $('add-form').querySelectorAll('.invalid')) el.classList.remove('invalid');
  for (const id of ['add-name-error', 'add-number-error', 'add-save-error']) $(id).hidden = true;
  clearPhoto();
  updateServingRow();
  $('add-barcode').textContent = barcode;

  startedAt = Date.now();
}

export function stopAddTimer() {
  clearPhoto();
}

function elapsedSeconds() {
  return Math.round((Date.now() - startedAt) / 1000);
}

// ---------- Serving size only matters for "per serving" ----------
function basis() {
  const checked = $('add-form').querySelector('input[name="basis"]:checked');
  return checked ? checked.value : 'per serving';
}
function updateServingRow() {
  $('serving-row').hidden = basis() !== 'per serving';
}
for (const radio of document.querySelectorAll('input[name="basis"]')) {
  radio.addEventListener('change', updateServingRow);
}

// ---------- Label photo: shown on screen only, never uploaded or saved ----------
$('label-photo-input').addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  clearPhoto();
  photoUrl = URL.createObjectURL(file);
  $('label-photo').src = photoUrl;
  $('label-photo').hidden = false;
});
function clearPhoto() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  $('label-photo').removeAttribute('src');
  $('label-photo').hidden = true;
}

// ---------- Reading the boxes ----------
// Accepts "12", "1.5", "1,5" (comma decimal) and "<1" (Thai labels often print "less than 1").
// Returns { ok, value } where value is a number, a "<n" string, or null for an empty box.
function readValue(text) {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '') return { ok: true, value: null };
  const m = /^(<)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return { ok: false };
  return { ok: true, value: m[1] ? `<${m[2]}` : Number(m[2]) };
}

$('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!current) return;
  let valid = true;

  const name = $('add-name').value.trim();
  $('add-name').classList.toggle('invalid', !name);
  $('add-name-error').hidden = !!name;
  if (!name) valid = false;

  const values = {};
  let numbersOk = true;
  for (const f of ADD_FIELDS) {
    const input = $(`add-${f.key}`);
    if (!input) { values[f.key] = null; continue; } // no box on the form (salt)
    const read = readValue(input.value);
    input.classList.toggle('invalid', !read.ok);
    if (!read.ok) numbersOk = false;
    else values[f.key] = read.value;
  }
  $('add-number-error').hidden = numbersOk;
  if (!numbersOk) valid = false;

  if (!valid) {
    const first = $('add-form').querySelector('.invalid');
    if (first) first.focus();
    return;
  }

  const seconds = elapsedSeconds(); // timer stops when Save is tapped and the form is valid
  const b = basis();
  const added = {
    kind: current.mode,
    seconds,
    name,
    brand: $('add-brand').value.trim() || null,
    quantity: $('add-quantity').value.trim() || null,
    basis: b,
    servingSize: b === 'per serving' ? ($('add-serving').value.trim() || null) : null,
    values,
    // Free text, kept as typed. The score finds the INS numbers in both (shared-db.js fromAdded).
    ingredients: $('add-ingredients').value.trim() || null,
    insNumbers: $('add-ins').value.trim() || null,
  };
  const saved = attachAddedProduct(current.entry, added);
  if (!saved) {
    $('add-save-error').hidden = false;
    return;
  }
  const { onDone } = current;
  current = null;
  stopAddTimer();
  onDone(seconds, added);
});

$('add-cancel').addEventListener('click', () => {
  if (!current) return;
  const { onCancel } = current;
  current = null;
  stopAddTimer();
  onCancel();
});
