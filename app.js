// app.js — the screens. Shows one screen at a time: start, loading, product, message,
// and (v0.2) the timed add form and the audit summary.
// All product text goes in with textContent (never innerHTML), so odd data can't break the page.
import { findProduct, keepAddedProduct, sendWaiting } from './shared-db.js';
import { startScanner, scanPhoto } from './scanner.js';
import { logScan, askToKeepData, setLabelCheck } from './audit.js';
import { openAddForm, stopAddTimer } from './add-form.js';
import { renderAudit } from './audit-screen.js';
import { buildView } from './nutrition-view.js';
import { computeScore } from './score.js';
import { loadHistory, addToHistory, clearHistory } from './history.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-start', 'screen-loading', 'screen-product', 'screen-message',
  'screen-add', 'screen-audit', 'screen-history', 'screen-favorite'];

export function show(screenId) {
  if (screenId !== 'screen-start') stopCamera(); // the camera only runs on the Scan screen
  if (screenId !== 'screen-add') stopAddTimer();
  for (const id of SCREENS) $(id).hidden = id !== screenId;
  document.body.dataset.screen = screenId; // the scan screen is dark (v0.3)
  updateTabbar(screenId);
  window.scrollTo(0, 0);
}

// ---------- Bottom navigation: History, Scan, Favorite ----------
// Which tab is highlighted. A result opened from History keeps History highlighted.
let openedFromHistory = false;
function activeTab(screenId) {
  if (screenId === 'screen-history') return 'history';
  if (screenId === 'screen-favorite') return 'favorite';
  if (screenId === 'screen-product' && openedFromHistory) return 'history';
  if (screenId === 'screen-audit') return null;
  return 'scan';
}
function updateTabbar(screenId) {
  // Hidden on the timed add form, so a tap can't lose what's been typed.
  $('tabbar').hidden = screenId === 'screen-add';
  document.body.classList.toggle('has-tabbar', screenId !== 'screen-add');
  const tab = activeTab(screenId);
  for (const button of document.querySelectorAll('.tab')) {
    const on = button.dataset.tab === tab;
    button.classList.toggle('active', on);
    if (on) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
}

// ---------- Start screen: camera ----------
let stopScanner = null;
let lastBarcode = null;

// ---------- Audit: how this barcode was read ----------
// An "attempt" runs from the start screen until a barcode is read. Each camera start and each
// photo picked is one try. Read first time = read by the first try, without typing (spec FR-14).
let attempt = newAttempt();
function newAttempt() { return { tries: 0, cameraStartedAt: null, autoTry: false }; }
// v0.3: the camera starts by itself on the scan screen. That automatic start only counts as a try if
// it reads the barcode: if the person uses a photo or types instead, or the camera can't start, it
// is taken back out, so it doesn't make "read first time" look worse than it was.
function dropAutoTry() {
  if (attempt.autoTry && attempt.tries > 0) attempt.tries -= 1;
  attempt.autoTry = false;
}

const CAMERA_ERRORS = {
  denied: ['Camera access is blocked',
    'Allow the camera in your browser settings, then tap the camera box. Or type the barcode or use a photo.'],
  'no-camera': ['No camera found',
    "This browser can't use a camera here. Type the barcode or use a photo instead."],
  'in-use': ['Camera is busy',
    'Another app may be using it. Close that app and try again, or type the barcode.'],
  insecure: ['Camera needs a secure link',
    'Browsers only allow the camera on https:// pages. Open the hosted link, or type the barcode.'],
  unknown: ["Couldn't start the camera",
    'Try again, or type the barcode.'],
};

function startCamera(ignore = null, auto = false) {
  stopCamera();
  if (!auto) attempt.autoTry = false; // a tap to start again is a real retry
  $('camera-error').hidden = true;
  $('photo-status').hidden = true;
  $('camera').hidden = false;
  setTapButton('starting'); // stays over the frame until real camera pictures arrive
  $('stop-button').hidden = false;
  attempt.tries += 1;
  if (auto) attempt.autoTry = true;
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
      dropAutoTry();
      cameraFailed = true; // don't keep retrying by itself; the person can tap to try again
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
  clearTimeout(stallTimer);
  clearInterval(liveCheck);
  $('camera').hidden = true;
  setTapButton('tap');
  $('stop-button').hidden = true;
}

// The "Tap to start the camera" button sits over the frame whenever the camera isn't showing
// moving pictures: before it starts, if it fails, or if the phone stops the picture.
// Why a tap matters on iPhone: in Low Power Mode (and some other cases) Safari opens the camera but
// refuses to play the picture until the person taps. So a tap first tries to play the picture that
// is already there (this must happen right inside the tap), and only restarts the camera if there
// is none. States: 'starting' | 'tap' | 'live'.
let stallTimer = null;
let liveCheck = null;
const video = $('camera-video');

function setTapButton(state) {
  const button = $('scan-button');
  button.hidden = state === 'live';
  button.dataset.state = state;
  $('scan-button-text').textContent = state === 'starting' ? 'Starting camera…' : 'Tap to start the camera';
  clearTimeout(stallTimer);
  clearInterval(liveCheck);
  if (state === 'tap' && !stopScanner) return;
  // While a camera session is open, keep checking whether pictures are really moving.
  const startedAt = Date.now();
  liveCheck = setInterval(() => {
    if (!stopScanner) { clearInterval(liveCheck); return; }
    const live = !video.paused && video.readyState >= 2 && video.videoWidth > 0;
    const current = $('scan-button').dataset.state;
    if (live && current !== 'live') setTapButton('live');
    else if (!live && current === 'live') setTapButton('tap');
    else if (!live && current === 'starting' && (Date.now() - startedAt > 3000 || (video.srcObject && video.paused && video.readyState >= 1))) setTapButton('tap');
  }, 300);
}

$('scan-button').addEventListener('click', () => {
  cameraFailed = false;
  if (stopScanner && video.srcObject) {
    // The camera is open but its picture isn't playing: play it now, inside the tap.
    video.play().catch(() => { dropAutoTry(); startCamera(); });
    return;
  }
  dropAutoTry(); // the automatic start didn't work; this tap is the real first try
  startCamera();
});

// Start the camera by itself whenever the scan screen is showing (v0.3).
let cameraFailed = false;
export function autoStartCamera(ignore = null) {
  if ($('screen-start').hidden || stopScanner || cameraFailed || document.hidden) return;
  startCamera(ignore, true);
}

// ---------- Start screen: photo of a barcode ----------
// On phones, this offers "Take photo" or "Photo library". The photo stays on the phone:
// it is read here in the browser and never uploaded anywhere.
$('photo-input').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = ''; // so picking the same photo again still works
  if (!file) return;
  stopCamera();
  dropAutoTry();
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (stopScanner) dropAutoTry(); stopCamera(); } else autoStartCamera();
});

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
  stopCamera();
  dropAutoTry();
  handleBarcode(barcode, { method: 'typed' });
});

// ---------- Lookup ----------
let currentLookup = 0;

let lastHow = { method: 'typed' }; // how the last barcode was read, reused by "Try again"
let currentEntry = null; // audit log entry number of the product on screen
let currentProduct = null; // the found product on screen, if any

export async function handleBarcode(barcode, how = { method: 'typed' }) {
  const lookupId = ++currentLookup;
  lastBarcode = barcode;
  lastHow = how;
  openedFromHistory = false;
  const tries = Math.max(1, attempt.tries + (how.method === 'typed' ? 1 : 0));
  attempt = newAttempt(); // the next scan starts counting from zero
  $('loading-barcode').textContent = barcode;
  show('screen-loading');

  const result = await findProduct(barcode);

  // Record the scan even if the person has already moved on to another screen.
  const product = result.kind === 'found' ? result.product : null;
  if (product) addToHistory(product);
  const entry = logScan({
    barcode,
    method: how.method,
    tries,
    readSeconds: how.readSeconds,
    result: product ? 'found' : result.kind === 'not-found' ? 'not-found' : 'error',
    errorKind: product || result.kind === 'not-found' ? null : result.kind,
    productName: product ? product.name : null,
    source: product ? product.source : null,
    offComplete: product ? (product.source === 'off' ? product.completeness.present === product.completeness.total : product.offComplete) : null,
    valuesPresent: product ? product.completeness.present : null,
    valuesTotal: product ? product.completeness.total : null,
  });

  if (lookupId !== currentLookup) return; // the person already moved on
  currentEntry = entry;
  $('history-note').hidden = true;
  showSavedNote(entry);

  const canAdd = entry !== null;
  $('message-add').hidden = true;
  $('message-retry').hidden = true;
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
      showMessage('This is taking too long',
        'The connection is slow right now. Please try again in a moment.', barcode);
      $('message-retry').hidden = false;
      break;
    case 'busy':
      showMessage('Too many lookups right now',
        'The product database is busy. Wait a minute, then try again.', barcode);
      $('message-retry').hidden = false;
      break;
    default:
      showMessage('No internet connection',
        'Check your mobile data or wifi, then try again.', barcode);
      $('message-retry').hidden = false;
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
  $('message-share').hidden = true;
  if (done) $('message-retry').hidden = true;
  $('screen-message').dataset.done = String(done); // a success message hides the "search" icon
  $('message-title').textContent = title;
  $('message-text').textContent = text;
  $('message-barcode').textContent = barcode ? `Barcode ${barcode}` : '';
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
  $('product-barcode').textContent = `Barcode ${p.barcode}`;
  renderSource(p);

  // The photo fills the whole frame; the grey placeholder only shows when there is no photo or it
  // fails to load. Handlers are set before the new src, and a late error from the previous product's
  // photo is ignored, so the placeholder never appears beside a photo. The placeholder is an <svg>,
  // which has no .hidden property, so the hidden attribute is set directly.
  const img = $('product-image');
  const placeholder = $('product-image-placeholder');
  img.onload = null;
  img.onerror = null;
  if (p.image) {
    const src = p.image;
    img.onload = () => placeholder.toggleAttribute('hidden', true);
    img.onerror = () => {
      if (img.getAttribute('src') !== src) return;
      img.hidden = true;
      placeholder.toggleAttribute('hidden', false);
    };
    img.alt = `Photo of ${p.name}`;
    img.hidden = false;
    img.src = src;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
  }
  placeholder.toggleAttribute('hidden', Boolean(p.image));

  $('no-nutrition').hidden = p.hasNutrition;
  $('nutrition').hidden = !p.hasNutrition;
  if (p.hasNutrition) renderNutrition(p);
  $('audit-box').open = false;

  // Shopper view: the score (approved 24 Nov 2026), Watch out / Good points and the Nutrition facts list.
  const view = p.hasNutrition ? buildView(p) : null;
  renderScore(computeScore(view));
  renderGroups(view);

  show('screen-product');
}

// Where the values come from: Open Food Facts, or typed in from the pack by our testers.
function renderSource(p) {
  const ours = p.source === 'shared' || p.source === 'phone';
  $('source-off').hidden = ours;
  $('source-ours').hidden = !ours;
  if (p.offUrl) $('off-link').href = p.offUrl;
  if (!ours) return;
  const when = p.addedAt && !Number.isNaN(new Date(p.addedAt).getTime())
    ? ` on ${dateFormat.format(new Date(p.addedAt))} ${new Date(p.addedAt).getFullYear()}` : '';
  const box = $('source-ours');
  box.replaceChildren(p.source === 'shared'
    ? `Nutrition facts typed in from the pack by Nutrition Scanner testers${when}.`
    : `Nutrition facts typed in from the pack on this phone${when} (not in the shared database yet).`);
  if (p.photoFromOff && p.offUrl) {
    const a = document.createElement('a');
    a.href = p.offUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open Food Facts';
    box.append(' Photo from ', a, ' (ODbL).');
  }
}

// result: null (nothing to judge: no score line), { missing } (a key value is missing: just the note),
// or { score, verdict, tone, note }.
function renderScore(result) {
  const scored = Boolean(result && !result.missing);
  $('score-row').hidden = !scored;
  // Only a note that carries information is shown (no ingredients, or not enough to score).
  $('score-label').hidden = !result || !result.note;
  if (!result) return;
  $('score-label').textContent = result.note;
  if (!scored) return;
  const verdict = $('verdict');
  verdict.textContent = result.verdict;
  verdict.dataset.tone = result.tone;
  $('score-dot').dataset.tone = result.tone;
  $('score-number').textContent = String(result.score);
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
    const isFacts = group.id === 'facts';
    const card = el('ul', isFacts ? 'group-card facts-card' : 'group-card');
    for (const item of group.items) {
      const li = el('li', 'fact');
      li.dataset.key = item.key;
      // With details: the row is a <details> dropdown (closed by default); tapping it shows the reasons.
      const hasDetails = item.details && item.details.length > 0;
      const wrap = hasDetails ? el('details', 'fact-drop') : li;
      const rowHead = hasDetails ? el('summary', 'fact-head') : el('div', 'fact-head');
      const line = el('div', 'fact-line');
      // Nutrition facts rows get an icon in the nutrient's own colour (Nathan, 24 Nov 2026), with a
      // small green tick when they are a good point. Watch out and Good points keep their status dot.
      let dot;
      if (isFacts) {
        dot = el('span', 'nicon');
        if (item.mark === 'tick') {
          dot.classList.add('nicon-tick');
          dot.setAttribute('role', 'img');
          dot.setAttribute('aria-label', 'Good point');
        } else {
          dot.setAttribute('aria-hidden', 'true');
        }
      } else {
        dot = el('span', 'dot');
        dot.dataset.tone = item.tone;
      }
      const text = el('div', 'fact-text');
      text.append(el('span', 'fact-name', item.name), el('span', 'fact-note', item.note));
      const amount = el('span', item.pct === null ? 'fact-amount na' : 'fact-amount', item.amount);
      line.append(dot, text, amount);
      rowHead.append(line);
      const foot = el('div', 'fact-foot');
      if (item.pct !== null) {
        const bar = el('div', 'bar');
        const fill = el('span', '');
        fill.dataset.tone = item.tone;
        fill.style.width = `${Math.max(2, Math.min(100, item.pct))}%`;
        bar.append(fill);
        foot.append(bar);
      }
      if (hasDetails) {
        const chevron = el('span', 'chevron');
        chevron.setAttribute('aria-hidden', 'true');
        foot.append(chevron);
      }
      if (foot.childElementCount > 0) rowHead.append(foot);
      wrap.append(rowHead);
      if (hasDetails) {
        const more = el('ul', 'fact-details');
        for (const d of item.details) more.append(el('li', '', d));
        wrap.append(more);
        li.append(wrap);
      }
      card.append(li);
    }
    if (group.hint) section.append(head, el('p', 'group-hint', group.hint), card);
    else section.append(head, card);
    box.append(section);
  });
  // Flavour enhancers such as MSG: one plain line, no points off (24 Nov 2026).
  if (view.infoLine) box.append(el('p', 'group-hint info-line', view.infoLine));
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
  const ours = p.source === 'shared' || p.source === 'phone';
  note.textContent = missing > 0
    ? `${missing} of ${total} key values missing from ${ours ? 'the values typed in from the label' : 'Open Food Facts'}.`
    : '';
  note.hidden = missing === 0;

  // A label typed in "per serving" has no per-100 values: don't show an empty column for them.
  const show100 = !(ours && p.basis === 'per serving');
  $('per100-head').hidden = !show100;
  // Per-serving column only when there are per-serving values.
  $('serving-head').hidden = !p.hasServing;
  $('serving-head').textContent = p.servingSize ? `Per serving (${p.servingSize})` : 'Per serving';

  const body = $('nutrition-body');
  body.replaceChildren();
  for (const row of p.rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = row.label;
    if (row.sub) name.className = 'sub';
    tr.append(name);
    if (show100) tr.append(valueCell(row.per100, row.unit, row.lessThan));
    if (p.hasServing) tr.append(valueCell(row.perServing, row.unit, row.lessThan));
    body.append(tr);
  }
}

function valueCell(value, unit, lessThan = false) {
  const td = document.createElement('td');
  if (value === null) {
    td.textContent = 'Not available';
    td.className = 'na';
  } else {
    td.textContent = `${lessThan ? '<' : ''}${formatNumber(value, unit)} ${unit}`;
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
  // A product found with no nutrition facts at all gets a button the shopper can see (outside Store audit).
  $('no-nutrition-add').hidden = currentEntry === null || !p || p.hasNutrition;
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
    onDone: (seconds, added) => {
      const m = Math.floor(seconds / 60);
      const s = String(seconds % 60).padStart(2, '0');
      const barcode = lastBarcode;
      showMessage(mode === 'correction' ? 'Values saved' : 'Product added',
        `Saved to the audit log (#${currentEntry}). It took ${m}:${s}.`, barcode, true);
      for (const el of document.querySelectorAll('.saved-note')) el.hidden = true;
      shareNote('Saving the product…');
      keepAddedProduct(barcode, added).then((r) => {
        if ($('screen-message').hidden || $('message-barcode').textContent !== `Barcode ${barcode}`) return;
        shareNote(SHARE_TEXT[r.status === 'shared' ? 'shared' : r.status === 'not-saved' ? 'not-saved' : r.reason]
          || SHARE_TEXT.offline, r.status === 'shared');
      });
    },
    onCancel: () => show(lastScreen),
  });
  show('screen-add');
}
// What happened to a product typed in from the label (shown under "Product added").
const SHARE_TEXT = {
  shared: 'Added to the shared database. Anyone who scans this barcode now sees these values.',
  'not-set-up': 'Saved on this phone. Scanning this barcode here shows these values. The shared database isn’t set up yet.',
  'no-passcode': 'Saved on this phone only. To share it with everyone, enter the contributor passcode on the Audit log screen and it is sent then.',
  'wrong-passcode': 'Saved on this phone only, because the contributor passcode was refused. Enter it again on the Audit log screen and it is sent then.',
  offline: 'Saved on this phone only, because the shared database couldn’t be reached. It is sent automatically next time the app opens with internet.',
  'not-saved': 'This phone couldn’t keep a copy of the product (storage full or blocked). It is still in the audit log.',
};
function shareNote(text, ok = false) {
  const note = $('message-share');
  note.textContent = text;
  note.dataset.tone = ok ? 'ok' : '';
  note.hidden = false;
}

let lastScreen = 'screen-start';
$('message-add').addEventListener('click', () => { lastScreen = 'screen-message'; startAdd('new'); });
$('product-add').addEventListener('click', () => { lastScreen = 'screen-product'; startAdd('correction'); });
$('no-nutrition-add').addEventListener('click', () => { lastScreen = 'screen-product'; startAdd('correction'); });
$('message-retry').addEventListener('click', () => { if (lastBarcode) handleBarcode(lastBarcode, lastHow); });

$('audit-link').addEventListener('click', () => {
  currentLookup++; // a lookup still running is logged, but no longer shown
  renderAudit();
  show('screen-audit');
});
$('audit-back').addEventListener('click', () => {
  attempt = newAttempt();
  show('screen-start');
  autoStartCamera();
});

askToKeepData();
sendWaiting(); // products added while offline (or before the passcode was entered) go up now

// ---------- "Scan another" ----------
function goToScan() {
  currentLookup++;
  $('barcode-input').value = '';
  $('manual-form').hidden = true;
  $('type-toggle').hidden = false;
  show('screen-start');
  attempt = newAttempt();
  cameraFailed = false;
  startCamera(lastBarcode, true); // straight back to scanning, one tap (FR-10)
}
for (const button of document.querySelectorAll('.again')) button.addEventListener('click', goToScan);

// ---------- Tabs ----------
for (const button of document.querySelectorAll('.tab')) {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab;
    if (tab === 'scan') {
      if (!$('screen-start').hidden) return; // already scanning
      goToScan();
    } else if (tab === 'history') {
      currentLookup++; // a lookup still running is logged and saved, but no longer shown
      openedFromHistory = false;
      renderHistory();
      show('screen-history');
    } else {
      currentLookup++;
      show('screen-favorite');
    }
  });
}

// ---------- History ----------
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
function whenText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const day = sameDay(d, today) ? 'Today' : sameDay(d, yesterday) ? 'Yesterday' : dateFormat.format(d);
  return `${day}, ${timeFormat.format(d)}`;
}

function renderHistory() {
  const items = loadHistory();
  $('history-empty').hidden = items.length > 0;
  $('history-full').hidden = items.length === 0;
  const list = $('history-list');
  list.replaceChildren();
  for (const item of items) {
    const p = item.product;
    const li = el('li', '');
    const button = el('button', 'history-item');
    button.type = 'button';

    const photo = el('span', 'history-photo');
    if (p.image) {
      const img = document.createElement('img');
      img.src = p.image;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      photo.append(img);
    }
    const text = el('span', 'history-text');
    text.append(el('span', 'history-name', p.name));
    const brand = p.brands ? p.brands.split(',')[0].trim() : '';
    text.append(el('span', 'history-meta', [brand, whenText(item.savedAt)].filter(Boolean).join(' · ')));

    button.append(photo, text);
    const view = p.hasNutrition ? buildView(p) : null;
    const score = computeScore(view);
    if (score && !score.missing) {
      const badge = el('span', 'history-score');
      const dot = el('span', 'dot');
      dot.dataset.tone = score.tone;
      badge.append(dot, el('b', '', String(score.score)));
      button.append(badge);
    }
    button.addEventListener('click', () => openFromHistory(p));
    li.append(button);
    list.append(li);
  }
}

// Reopen a saved result. It isn't a new scan, so nothing is added to the audit log, and the
// Store audit buttons (which need a log entry) stay hidden.
function openFromHistory(p) {
  currentLookup++;
  openedFromHistory = true;
  lastBarcode = p.barcode;
  currentEntry = null;
  currentProduct = p;
  for (const note of document.querySelectorAll('.saved-note')) note.hidden = true;
  renderProduct(p);
  resetLabelCheck(false);
  updateProductAdd();
  $('history-note').hidden = false;
}

$('history-scan').addEventListener('click', goToScan);
$('history-clear').addEventListener('click', () => {
  if (!window.confirm('Clear your scan history on this phone? The audit log is kept.')) return;
  clearHistory();
  renderHistory();
});

updateTabbar('screen-start');

// Open the camera as soon as the page loads (the browser asks for permission the first time).
autoStartCamera();
