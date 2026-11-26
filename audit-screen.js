// audit-screen.js — the v0.2 audit summary: figures against the go/no-go pass marks,
// CSV export, the recent scans, and "clear the log".
import {
  loadLog, clearLog, summarise, toCsv, csvFileName, localDateTime,
  ADD_TARGET_SECONDS, SMALL_SAMPLE,
} from './audit.js?v=r9';
import {
  sharedConfigured, getPasscode, savePasscode, forgetPasscode, sendWaiting, waitingCount,
} from './shared-db.js?v=r9';
import { t } from './i18n.js?v=r9';

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
    pass: ['chip pass', t('log.chip.pass')],
    below: ['chip below', t('log.chip.below')],
    none: ['chip none', t('log.chip.none')],
    manual: ['chip none', t('log.chip.manual')],
    info: ['chip none', t('log.chip.info')],
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
  small.textContent = t('log.small', { n: s.products, min: SMALL_SAMPLE });

  const ratioStatus = ({ count, of, target }) => {
    if (!of) return 'none';
    return count / of >= target ? 'pass' : 'below';
  };

  const marks = $('audit-marks');
  marks.replaceChildren(
    markCard({
      title: t('log.m1.title'),
      figure: pct(s.scanClean.count, s.scanClean.of),
      detail: t('log.m1.detail', { count: s.scanClean.count, of: s.scanClean.of }),
      target: t('log.m1.target'),
      status: ratioStatus(s.scanClean),
    }),
    markCard({
      title: t('log.m2.title'),
      figure: pct(s.covered.count, s.covered.of),
      detail: t('log.m2.detail', {
        count: s.covered.count, of: s.covered.of, off: s.covered.count - s.coveredByHand,
        hand: s.coveredByHand, free: pct(s.freeDb.count, s.freeDb.of),
      }) + (s.freeDbDiffers ? t('log.m2.differs', { n: s.freeDbDiffers }) : ''),
      target: t('log.m2.target'),
      status: ratioStatus(s.covered),
    }),
    markCard({
      title: t('log.mL.title'),
      figure: s.label.checked ? pct(s.label.matches, s.label.checked) : '',
      detail: s.label.checked || s.label.cantTell
        ? t('log.mL.detail', { matches: s.label.matches, checked: s.label.checked, cantTell: s.label.cantTell, notChecked: s.label.notChecked })
        : t('log.mL.none'),
      target: t('log.mL.target'),
      status: s.label.checked ? 'info' : 'none',
    }),
    markCard({
      title: t('log.m3.title'),
      figure: s.adds.count ? t('log.m3.figure', { t: mmss(s.adds.median) }) : '',
      detail: s.adds.count
        ? t('log.m3.detail', { under: s.adds.underTarget, count: s.adds.count, slowest: mmss(s.adds.slowest) })
        : t('log.m3.none'),
      target: t('log.m3.target'),
      status: !s.adds.count ? 'none' : s.adds.median <= ADD_TARGET_SECONDS ? 'pass' : 'below',
    }),
    markCard({
      title: t('log.m4.title'),
      figure: '',
      detail: t('log.m4.detail'),
      target: t('log.m4.target'),
      status: 'manual',
    }),
  );

  $('audit-totals').textContent = s.scans
    ? t('log.totals', {
      scans: s.scans, camera: s.byMethod.camera, photo: s.byMethod.photo, typed: s.byMethod.typed,
      products: s.products, found: s.found, withNutrition: s.withNutrition, errors: s.errors,
    })
    : '';

  renderRecent(log);
  renderShared();

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
    const method = t(`log.how.${r.method}`);
    const how = r.method === 'typed' ? method
      : r.readFirstTime ? t('log.how.firstTime', { method }) : t('log.how.tries', { method, n: r.tries });
    let outcome;
    if (r.result === 'found') {
      outcome = t('log.out.found', { p: r.valuesPresent, t: r.valuesTotal });
    } else if (r.result === 'not-found') {
      outcome = t('log.out.notFound');
    } else {
      outcome = t('log.out.error');
    }
    if (r.labelCheck) outcome += t('log.out.label', { v: t(`log.label.${r.labelCheck === 'cant-tell' ? 'cantTell' : r.labelCheck}`) });
    if (r.added) outcome += t(r.added.kind === 'correction' ? 'log.out.corrected' : 'log.out.added', { t: mmss(r.added.seconds) });
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
  exportStatus(t('log.exported', { file: file.name }));
});

$('share-button').addEventListener('click', async () => {
  const file = csvFile();
  try {
    await navigator.share({ files: [file], title: t('log.shareTitle') });
  } catch (err) {
    if (err && err.name === 'AbortError') return; // the person closed the share sheet
    exportStatus(t('log.shareFailed'));
  }
});

$('clear-button').addEventListener('click', () => {
  const count = loadLog().length;
  const ok = window.confirm(t('log.clearConfirm', { n: count }));
  if (!ok) return;
  clearLog();
  renderAudit();
});

// ---------- Shared product database (v0.4) ----------
function renderShared(message) {
  const configured = sharedConfigured();
  const hasCode = Boolean(getPasscode());
  const waiting = waitingCount();
  const waitingText = waiting ? t('log.waiting', { n: waiting }) : '';
  $('shared-status').textContent = t(!configured ? 'log.shared.notSetUp'
    : hasCode ? 'log.shared.connected' : 'log.shared.noCode') + waitingText;
  $('passcode-form').hidden = !configured || hasCode;
  $('passcode-forget').hidden = !configured || !hasCode;
  $('send-waiting').hidden = !configured || !hasCode || waiting === 0;
  $('send-waiting').textContent = t('log.sendWaiting', { n: waiting });
  const status = $('passcode-status');
  status.textContent = message || '';
  status.hidden = !message;
}

$('passcode-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('passcode-input');
  const code = input.value.trim();
  if (!code) return;
  renderShared(t('log.pc.checking'));
  const result = await savePasscode(code);
  if (result !== 'ok') {
    renderShared({
      wrong: t('log.pc.wrong'),
      offline: t('log.pc.offline'),
      storage: t('log.pc.storage'),
      'not-set-up': t('log.pc.notSetUp'),
    }[result]);
    return;
  }
  input.value = '';
  const sent = await sendWaiting();
  renderShared(sent.sent ? t('log.pc.savedSent', { n: sent.sent }) : t('log.pc.saved'));
});

$('passcode-forget').addEventListener('click', () => {
  forgetPasscode();
  renderShared(t('log.pc.removed'));
});

$('send-waiting').addEventListener('click', async () => {
  renderShared(t('log.pc.sending'));
  const r = await sendWaiting();
  const left = r.waiting ? t('log.pc.left', { n: r.waiting }) : '';
  renderShared(r.reason === 'wrong-passcode'
    ? t('log.pc.refused')
    : t(r.reason === 'offline' ? 'log.pc.partial' : 'log.pc.sent', { sent: r.sent, left }));
});
