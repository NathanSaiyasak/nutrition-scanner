// app.js — the screens. Shows one screen at a time: start, loading, product, message,
// and (v0.2) the timed add form and the audit summary.
// All product text goes in with textContent (never innerHTML), so odd data can't break the page.
import { lookupProduct } from './lookup.js';
import { startScanner, scanPhoto } from './scanner.js';
import { logScan, askToKeepData } from './audit.js';
import { openAddForm, stopAddTimer } from './add-form.js';
import { renderAudit } from './audit-screen.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-start', 'screen-loading', 'screen-product', 'screen-message',
  'screen-add', 'screen-audit'];

export function show(screenId) {
  if (screenId !== 'screen-start') stopCamera();
  if (screenId !== 'screen-add') stopAddTimer();
  for (const id of SCREENS) $(id).hidden = id !== screenId;
  window.scrollTo(0, 0);
}

// ---------- Start screen: camera ----------
let stopScanner = null;
let lastBarcode = null;

// ---------- Audit: how this barcode was read ----------
// An "attempt" runs from the start screen until a barcode is read. Each camera start and each
// photo picked is one try. Read first time = read by the first try, without typing (spec FR-14).
let attempt = newAttempt();
function newAttempt() { return { tries: 0, cameraStartedAt: null }; }

const CAMERA_ERRORS = {
  denied: ['Camera access was blocked',
    'Allow camera access for this site in your browser settings, then tap "Scan a barcode" again. You can also use a photo or type the number below.'],
  'no-camera': ['No camera found',
    "This device or browser doesn't offer a camera to the page. Use a photo of the barcode or type the number below instead."],
  'in-use': ['Camera is busy',
    'Another app may be using the camera. Close it and try again, or type the number below.'],
  insecure: ['Camera needs a secure link',
    'Browsers only allow the camera on https:// pages. Open the hosted link, or type the number below.'],
  unknown: ["Couldn't start the camera",
    'Try again, or type the barcode number below.'],
};

function startCamera(ignore = null) {
  stopCamera();
  $('camera-error').hidden = true;
  $('photo-status').hidden = true;
  $('camera').hidden = false;
  $('scan-button').hidden = true;
  $('stop-button').hidden = false;
  attempt.tries += 1;
  attempt.cameraStartedAt = Date.now();
  stopScanner = startScanner($('camera-video'), {
    ignore,
    onResult: (barcode) => {
      stopScanner = null;
      resetCameraUi();
      const readSeconds = Math.round((Date.now() - attempt.cameraStartedAt) / 100) / 10;
      handleBarcode(barcode, { method: 'camera', readSeconds });
    },
    onError: (kind) => {
      stopCamera();
      const [title, text] = CAMERA_ERRORS[kind] || CAMERA_ERRORS.unknown;
      $('camera-error-title').textContent = title;
      $('camera-error-text').textContent = text;
      $('camera-error').hidden = false;
    },
  });
}

function stopCamera() {
  if (stopScanner) stopScanner();
  stopScanner = null;
  resetCameraUi();
}

function resetCameraUi() {
  $('camera').hidden = true;
  $('scan-button').hidden = false;
  $('stop-button').hidden = true;
}

$('scan-button').addEventListener('click', () => startCamera());

// ---------- Start screen: photo of a barcode ----------
// On phones, this offers "Take photo" or "Photo library". The photo stays on the phone:
// it is read here in the browser and never uploaded anywhere.
$('photo-input').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // so picking the same photo again still works
  if (!file) return;
  stopCamera();
  attempt.tries += 1;
  const status = $('photo-status');
  status.textContent = 'Reading the barcode in your photo…';
  status.hidden = false;
  let barcode = null;
  try {
    barcode = await scanPhoto(file);
  } catch {
    barcode = null;
  }
  if (barcode) {
    status.hidden = true;
    handleBarcode(barcode, { method: 'photo' });
  } else {
    status.textContent = "Couldn't find a barcode in that photo. Try a closer, sharper photo with the whole barcode in view, or type the number below.";
  }
});
$('stop-button').addEventListener('click', stopCamera);
// Turn the camera off when the person switches app or tab.
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });

// ---------- Start screen: manual entry ----------
$('manual-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('barcode-input');
  const barcode = input.value.replace(/\D/g, '');
  const error = $('manual-error');

  // EAN-8 has 8 digits, UPC-A 12, EAN-13 13, GTIN-14 14.
  if (![8, 12, 13, 14].includes(barcode.length)) {
    error.textContent = 'A barcode number has 8, 12 or 13 digits. Please check and try again.';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  input.blur();
  handleBarcode(barcode, { method: 'typed' });
});

// ---------- Lookup ----------
let currentLookup = 0;

let currentEntry = null; // audit log entry number of the product on screen

export async function handleBarcode(barcode, how = { method: 'typed' }) {
  const lookupId = ++currentLookup;
  lastBarcode = barcode;
  const tries = Math.max(1, attempt.tries + (how.method === 'typed' ? 1 : 0));
  attempt = newAttempt(); // the next scan starts counting from zero
  $('loading-barcode').textContent = barcode;
  show('screen-loading');

  const result = await lookupProduct(barcode);

  // Record the scan even if the person has already moved on to another screen.
  const product = result.kind === 'found' ? result.product : null;
  const entry = logScan({
    barcode,
    method: how.method,
    tries,
    readSeconds: how.readSeconds,
    result: product ? 'found' : result.kind === 'not-found' ? 'not-found' : 'error',
    errorKind: product || result.kind === 'not-found' ? null : result.kind,
    productName: product ? product.name : null,
    valuesPresent: product ? product.completeness.present : null,
    valuesTotal: product ? product.completeness.total : null,
  });

  if (lookupId !== currentLookup) return; // the person already moved on
  currentEntry = entry;
  showSavedNote(entry);

  const canAdd = entry !== null;
  $('message-add').hidden = true;
  switch (result.kind) {
    case 'found':
      renderProduct(result.product);
      // Missing or incomplete nutrition: offer the timed form, so the product can still be covered.
      $('product-add').hidden = !canAdd
        || result.product.completeness.present === result.product.completeness.total;
      break;
    case 'not-found':
      showMessage('Product not found',
        "This barcode isn't in Open Food Facts yet.", barcode);
      $('message-add').hidden = !canAdd;
      break;
    case 'timeout':
      showMessage('Lookup timed out',
        'Open Food Facts took too long to answer. Check your connection and try again.', barcode);
      break;
    case 'busy':
      showMessage('Too many lookups',
        'Open Food Facts is busy or limiting requests. Wait a minute and try again.', barcode);
      break;
    default:
      showMessage('Network error',
        "Couldn't reach Open Food Facts. Check your internet connection and try again.", barcode);
  }
}

function showSavedNote(entry) {
  for (const el of document.querySelectorAll('.saved-note')) {
    el.textContent = entry === null
      ? "Couldn't save this scan to the audit log. This phone's storage may be full or blocked (for example in a private window)."
      : `Saved to audit log (#${entry}).`;
    el.classList.toggle('field-error', entry === null);
    el.hidden = false;
  }
}

export function showMessage(title, text, barcode) {
  $('message-title').textContent = title;
  $('message-text').textContent = text;
  $('message-barcode').textContent = barcode ? `Barcode: ${barcode}` : '';
  show('screen-message');
}

// ---------- Product screen ----------
function renderProduct(p) {
  $('product-name').textContent = p.name;
  $('product-name-alt').textContent = p.altName || '';
  $('product-name-alt').hidden = !p.altName;
  $('product-meta').textContent = [p.brands, p.quantity].filter(Boolean).join(' · ');
  $('product-barcode').textContent = `Barcode: ${p.barcode}`;
  $('off-link').href = p.offUrl;

  const img = $('product-image');
  if (p.image) {
    img.src = p.image;
    img.alt = `Photo of ${p.name}`;
    img.hidden = false;
    img.onerror = () => { img.hidden = true; };
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }

  $('no-nutrition').hidden = p.hasNutrition;
  $('nutrition').hidden = !p.hasNutrition;
  if (p.hasNutrition) renderNutrition(p);

  show('screen-product');
}

function renderNutrition(p) {
  const { present, total } = p.completeness;
  const missing = total - present;
  const note = $('completeness');
  note.textContent = missing > 0
    ? `${missing} of ${total} key values missing from Open Food Facts.`
    : '';
  note.hidden = missing === 0;

  // Per-serving column only when Open Food Facts has per-serving values.
  $('serving-head').hidden = !p.hasServing;
  $('serving-head').textContent = p.servingSize ? `Per serving (${p.servingSize})` : 'Per serving';

  const body = $('nutrition-body');
  body.replaceChildren();
  for (const row of p.rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = row.label;
    if (row.sub) name.className = 'sub';
    tr.append(name, valueCell(row.per100, row.unit));
    if (p.hasServing) tr.append(valueCell(row.perServing, row.unit));
    body.append(tr);
  }
}

function valueCell(value, unit) {
  const td = document.createElement('td');
  if (value === null) {
    td.textContent = 'Not available';
    td.className = 'na';
  } else {
    td.textContent = `${formatNumber(value, unit)} ${unit}`;
  }
  return td;
}

function formatNumber(value, unit) {
  if (unit === 'kcal' || unit === 'mg') return String(Math.round(value));
  if (value === 0) return '0';
  if (value < 0.1) return value.toFixed(2);
  return String(Math.round(value * 10) / 10); // one decimal, e.g. 18.5 g, 5 g
}

// ---------- v0.2: timed add form and audit screen ----------
function startAdd() {
  if (currentEntry === null) return;
  openAddForm({
    entry: currentEntry,
    barcode: lastBarcode,
    onDone: (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = String(seconds % 60).padStart(2, '0');
      showMessage('Product added',
        `Saved to the audit log (#${currentEntry}). Adding it took ${m}:${s}.`, lastBarcode);
      for (const el of document.querySelectorAll('.saved-note')) el.hidden = true;
    },
    onCancel: () => show(lastScreen),
  });
  show('screen-add');
}
let lastScreen = 'screen-start';
$('message-add').addEventListener('click', () => { lastScreen = 'screen-message'; startAdd(); });
$('product-add').addEventListener('click', () => { lastScreen = 'screen-product'; startAdd(); });

$('audit-link').addEventListener('click', () => {
  currentLookup++; // a lookup still running is logged, but no longer shown
  renderAudit();
  show('screen-audit');
});
$('audit-back').addEventListener('click', () => {
  attempt = newAttempt();
  show('screen-start');
});

askToKeepData();

// ---------- "Scan another" ----------
for (const button of document.querySelectorAll('.again')) {
  button.addEventListener('click', () => {
    currentLookup++;
    $('barcode-input').value = '';
    show('screen-start');
    attempt = newAttempt();
    startCamera(lastBarcode); // straight back to scanning, one tap (FR-10)
  });
}
