// app.js — the screens. Shows one screen at a time: start, loading, product, message,
// and (v0.2) the timed add form and the audit summary.
// All product text goes in with textContent (never innerHTML), so odd data can't break the page.
import { lookupProduct } from './lookup.js';
import { startScanner, scanPhoto } from './scanner.js';
import { logScan, askToKeepData, setLabelCheck } from './audit.js';
import { openAddForm, stopAddTimer } from './add-form.js';
import { renderAudit } from './audit-screen.js';
import { buildView } from './nutrition-view.js';
import { sampleScore, SCORE_LABEL } from './score-placeholder.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-start', 'screen-loading', 'screen-product', 'screen-message',
  'screen-add', 'screen-audit'];

export function show(screenId) {
  if (screenId !== 'screen-start') stopCamera();
  if (screenId !== 'screen-add') stopAddTimer();
  for (const id of SCREENS) $(id).hidden = id !== screenId;
  document.body.dataset.screen = screenId; // the scan screen is dark (v0.3)
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
$('type-toggle').addEventListener('click', () => {
  $('type-toggle').hidden = true;
  $('manual-form').hidden = false;
  $('barcode-input').focus();
});
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
let currentProduct = null; // the found product on screen, if any

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
      currentProduct = result.product;
      renderProduct(result.product);
      resetLabelCheck(canAdd && result.product.hasNutrition);
      updateProductAdd();
      break;
    case 'not-found':
      showMessage('We don’t have this product yet',
        "This barcode isn't in our database yet. You can add it from the nutrition label on the pack.", barcode);
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

export function showMessage(title, text, barcode, done = false) {
  $('screen-message').dataset.done = String(done); // a success message hides the "search" icon
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
  const brand = p.brands ? p.brands.split(',')[0].trim() : '';
  $('product-brand').textContent = brand;
  $('product-brand').hidden = !brand;
  $('product-meta').textContent = p.quantity || '';
  $('product-meta').hidden = !p.quantity;
  $('product-barcode').textContent = `Barcode: ${p.barcode}`;
  $('off-link').href = p.offUrl;

  const img = $('product-image');
  if (p.image) {
    img.src = p.image;
    img.alt = `Photo of ${p.name}`;
    img.hidden = false;
    img.onerror = () => { img.hidden = true; $('product-image-placeholder').hidden = false; };
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
  $('product-image-placeholder').hidden = Boolean(p.image);

  $('no-nutrition').hidden = p.hasNutrition;
  $('nutrition').hidden = !p.hasNutrition;
  if (p.hasNutrition) renderNutrition(p);
  $('audit-box').open = false;

  // v0.3 shopper view: sample score and the Watch out / Good points groups.
  const view = p.hasNutrition ? buildView(p) : null;
  renderScore(view ? sampleScore(view) : null);
  renderGroups(view);

  show('screen-product');
}

function renderScore(result) {
  $('score-row').hidden = !result;
  $('score-label').hidden = !result;
  if (!result) return;
  const verdict = $('verdict');
  verdict.textContent = result.verdict;
  verdict.dataset.tone = result.tone;
  $('score-dot').dataset.tone = result.tone;
  $('score-number').textContent = String(result.score);
  $('score-label').textContent = SCORE_LABEL;
}

function renderGroups(view) {
  const box = $('groups');
  box.replaceChildren();
  if (!view) return;
  view.groups.forEach((group, index) => {
    const section = el('section', 'group');
    const head = el('div', 'group-head');
    head.append(el('h3', '', group.title));
    if (index === 0) head.append(el('span', 'basis', view.basisLabel));
    const card = el('ul', 'group-card');
    for (const item of group.items) {
      const li = el('li', 'fact');
      const line = el('div', 'fact-line');
      const dot = el('span', 'dot');
      dot.dataset.tone = item.tone;
      const text = el('div', 'fact-text');
      text.append(el('span', 'fact-name', item.name), el('span', 'fact-note', item.note));
      text.lastChild.dataset.tone = item.tone;
      const amount = el('span', item.pct === null ? 'fact-amount na' : 'fact-amount', item.amount);
      line.append(dot, text, amount);
      li.append(line);
      if (item.pct !== null) {
        const bar = el('div', 'bar');
        const fill = el('span', '');
        fill.dataset.tone = item.tone;
        fill.style.width = `${Math.max(2, Math.min(100, item.pct))}%`;
        bar.append(fill);
        li.append(bar);
      }
      card.append(li);
    }
    section.append(head, card);
    box.append(section);
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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

// ---------- v0.2: "does this match the label?" ----------
// Open Food Facts data can be out of date (old recipe, different size or flavour under the same
// barcode), so the tester compares it with the pack in their hand.
let labelCheck = null;

function resetLabelCheck(visible) {
  labelCheck = null;
  $('label-check').hidden = !visible;
  $('label-note').value = '';
  $('label-note-row').hidden = true;
  $('label-check-status').hidden = true;
  for (const b of document.querySelectorAll('.choice-btn')) b.classList.remove('selected');
}

function saveLabelCheck() {
  if (currentEntry === null || !labelCheck) return;
  const note = labelCheck === 'differs' ? $('label-note').value.trim() || null : null;
  const ok = setLabelCheck(currentEntry, labelCheck, note);
  const status = $('label-check-status');
  status.textContent = ok
    ? (labelCheck === 'differs'
      ? 'Saved. This product won\'t count as covered unless you type in the label\'s values below.'
      : 'Saved to the audit log.')
    : "Couldn't save this to the audit log.";
  status.classList.toggle('field-error', !ok);
  status.hidden = false;
}

for (const button of document.querySelectorAll('.choice-btn')) {
  button.addEventListener('click', () => {
    labelCheck = button.dataset.check;
    for (const b of document.querySelectorAll('.choice-btn')) b.classList.toggle('selected', b === button);
    $('label-note-row').hidden = labelCheck !== 'differs';
    saveLabelCheck();
    updateProductAdd();
  });
}
$('label-note').addEventListener('input', saveLabelCheck);

// The timed form is offered when nutrition is missing or incomplete, or differs from the label.
function updateProductAdd() {
  const p = currentProduct;
  const incomplete = p && p.completeness.present < p.completeness.total;
  $('product-add').hidden = currentEntry === null || !p || !(incomplete || labelCheck === 'differs');
  $('product-add').textContent = labelCheck === 'differs'
    ? 'Correct the values from the label (timed)'
    : 'Add the nutrition facts from the label (timed)';
}

// ---------- v0.2: timed add form and audit screen ----------
function startAdd(mode) {
  if (currentEntry === null) return;
  openAddForm({
    entry: currentEntry,
    barcode: lastBarcode,
    mode,
    name: mode === 'correction' && currentProduct ? currentProduct.name : '',
    onDone: (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = String(seconds % 60).padStart(2, '0');
      showMessage(mode === 'correction' ? 'Values saved' : 'Product added',
        `Saved to the audit log (#${currentEntry}). It took ${m}:${s}.`, lastBarcode, true);
      for (const el of document.querySelectorAll('.saved-note')) el.hidden = true;
    },
    onCancel: () => show(lastScreen),
  });
  show('screen-add');
}
let lastScreen = 'screen-start';
$('message-add').addEventListener('click', () => { lastScreen = 'screen-message'; startAdd('new'); });
$('product-add').addEventListener('click', () => { lastScreen = 'screen-product'; startAdd('correction'); });

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
    $('manual-form').hidden = true;
    $('type-toggle').hidden = false;
    show('screen-start');
    attempt = newAttempt();
    startCamera(lastBarcode); // straight back to scanning, one tap (FR-10)
  });
}
