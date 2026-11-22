// audit-screen.js — the v0.2 audit summary: figures against the go/no-go pass marks,
// CSV export, the recent scans, and "clear the log".
import {
  loadLog, clearLog, summarise, toCsv, csvFileName, localDateTime,
  ADD_TARGET_SECONDS, SMALL_SAMPLE,
} from './audit.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const pct = (count, of) => (of ? `${Math.round((count / of) * 100)}%` : '–');
const mmss = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

// status: 'pass' | 'below' | 'none' | 'manual'
function markCard({ title, figure, detail, target, status }) {
  const card = el('div', 'mark');
  const head = el('div', 'mark-head');
  head.append(el('span', 'mark-title', title));
  const chip = {
    pass: ['chip pass', 'Pass'],
    below: ['chip below', 'Below target'],
    none: ['chip none', 'No data yet'],
    manual: ['chip none', 'Checked separately'],
  }[status];
  head.append(el('span', chip[0], chip[1]));
  card.append(head);
  if (figure) card.append(el('p', 'mark-figure', figure));
  card.append(el('p', 'mark-detail', detail));
  card.append(el('p', 'mark-target', target));
  return card;
}

export function renderAudit() {
  const log = loadLog();
  const s = summarise(log);

  $('audit-empty').hidden = s.scans > 0;
  const small = $('audit-small');
  small.hidden = s.products >= SMALL_SAMPLE || s.scans === 0;
  small.textContent = `Small sample: ${s.products} different product${s.products === 1 ? '' : 's'} so far. `
    + `Treat these figures as rough until there are at least ${SMALL_SAMPLE} (the audit plan is about 100).`;

  const ratioStatus = ({ count, of, target }) => {
    if (!of) return 'none';
    return count / of >= target ? 'pass' : 'below';
  };

  const marks = $('audit-marks');
  marks.replaceChildren(
    markCard({
      title: '1. Barcodes scan cleanly',
      figure: pct(s.scanClean.count, s.scanClean.of),
      detail: `${s.scanClean.count} of ${s.scanClean.of} scans read first time by camera or photo.`,
      target: 'Target: 90% or more.',
      status: ratioStatus(s.scanClean),
    }),
    markCard({
      title: '2. Products covered with complete nutrition',
      figure: pct(s.covered.count, s.covered.of),
      detail: `${s.covered.count} of ${s.covered.of} different products have all 8 key values: `
        + `${s.freeDb.count} from Open Food Facts, ${s.coveredByHand} added by hand. `
        + `Open Food Facts alone: ${pct(s.freeDb.count, s.freeDb.of)}.`,
      target: 'Target: 90% or more, counting products added by hand.',
      status: ratioStatus(s.covered),
    }),
    markCard({
      title: '3. Add a missing product by hand',
      figure: s.adds.count ? `Typical ${mmss(s.adds.median)}` : '',
      detail: s.adds.count
        ? `${s.adds.underTarget} of ${s.adds.count} adds took 3 minutes or less. Slowest: ${mmss(s.adds.slowest)}.`
        : 'No products added yet. Use "Add this product (timed)" on a "Product not found" screen.',
      target: 'Target: 3 minutes or less (passes when the typical time is within 3 minutes).',
      status: !s.adds.count ? 'none' : s.adds.median <= ADD_TARGET_SECONDS ? 'pass' : 'below',
    }),
    markCard({
      title: '4. Data licensed for commercial use',
      figure: '',
      detail: 'Not measured by the app. Open Food Facts uses the ODbL licence, which allows commercial use with attribution and share-alike. Other sources are checked separately.',
      target: 'Target: at least one data source.',
      status: 'manual',
    }),
  );

  $('audit-totals').textContent = s.scans
    ? `${s.scans} scan${s.scans === 1 ? '' : 's'} (camera ${s.byMethod.camera}, photo ${s.byMethod.photo}, typed ${s.byMethod.typed}). `
      + `${s.products} different products: ${s.found} found, ${s.withNutrition} with some nutrition facts. `
      + `${s.errors} lookup error${s.errors === 1 ? '' : 's'} (not counted in coverage).`
    : '';

  renderRecent(log);

  $('export-button').disabled = s.scans === 0;
  $('clear-button').disabled = s.scans === 0;
  $('share-button').hidden = s.scans === 0 || !canShareFiles();
  $('export-status').hidden = true;
}

function renderRecent(log) {
  const list = $('recent-list');
  list.replaceChildren();
  for (const r of log.slice(-20).reverse()) {
    const li = el('li');
    const how = r.method === 'typed' ? 'typed' : `${r.method}, ${r.readFirstTime ? 'first time' : `${r.tries} tries`}`;
    let outcome;
    if (r.result === 'found') {
      outcome = `Found, ${r.valuesPresent} of ${r.valuesTotal} values`;
    } else if (r.result === 'not-found') {
      outcome = 'Not found';
    } else {
      outcome = 'Lookup error';
    }
    if (r.added) outcome += ` · added by hand in ${mmss(r.added.seconds)}`;
    const top = el('div', 'recent-top');
    top.append(el('span', 'mono', r.barcode), el('span', 'meta', `#${r.entry} · ${localDateTime(r.time).slice(5, 16)}`));
    li.append(top);
    const name = r.productName || r.added?.name;
    if (name) li.append(el('div', 'recent-name', name));
    li.append(el('div', 'meta', `${how} · ${outcome}`));
    list.append(li);
  }
}

// ---------- Export ----------
function csvFile() {
  const csv = toCsv(loadLog());
  return new File([csv], csvFileName(), { type: 'text/csv' });
}

function canShareFiles() {
  try {
    const probe = new File(['x'], 'x.csv', { type: 'text/csv' });
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

function exportStatus(text) {
  $('export-status').textContent = text;
  $('export-status').hidden = false;
}

$('export-button').addEventListener('click', () => {
  const file = csvFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  exportStatus(`Saved ${file.name}. On iPhone it goes to the Files app, in Downloads.`);
});

$('share-button').addEventListener('click', async () => {
  const file = csvFile();
  try {
    await navigator.share({ files: [file], title: 'Nutrition Scanner scan log' });
  } catch (err) {
    if (err && err.name === 'AbortError') return; // the person closed the share sheet
    exportStatus("Couldn't share the file. Use Download instead.");
  }
});

$('clear-button').addEventListener('click', () => {
  const count = loadLog().length;
  const ok = window.confirm(
    `Delete all ${count} scans from this phone? This can't be undone. Export the CSV first if you need it.`);
  if (!ok) return;
  clearLog();
  renderAudit();
});
