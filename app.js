// app.js — the screens. Shows one screen at a time: start, loading, product, message,
// and (v0.2) the timed add form and the audit summary.
// All product text goes in with textContent (never innerHTML), so odd data can't break the page.
import { findProduct, keepAddedProduct, sendWaiting, countScan, newCheckId, shareLabelCheck } from './shared-db.js?v=r18';
import { startScanner, scanPhoto } from './scanner.js?v=r18';
import { logScan, askToKeepData, setLabelCheck } from './audit.js?v=r18';
import { openAddForm, stopAddTimer } from './add-form.js?v=r18';
import { renderAudit } from './audit-screen.js?v=r18';
import { buildView, servingText } from './nutrition-view.js?v=r18';
import { computeScore, SCORE_TEXT } from './score.js?v=r18';
import { buildGauge, setupDropdown } from './dropdown.js?v=r18';
import { loadHistory, addToHistory, clearHistory } from './history.js?v=r18';
import { loadFavorites, isFavorite, addFavorite, removeFavorite, restoreFavorite, refreshFavorite } from './favorites.js?v=r18';
import { t, lang, locale, setLang, applyStatic } from './i18n.js?v=r18';

// Fill the page's fixed text in the chosen language (English or Thai) before anything is shown.
applyStatic();

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-start', 'screen-loading', 'screen-product', 'screen-message',
  'screen-add', 'screen-audit', 'screen-history', 'screen-favorite'];

export function show(screenId) {
  if (screenId !== 'screen-start') stopCamera(); // the camera only runs on the Scan screen
  if (screenId !== 'screen-add') stopAddTimer();
  $('toast').hidden = true; // a message from the last screen doesn't follow to the next
  for (const id of SCREENS) $(id).hidden = id !== screenId;
  document.body.dataset.screen = screenId; // the scan screen is dark (v0.3)
  updateTabbar(screenId);
  window.scrollTo(0, 0);
}

// ---------- Bottom navigation: History, Scan, Favorite ----------
// Which tab is highlighted. A result opened from History or Favorites keeps that tab highlighted.
let openedFrom = null; // 'history', 'favorite', or null for a new scan
function activeTab(screenId) {
  if (screenId === 'screen-history') return 'history';
  if (screenId === 'screen-favorite') return 'favorite';
  if (screenId === 'screen-product' && openedFrom) return openedFrom;
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

// Camera problems: the key of each title and text in strings.js (camera.<key>.title / .text).
const CAMERA_ERRORS = { denied: 'denied', 'no-camera': 'none', 'in-use': 'busy', insecure: 'insecure', unknown: 'unknown' };

// Steps to allow the camera again, in the words of this phone's browser (UX review item 6).
// iPhone Safari: the aA menu. Other iPhone browsers: the iPhone Settings app. Everything else: the lock icon.
function deniedTextKey() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return 'camera.denied.text';
  return /CriOS|FxiOS|EdgiOS|OPiOS|Line\//.test(ua) ? 'camera.denied.textIosApp' : 'camera.denied.textSafari';
}

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
      const key = CAMERA_ERRORS[kind] || CAMERA_ERRORS.unknown;
      $('camera-error-title').textContent = t(`camera.${key}.title`);
      $('camera-error-text').textContent = t(key === 'denied' ? deniedTextKey() : `camera.${key}.text`);
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
  setTorch(null);
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
  $('scan-button-text').textContent = t(state === 'starting' ? 'scan.starting' : 'scan.tap');
  clearTimeout(stallTimer);
  clearInterval(liveCheck);
  if (state === 'tap' && !stopScanner) return;
  // While a camera session is open, keep checking whether pictures are really moving.
  const startedAt = Date.now();
  liveCheck = setInterval(() => {
    if (!stopScanner) { clearInterval(liveCheck); return; }
    const live = !video.paused && video.readyState >= 2 && video.videoWidth > 0;
    const current = $('scan-button').dataset.state;
    if (live && current !== 'live') { setTapButton('live'); setTorch(cameraTrack()); }
    else if (!live && current === 'live') setTapButton('tap');
    else if (!live && current === 'starting' && (Date.now() - startedAt > 3000 || (video.srcObject && video.paused && video.readyState >= 1))) setTapButton('tap');
  }, 300);
}

// ---------- Torch (Bettr Figma S1) ----------
// Only shown when the phone's browser can switch the torch on (most Android phones; not iPhone Safari).
let torchTrack = null;
function cameraTrack() {
  const stream = video.srcObject;
  return stream && stream.getVideoTracks ? stream.getVideoTracks()[0] || null : null;
}
function setTorch(track) {
  let can = false;
  try { can = Boolean(track && track.getCapabilities && track.getCapabilities().torch); } catch { can = false; }
  torchTrack = can ? track : null;
  $('torch-button').hidden = !can;
  $('torch-button').setAttribute('aria-pressed', 'false');
}
$('torch-button').addEventListener('click', async () => {
  if (!torchTrack) return;
  const on = $('torch-button').getAttribute('aria-pressed') !== 'true';
  try {
    await torchTrack.applyConstraints({ advanced: [{ torch: on }] });
    $('torch-button').setAttribute('aria-pressed', String(on));
  } catch { setTorch(null); }
});

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
  status.textContent = t('scan.readingPhoto');
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
    status.textContent = t('scan.noBarcodeInPhoto');
  }
});
$('stop-button').addEventListener('click', stopCamera);
// Turn the camera off when the person switches app or tab.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (stopScanner) dropAutoTry(); stopCamera(); } else autoStartCamera();
});

// Camera blocked: "Try the camera again" does what a tap on the camera box does.
$('camera-retry').addEventListener('click', () => $('scan-button').click());

// ---------- Start screen: manual entry ----------
// "Type it" turns the panel into the typing panel (Bettr Figma S2); the cross turns it back.
function setTyping(on) {
  $('manual-form').hidden = !on;
  $('fallbacks').hidden = on;
  $('type-close').hidden = !on;
  $('sheet-title').textContent = t(on ? 'scan.typeTitle' : 'scan.cantScan');
  if (!on) $('manual-error').hidden = true;
}
$('type-toggle').addEventListener('click', () => {
  setTyping(true);
  $('barcode-input').focus();
});
$('type-close').addEventListener('click', () => setTyping(false));
$('manual-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('barcode-input');
  const barcode = input.value.replace(/\D/g, '');
  const error = $('manual-error');

  // EAN-8 has 8 digits, UPC-A 12, EAN-13 13, GTIN-14 14.
  if (![8, 12, 13, 14].includes(barcode.length)) {
    error.textContent = t('scan.badLength');
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
  openedFrom = null;
  const tries = Math.max(1, attempt.tries + (how.method === 'typed' ? 1 : 0));
  attempt = newAttempt(); // the next scan starts counting from zero
  $('loading-barcode').textContent = barcode;
  show('screen-loading');

  const result = await findProduct(barcode);

  // Record the scan even if the person has already moved on to another screen.
  const product = result.kind === 'found' ? result.product : null;
  if (product) {
    addToHistory(product);
    refreshFavorite(product); // a saved favorite gets the latest details
  }
  // Anonymous daily count for the dashboard. Lookup errors aren't counted. The flags say what the
  // number checks and our entries' state found about the product (nothing about the person).
  const checks = product && product.hasNutrition ? buildView(product).checks : null;
  if (product || result.kind === 'not-found') {
    const flags = [
      checks && checks.hard.length ? 'check-hard' : '',
      checks && checks.soft.length ? 'check-soft' : '',
      product && product.disputed ? 'disputed' : '',
      product && product.entryState === 'pending' ? 'pending' : '',
    ].filter(Boolean).join(',');
    countScan(barcode, product, flags);
  }
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
    // Number checks and our entries' state (27 Nov 2026), for the fix list and the store test figures.
    checks,
    entryState: product ? product.entryState || null : null,
    disputed: product ? Boolean(product.disputed) : false,
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
      showMessage(t('msg.notFound.title'), t('msg.notFound.text'), barcode);
      $('message-add').hidden = !canAdd;
      break;
    case 'timeout':
      showMessage(t('msg.timeout.title'), t('msg.timeout.text'), barcode, false, 'error');
      $('message-retry').hidden = false;
      break;
    case 'busy':
      showMessage(t('msg.busy.title'), t('msg.busy.text'), barcode, false, 'error');
      $('message-retry').hidden = false;
      break;
    default:
      showMessage(t('msg.network.title'), t('msg.network.text'), barcode, false, 'error');
      $('message-retry').hidden = false;
  }
}

function showSavedNote(entry) {
  for (const el of document.querySelectorAll('.saved-note')) {
    el.textContent = entry === null
      ? t('audit.savedNoteError')
      : t('audit.savedNote', { n: entry });
    el.classList.toggle('field-error', entry === null);
    el.hidden = false;
  }
}

// kind picks the icon: 'notfound' (a box), 'error' (no connection) or 'done' (a tick).
export function showMessage(title, text, barcode, done = false, kind = done ? 'done' : 'notfound') {
  $('message-share').hidden = true;
  if (done) { $('message-retry').hidden = true; $('message-add').hidden = true; } // nothing left to add once saved
  $('screen-message').dataset.done = String(done);
  $('screen-message').dataset.kind = kind;
  $('message-title').textContent = title;
  $('message-text').textContent = text;
  $('message-barcode').textContent = barcode ? t('common.barcode', { code: barcode }) : '';
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
  $('product-barcode').textContent = t('common.barcode', { code: p.barcode });
  renderSource(p);
  favProduct = p;
  updateFavButton();

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
    img.alt = t('result.photoOf', { name: p.name });
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
  renderScore(computeScore(view), view);
  renderGroups(view);
  renderChecks(view, p);

  show('screen-product');
}

// For testers, in the store audit box: which number checks failed (checks.js) and whether our entries
// for this product disagree (entry-state.js). Shoppers only see "Some numbers on this one look off".
function renderChecks(view, p) {
  const box = $('number-checks');
  // Each English line ends with its own full stop and Thai uses a space between sentences, so a space joins both.
  const list = (codes) => codes.map((c) => t(`check.${c}`)).join(' ');
  const lines = [];
  if (view && view.checks.hard.length) lines.push(t('audit.checksHard', { list: list(view.checks.hard) }));
  if (view && view.checks.soft.length) lines.push(t('audit.checksSoft', { list: list(view.checks.soft) }));
  if (p.disputed) lines.push(t('audit.disputed'));
  box.textContent = lines.join(' ');
  box.hidden = lines.length === 0;
}

// Where the values come from: Open Food Facts, or typed in from the pack by our testers.
function renderSource(p) {
  const ours = p.source === 'shared' || p.source === 'phone';
  $('source-off').hidden = ours;
  $('source-ours').hidden = !ours;
  if (p.offUrl) $('off-link').href = p.offUrl;
  if (!ours) return;
  const when = p.addedAt && !Number.isNaN(new Date(p.addedAt).getTime())
    ? t('attr.when', { date: dateYearFormat.format(new Date(p.addedAt)) }) : '';
  const box = $('source-ours');
  box.replaceChildren(p.source === 'shared'
    ? t('attr.shared', { when })
    : t('attr.phone', { when }));
  if (p.photoFromOff && p.offUrl) {
    const a = document.createElement('a');
    a.href = p.offUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open Food Facts';
    box.append(t('attr.photoFrom'), a, t('attr.photoAfter'));
  }
}

// result: null (nothing to judge: no score), { missing } (a key value is missing: just the note),
// or { score, verdict, tone, note }.
// The card's lower half (Nathan's mockup, 24 Nov 2026): a ring coloured by the rating with the score
// inside, then the rating tag above the quick stats. The ingredients note is a developer note at the very
// bottom of the screen; "Not enough information to score yet" takes the ring's place.
function renderScore(result, view) {
  const scored = Boolean(result && !result.missing);
  const note = result ? result.note : '';
  const devNote = note === SCORE_TEXT.unchecked;
  $('product-summary').hidden = !view;
  $('score-ring').hidden = !scored;
  $('verdict').hidden = !scored;
  $('score-label').hidden = scored || !note;
  $('score-label').textContent = scored ? '' : note;
  $('dev-note').hidden = !devNote;
  $('dev-note').textContent = devNote ? note : '';
  renderQuickStats(view);
  if (!scored) return;
  const ring = $('score-ring');
  ring.dataset.tone = result.tone;
  ring.dataset.rating = ratingOf(result); // one of the five Bettr score colours
  ring.setAttribute('role', 'img');
  ring.setAttribute('aria-label', t('score.aria', { score: result.score, verdict: t(`rating.${result.verdict}`) }));
  const verdict = $('verdict');
  verdict.textContent = t(`rating.${result.verdict}`);
  verdict.dataset.tone = result.tone;
  verdict.dataset.rating = ratingOf(result);
  $('score-number').textContent = String(result.score);
  // The ring fills from zero to the score (skipped with reduce motion, see style.css).
  ring.style.setProperty('--score', '0');
  ring.classList.remove('is-on');
  void ring.getBoundingClientRect();
  requestAnimationFrame(() => {
    ring.style.setProperty('--score', String(result.score));
    ring.classList.add('is-on');
  });
}

// The rating's name decides its colour (Great, Good, OK, Poor, Bad). Display only; score.js decides.
function ratingOf(result) { return result.verdict.toLowerCase(); }

// Calories, protein and fibre at a glance, with the same icons and amounts as the Nutrition Facts list.
// Only the ones with a value are shown, and no stats at all when none has one (Nathan, 24 Nov 2026);
// missing values are listed under "Not Available" further down.
const QUICK = [['energy', t('nut.energy')], ['protein', t('nut.protein')], ['fibre', t('nut.fibre')]];
function renderQuickStats(view) {
  const list = $('quick-stats');
  list.replaceChildren();
  const shown = view ? QUICK.map(([key, label]) => [label, view.items.find((i) => i.key === key)])
    .filter(([, item]) => item && !item.missing) : [];
  list.hidden = shown.length === 0;
  for (const [label, item] of shown) {
    const li = el('li', 'quick-stat');
    li.dataset.key = item.key;
    const icon = el('span', 'nicon');
    icon.setAttribute('aria-hidden', 'true');
    li.append(icon, el('span', 'quick-label', label), el('span', 'quick-value', item.amount));
    list.append(li);
  }
}

function renderGroups(view) {
  const box = $('groups');
  box.replaceChildren();
  if (!view) return;
  // "Per serving of 30 g (half a bag)" sits above the lists (Bettr Figma R1).
  box.append(el('p', 'basis-line', view.basisLabel));
  view.groups.forEach((group) => {
    const section = el('section', 'group');
    const head = el('div', 'group-head');
    head.append(el('h3', '', group.title));
    // Not Available (Bettr Figma R1): one card naming what's missing and why, nothing to open.
    if (group.id === 'missing') {
      const card = el('div', 'missing-card');
      card.append(el('p', 'missing-names', group.items.map((i) => i.name).join(', ')));
      const notes = [...new Set(group.items.map((i) => i.note).filter(Boolean))];
      card.append(el('p', 'missing-note', t('result.missingNote', { notes: notes.join(t('common.sentenceGap')) })));
      section.append(head, card);
      box.append(section);
      return;
    }
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
      // Every row gets the nutrient's icon in a round badge (Bettr Figma nutrient row). Watch Out and
      // Good Points tint it by level (red, orange, green); Nutrition Facts are caramel, with a small
      // green tick when they are a good point.
      const dot = el('span', 'nicon');
      if (!isFacts) dot.dataset.tone = item.tone;
      if (isFacts && item.mark === 'tick') {
        dot.classList.add('nicon-tick');
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', t('result.goodPoint'));
      } else {
        dot.setAttribute('aria-hidden', 'true');
      }
      const text = el('div', 'fact-text');
      text.append(el('span', 'fact-name', item.name), el('span', 'fact-note', item.note));
      const amount = el('span', item.pct === null ? 'fact-amount na' : 'fact-amount', item.amount);
      line.append(dot, text, amount);
      // The chevron sits at the right end of the title line, centred on it, so it is in the same spot
      // on every row, with or without a bar (Nathan, 24 Nov 2026: additive rows have no bar).
      if (hasDetails) {
        const chevron = el('span', 'chevron');
        chevron.setAttribute('aria-hidden', 'true');
        line.append(chevron);
      }
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
      if (foot.childElementCount > 0) rowHead.append(foot);
      wrap.append(rowHead);
      if (hasDetails) {
        // Dropdown: the gauge (when the row has a % of the daily guide) and one or two sentences.
        const body = el('div', 'fact-body');
        const inner = el('div', 'fact-inner');
        if (item.gauge) inner.append(buildGauge(item.gauge));
        else inner.classList.add('text-only'); // text lines up with the row title (see style.css)
        const copy = el('div', 'fact-details');
        for (const d of item.details) copy.append(el('p', '', d));
        inner.append(copy);
        body.append(inner);
        wrap.append(body);
        setupDropdown(wrap);
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
    ? t('audit.completeness', { missing, total, from: ours ? t('audit.fromLabel') : 'Open Food Facts' })
    : '';
  note.hidden = missing === 0;

  // A label typed in "per serving" has no per-100 values: don't show an empty column for them.
  const show100 = !(ours && p.basis === 'per serving');
  $('per100-head').hidden = !show100;
  // Per-serving column only when there are per-serving values.
  $('serving-head').hidden = !p.hasServing;
  $('serving-head').textContent = servingText(p.servingSize);

  const body = $('nutrition-body');
  body.replaceChildren();
  for (const row of p.rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = t(`label.${row.key === 'fiber' ? 'fibre' : row.key === 'proteins' ? 'protein' : row.key === 'energy-kcal' ? 'energy' : row.key}`);
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
    td.textContent = t('common.notAvailable');
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
let labelCheckId = null; // one shared row per product view, so editing the note updates it

function resetLabelCheck(visible) {
  labelCheck = null;
  labelCheckId = newCheckId();
  $('label-check').hidden = !visible;
  $('label-note').value = '';
  $('label-note-row').hidden = true;
  $('label-check-status').hidden = true;
  for (const b of document.querySelectorAll('.choice-btn')) b.classList.remove('selected');
}

function shareCurrentLabelCheck() {
  if (currentEntry === null || !labelCheck || !currentProduct) return;
  shareLabelCheck({
    checkId: labelCheckId,
    barcode: lastBarcode,
    verdict: labelCheck,
    note: labelCheck === 'differs' ? $('label-note').value.trim() : '',
    source: currentProduct.source,
  });
}

function saveLabelCheck() {
  if (currentEntry === null || !labelCheck) return;
  const note = labelCheck === 'differs' ? $('label-note').value.trim() || null : null;
  const ok = setLabelCheck(currentEntry, labelCheck, note);
  const status = $('label-check-status');
  status.textContent = ok
    ? (labelCheck === 'differs'
      ? t('audit.savedDiffers')
      : t('audit.saved'))
    : t('audit.notSaved');
  status.classList.toggle('field-error', !ok);
  status.hidden = false;
}

for (const button of document.querySelectorAll('.choice-btn')) {
  button.addEventListener('click', () => {
    labelCheck = button.dataset.check;
    for (const b of document.querySelectorAll('.choice-btn')) b.classList.toggle('selected', b === button);
    $('label-note-row').hidden = labelCheck !== 'differs';
    saveLabelCheck();
    shareCurrentLabelCheck();
    updateProductAdd();
  });
}
$('label-note').addEventListener('input', saveLabelCheck);
$('label-note').addEventListener('change', shareCurrentLabelCheck); // sent when the tester leaves the box

// The timed form is offered when nutrition is missing or incomplete, or differs from the label.
function updateProductAdd() {
  const p = currentProduct;
  const incomplete = p && p.completeness.present < p.completeness.total;
  $('product-add').hidden = currentEntry === null || !p || !(incomplete || labelCheck === 'differs');
  // A product found with no nutrition facts at all gets a button the shopper can see (outside Store audit).
  $('no-nutrition-add').hidden = currentEntry === null || !p || p.hasNutrition;
  $('product-add').textContent = labelCheck === 'differs'
    ? t('audit.correctTimed')
    : t('audit.addTimed');
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
      const barcode = lastBarcode;
      showMessage(t(mode === 'correction' ? 'msg.valuesSaved' : 'msg.productAdded'),
        t('msg.thanks'), barcode, true); // the time is kept in the Audit log, not shown to shoppers
      for (const el of document.querySelectorAll('.saved-note')) el.hidden = true;
      shareNote(t('msg.saving'));
      keepAddedProduct(barcode, added).then((r) => {
        if ($('screen-message').hidden || $('message-barcode').textContent !== t('common.barcode', { code: barcode })) return;
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
  shared: t('share.shared'),
  'not-set-up': t('share.notSetUp'),
  'no-passcode': t('share.noPasscode'),
  'wrong-passcode': t('share.wrongPasscode'),
  offline: t('share.offline'),
  'not-saved': t('share.notSaved'),
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

// ---------- More menu (Bettr Figma M1) ----------
function openMore() {
  $('more').hidden = false;
  $('more').querySelector('h2').setAttribute('tabindex', '-1');
  $('more').querySelector('h2').focus();
}
function closeMore() {
  $('more').hidden = true;
  for (const d of $('more').querySelectorAll('details')) d.open = false;
}
$('more-button').addEventListener('click', openMore);

// Language: EN | ไทย. The current one is pressed; picking the other reloads the app in that language.
for (const button of document.querySelectorAll('.lang-btn')) {
  button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  button.addEventListener('click', () => setLang(button.dataset.lang));
}
$('more').querySelector('[data-close]').addEventListener('click', closeMore);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('more').hidden) closeMore(); });

$('audit-link').addEventListener('click', () => {
  closeMore();
  currentLookup++; // a lookup still running is logged, but no longer shown
  renderAudit();
  show('screen-audit');
});
$('audit-back-top').addEventListener('click', () => $('audit-back').click());
$('add-back').addEventListener('click', () => $('add-cancel').click());
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
  setTyping(false);
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
      openedFrom = null;
      renderHistory();
      show('screen-history');
    } else {
      currentLookup++;
      openedFrom = null;
      renderFavorites();
      show('screen-favorite');
    }
  });
}

// ---------- History ----------
// Thai dates use Thai month names and the Thai year (e.g. 26 พ.ย. 2569).
const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
const dateYearFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
// The day heading over each group of the list (Bettr Figma H1): Today, Yesterday, or the date.
function dayText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('history.earlier');
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('history.today');
  if (d.toDateString() === yesterday.toDateString()) return t('history.yesterday');
  return dateFormat.format(d);
}

function renderHistory() {
  const items = loadHistory();
  $('history-empty').hidden = items.length > 0;
  $('history-full').hidden = items.length === 0;
  const list = $('history-list');
  list.replaceChildren();
  let day = null;
  let group = null;
  for (const item of items) {
    const p = item.product;
    const thisDay = dayText(item.savedAt);
    if (thisDay !== day) {
      day = thisDay;
      list.append(el('p', 'history-day', day));
      group = el('ul', '');
      list.append(group);
    }
    group.append(productRow(item, () => openSaved(p, 'history')));
  }
}

// One product row (Figma H1), shared by History and Favorites: photo, name, brand and time, score circle.
// options.remove adds a filled heart button at the end of the row that takes it off Favorites.
function productRow(item, onOpen, options = {}) {
  const p = item.product;
  const li = el('li', options.remove ? 'row-with-action' : '');
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
  } else {
    photo.innerHTML = '<svg width="22" height="22" aria-hidden="true"><use href="#i-image"/></svg>';
  }
  const text = el('span', 'history-text');
  text.append(el('span', 'history-name', p.name));
  const brand = p.brands ? p.brands.split(',')[0].trim() : '';
  const time = options.showTime === false ? '' : timeText(item.savedAt);
  const meta = [brand, time].filter(Boolean).join(' · ');
  if (meta) text.append(el('span', 'history-meta', meta));

  button.append(photo, text);
  const view = p.hasNutrition ? buildView(p) : null;
  const score = computeScore(view);
  if (score && !score.missing) {
    const badge = el('span', 'history-score');
    badge.dataset.rating = ratingOf(score);
    badge.setAttribute('aria-label', t('history.badge', { score: score.score, verdict: t(`rating.${score.verdict}`) }));
    badge.append(el('b', '', String(score.score)), el('small', '', t(`rating.${score.verdict}`)));
    button.append(badge);
  } else {
    // No score: say why in the meta line, so the row doesn't look broken (UX review item 14).
    const why = !p.hasNutrition ? 'history.noFacts' : score && score.flagged ? 'history.flagged' : 'history.noScore';
    text.append(el('span', 'history-meta history-noscore', t(why)));
  }
  button.addEventListener('click', onOpen);
  li.append(button);

  if (options.remove) {
    const remove = el('button', 'row-unfav');
    remove.type = 'button';
    remove.setAttribute('aria-label', t('fav.removeItem', { name: p.name }));
    remove.innerHTML = '<svg width="22" height="22" aria-hidden="true"><use href="#i-heart-fill"/></svg>';
    remove.addEventListener('click', options.remove);
    li.append(remove);
  }
  return li;
}

function timeText(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : timeFormat.format(d);
}

// Reopen a saved result (from History or Favorites). It isn't a new scan, so nothing is added to the
// audit log, and the Store audit buttons (which need a log entry) stay hidden.
function openSaved(p, from) {
  currentLookup++;
  openedFrom = from;
  lastBarcode = p.barcode;
  currentEntry = null;
  currentProduct = p;
  for (const note of document.querySelectorAll('.saved-note')) note.hidden = true;
  renderProduct(p);
  resetLabelCheck(false);
  updateProductAdd();
  $('history-note').textContent = t(from === 'favorite' ? 'audit.fromFavorites' : 'audit.fromHistory');
  $('history-note').hidden = false;
}

$('history-scan').addEventListener('click', goToScan);
$('history-clear').addEventListener('click', () => {
  if (!window.confirm(t('history.clearConfirm'))) return;
  clearHistory();
  renderHistory();
});

// ---------- Favorites (V1) ----------
// Saved on this phone only, keyed by barcode. The heart sits on the product card of the result screen.
let favProduct = null; // the product on the result screen

function updateFavButton() {
  const on = favProduct ? isFavorite(favProduct.barcode) : false;
  const button = $('fav-button');
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', t(on ? 'fav.unsave' : 'fav.save'));
}

$('fav-button').addEventListener('click', () => {
  if (!favProduct) return;
  if (isFavorite(favProduct.barcode)) {
    const removed = removeFavorite(favProduct.barcode);
    showToast(t('fav.removed'), removed ? () => { restoreFavorite(removed); updateFavButton(); } : null);
  } else if (addFavorite(favProduct)) {
    const button = $('fav-button');
    button.classList.remove('pop');
    void button.offsetWidth; // restart the little "pop" animation
    button.classList.add('pop');
    showToast(t('fav.saved'));
  } else {
    showToast(t('fav.saveError'));
  }
  updateFavButton();
});

function renderFavorites() {
  const items = loadFavorites();
  $('fav-empty').hidden = items.length > 0;
  $('fav-full').hidden = items.length === 0;
  const list = $('fav-list');
  list.replaceChildren();
  for (const item of items) {
    const p = item.product;
    list.append(productRow(item, () => openSaved(p, 'favorite'), {
      showTime: false,
      remove: () => {
        const removed = removeFavorite(p.barcode);
        renderFavorites();
        if (removed) showToast(t('fav.removed'), () => { restoreFavorite(removed); renderFavorites(); });
      },
    }));
  }
}
$('fav-scan').addEventListener('click', goToScan);

// A short message above the tab bar, with Undo when there is something to undo. Goes after 4 seconds.
let toastTimer = null;
let toastUndo = null;
function showToast(text, undo = null) {
  clearTimeout(toastTimer);
  toastUndo = undo;
  $('toast-text').textContent = text;
  $('toast-undo').hidden = !undo;
  $('toast').hidden = false;
  toastTimer = setTimeout(hideToast, 4000);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastUndo = null;
  $('toast').hidden = true;
}
$('toast-undo').addEventListener('click', () => {
  const undo = toastUndo;
  hideToast();
  if (undo) undo();
});

updateTabbar('screen-start');

// Splash (Bettr Figma A0): the wordmark shows for about a second while the app loads, then fades.
setTimeout(() => {
  const splash = $('splash');
  splash.classList.add('is-gone');
  setTimeout(() => splash.remove(), 400);
}, 900);

// Open the camera as soon as the page loads (the browser asks for permission the first time).
autoStartCamera();
