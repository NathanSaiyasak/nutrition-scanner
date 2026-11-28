// dashboard.js — the Bettr operations dashboard (27 Nov 2026).
//
// One call to dashboard_data() in Supabase (supabase/dashboard.sql) returns every number. The call
// needs a passcode; the tables behind it stay closed to the public.
//
// HOW TO ADD A PANEL: add one object to PANELS below. Give it a section, a size ('tile' = one column,
// 'wide' = two, 'full' = the whole row), a title and a render(data) function that returns HTML. A
// panel that is not built yet gets `planned: 'what it will show and what it needs'` instead of render,
// and shows as a dashed box with no numbers. New sections go in SECTIONS.
import { SHARED_DB_URL, SHARED_DB_KEY } from './config.js?v=r20';

const SESSION_KEY = 'bettr-dashboard-passcode'; // this browser tab only, gone when it is closed
const CONTRIBUTOR_KEY = 'nutrition-scanner-contributor-passcode'; // saved by the app's Audit log
const GOAL = 0.9; // go/no-go: at least 90% coverage

const SECTIONS = [
  { id: 'coverage', title: 'Coverage', note: 'Are shoppers finding full nutrition facts?' },
  { id: 'usage', title: 'Usage', note: 'How much the app is used' },
  { id: 'fix', title: 'Fix list', note: 'What to add or check next, most scanned first' },
  { id: 'data', title: 'Data quality', note: 'What shoppers saw, and our own database' },
  { id: 'security', title: 'Security and activity', note: 'Who is writing, and wrong passcodes' },
  { id: 'performance', title: 'Performance', note: 'Speed and errors' },
];

const REASONS = {
  'not-found': { label: 'Not found', tone: 'bad', hint: 'Nobody has this barcode. Add it from the pack.' },
  'no-nutrition': { label: 'No facts', tone: 'bad', hint: 'Found, but no nutrition facts at all.' },
  'needs-check': { label: 'Failed check', tone: 'bad', hint: 'A number check failed, so it gets no score.' },
  differs: { label: 'Differs', tone: 'bad', hint: 'A tester said the values differ from the pack.' },
  disputed: { label: 'Disagree', tone: 'warn', hint: 'Two of our entries disagree.' },
  incomplete: { label: 'Incomplete', tone: 'warn', hint: 'Some values are missing.' },
  pending: { label: 'Pending', tone: 'info', hint: 'Our entry waits for a second check.' },
  unverified: { label: 'Unverified', tone: 'info', hint: 'From Open Food Facts, never compared with the pack.' },
};
const OUTCOMES = [
  ['pack', 'Typed from the pack', 'var(--good)'],
  ['off-complete', 'Open Food Facts, complete', '#7DB24A'],
  ['incomplete', 'Incomplete', '#E8A23A'],
  ['no-nutrition', 'No facts', '#E2703A'],
  ['not-found', 'Not found', 'var(--bad)'],
];
const MISSING_WORDS = {
  energy: 'calories', fat: 'fat', saturated_fat: 'saturated fat', carbs: 'carbs', sugars: 'sugars',
  fibre: 'fibre', protein: 'protein', salt: 'sodium',
};

const PANELS = [
  // ---------- Coverage ----------
  { id: 'scan-coverage', section: 'coverage', size: 'tile', title: 'Scan coverage', render: (d) => {
    if (!d.scans) return empty('No scans counted in this period yet.');
    const share = d.covered_scans / d.scans;
    return `${big(pct(share))}${meter(share)}
      <p class="sub">${num(d.covered_scans)} of ${num(d.scans)} scans showed complete facts. Goal ${pct(GOAL)}.</p>`;
  } },
  { id: 'product-coverage', section: 'coverage', size: 'tile', title: 'Products covered now', render: (d) => {
    if (!d.barcodes) return empty('No barcodes scanned in this period yet.');
    const share = d.barcodes_covered / d.barcodes;
    return `${big(pct(share))}${meter(share)}
      <p class="sub">${num(d.barcodes_covered)} of ${num(d.barcodes)} different barcodes scanned, counting what we have added since.</p>`;
  } },
  { id: 'fixed-since', section: 'coverage', size: 'tile', title: 'Fixed since scanned', render: (d) => `
      ${big(num(d.fixed_since))}
      <p class="sub">Barcodes that were missing or incomplete when scanned and now have an entry typed from the pack.</p>` },
  { id: 'store-test', section: 'coverage', size: 'tile', title: 'Store test coverage (go/no-go)',
    planned: 'The official 90% figure, from the store test audit CSV. Shown here once the store test has run and its results are uploaded.' },

  // ---------- Usage ----------
  { id: 'scans-total', section: 'usage', size: 'tile', title: 'Scans', render: (d) => {
    const today = d.per_day.length ? d.per_day[d.per_day.length - 1] : null;
    const todayTotal = today ? today.shoppers + (d.testers_included ? today.testers : 0) : 0;
    return `${big(num(d.scans))}<p class="sub">In ${d.days} days. <b>${num(todayTotal)}</b> today.</p>`;
  } },
  { id: 'barcodes', section: 'usage', size: 'tile', title: 'Different barcodes', render: (d) => `
      ${big(num(d.barcodes))}<p class="sub">Scanned at least once in ${d.days} days.</p>` },
  { id: 'scans-per-day', section: 'usage', size: 'wide', title: 'Scans per day', render: (d) => {
    const series = [{ key: 'shoppers', label: 'Shoppers', color: 'var(--caramel)' }];
    if (d.testers_included) series.push({ key: 'testers', label: 'Testers', color: 'var(--blue)' });
    return barChart(d.per_day, series) + legend(series);
  } },

  // ---------- Fix list ----------
  { id: 'fix-list', section: 'fix', size: 'full', title: '', render: (d) => fixList(d) },

  // ---------- Data quality ----------
  { id: 'outcomes', section: 'data', size: 'wide', title: 'What shoppers saw', render: (d) => {
    const total = Object.values(d.outcomes || {}).reduce((a, b) => a + b, 0);
    if (!total) return empty('No scans counted in this period yet.');
    const parts = OUTCOMES.filter(([k]) => d.outcomes[k]).map(([k, label, color]) => ({ k, label, color, n: d.outcomes[k] }));
    return `<div class="stack" role="img" aria-label="Share of scans by result">${parts.map((p) =>
      `<span style="width:${(p.n / total) * 100}%;background:${p.color}" title="${esc(p.label)} ${num(p.n)}"></span>`).join('')}</div>
      <ul class="legend">${parts.map((p) => `<li><i style="background:${p.color}"></i>${esc(p.label)} <b>${pct(p.n / total)}</b> (${num(p.n)})</li>`).join('')}</ul>`;
  } },
  { id: 'our-db', section: 'data', size: 'tile', title: 'Our product database', render: (d) => `
      ${big(num(d.products_barcodes))}
      <p class="sub">Barcodes typed from the pack (${num(d.products_total)} ${d.products_total === 1 ? 'entry' : 'entries'}, counting corrections). ${num(d.label_checks_total)} label checks by testers.</p>` },
  { id: 'number-checks', section: 'data', size: 'tile', title: 'Failed number checks', render: (d) => `
      ${big(num((d.reasons || {})['needs-check'] || 0))}
      <p class="sub">Barcodes scanned in ${d.days} days whose values failed a hard check (sugar above carbs and the like).</p>` },

  // ---------- Security and activity ----------
  { id: 'writes', section: 'security', size: 'wide', title: 'Writes per day', render: (d) => {
    const series = [
      { key: 'products', label: 'Products added or corrected', color: 'var(--coffee)' },
      { key: 'label_checks', label: 'Label checks', color: 'var(--blue)' },
    ];
    return barChart(d.writes, series) + legend(series);
  } },
  { id: 'wrong-passcodes', section: 'security', size: 'tile', title: 'Wrong passcodes, last 24 hours', render: (d) => {
    const s = d.security;
    const n = s.wrong_audit_24h + s.wrong_dashboard_24h;
    return `${big(num(n), n >= 10 ? 'goal-bad' : '')}
      <p class="sub">${num(s.wrong_audit_24h)} on the Audit log, ${num(s.wrong_dashboard_24h)} on this dashboard. ${num(s.wrong_window)} in ${d.days} days.${s.last_wrong ? ` Last ${when(s.last_wrong)}.` : ''}</p>
      <p class="sub">After 20 in 10 minutes the dashboard locks for a while.</p>`;
  } },
  { id: 'access', section: 'security', size: 'tile', title: 'Dashboard access', render: (d) => `
      ${big(d.security.separate_dashboard_passcode ? 'Own passcode' : 'Shared passcode', '', true)}
      <p class="sub">${d.security.separate_dashboard_passcode
        ? 'The dashboard has its own passcode, separate from the testers’ one.'
        : 'Anyone with the contributor passcode can open this page. A separate dashboard passcode can be set in Supabase (see dashboard.sql).'}</p>` },
  { id: 'sign-ins', section: 'security', size: 'tile', title: 'Who changed what',
    planned: 'A log of which person added or changed each product. Needs contributor sign-in, which is not decided yet.' },
  { id: 'usage-limits', section: 'security', size: 'tile', title: 'Free plan limits',
    planned: 'Database size and monthly traffic against the Supabase free plan (500 MB, 5 GB). Needs a read-only link to Supabase usage.' },
  { id: 'ai-reads', section: 'security', size: 'tile', title: 'AI label reads and spend',
    planned: 'Reads per day and cost against the daily budget, once the label reader is approved and built.' },

  // ---------- Performance ----------
  { id: 'lookup-errors', section: 'performance', size: 'tile', title: 'Lookup errors',
    planned: 'Share of lookups that failed (no internet, timeout, busy). Needs the app to count failed lookups, a small change.' },
  { id: 'lookup-speed', section: 'performance', size: 'tile', title: 'Lookup speed',
    planned: 'How long a lookup takes, typical and slowest. Needs the app to send a rounded time with each count.' },
  { id: 'off-health', section: 'performance', size: 'tile', title: 'Open Food Facts availability',
    planned: 'Whether Open Food Facts answered, per day. Comes with the lookup errors count.' },
  { id: 'scan-reads', section: 'performance', size: 'tile', title: 'Barcodes read first time',
    planned: 'Share of barcodes the camera read on the first try (go/no-go needs 90%). Today only on each phone’s Audit log.' },
];

// ---------- Fix list ----------
let fixFilter = 'all';
let lastData = null;

function fixList(d) {
  const rows = d.fix_list || [];
  if (!rows.length) return empty('Nothing to fix among the barcodes scanned in this period.');
  const counts = d.reasons || {};
  const chips = [['all', 'All', rows.length], ...Object.keys(REASONS).filter((r) => counts[r]).map((r) => [r, REASONS[r].label, counts[r]])];
  // Problems first (red, then orange), most scanned first within each; unverified and pending last.
  const tier = (r) => ({ bad: 0, warn: 1 }[REASONS[r.reason]?.tone] ?? 2);
  const shown = rows.filter((r) => fixFilter === 'all' || r.reason === fixFilter)
    .sort((a, b) => tier(a) - tier(b) || b.scans - a.scans).slice(0, 50);
  return `<p class="meta">Barcodes scanned in the last ${d.days} days that need adding or checking. Problems first, most scanned first. Scan one in the app and use the store audit box or the add form to fix it.</p>
    <div class="chips" role="group" aria-label="Filter the fix list">${chips.map(([k, label, n]) =>
      `<button type="button" class="chip" data-filter="${k}" aria-pressed="${fixFilter === k}">${esc(label)} ${num(n)}</button>`).join('')}</div>
    <div class="table-wrap"><table class="fix-table">
      <thead><tr><th>#</th><th>Barcode</th><th class="num">Scans</th><th>Why</th><th>Detail</th><th>Last scanned</th><th>Look up</th></tr></thead>
      <tbody>${shown.map((r, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td class="code mono">${esc(r.barcode)}</td>
        <td class="num"><b>${num(r.scans)}</b></td>
        <td class="why"><span class="pill ${REASONS[r.reason]?.tone || 'info'}" title="${esc(REASONS[r.reason]?.hint || '')}">${esc(REASONS[r.reason]?.label || r.reason)}</span></td>
        <td class="detail">${esc(detail(r))}</td>
        <td class="seen">${esc(day(r.last_day))}</td>
        <td class="links"><a href="https://world.openfoodfacts.org/product/${encodeURIComponent(r.barcode)}" target="_blank" rel="noopener">Open Food Facts</a><a href="https://www.google.com/search?q=${encodeURIComponent(r.barcode)}" target="_blank" rel="noopener">Search</a></td>
      </tr>`).join('')}</tbody></table></div>
    <div class="list-foot"><span>Showing ${num(shown.length)} of ${num(fixFilter === 'all' ? rows.length : counts[fixFilter] || 0)}.</span>
      <button id="fix-csv" type="button" class="btn-ghost">Download CSV</button></div>`;
}

function detail(r) {
  const bits = [];
  if (r.reason === 'incomplete' && r.missing) bits.push(`Missing ${r.missing.split(',').map((m) => MISSING_WORDS[m] || m).join(', ')}`);
  if (r.reason === 'differs' && r.note) bits.push(`Tester note: ${r.note}`);
  if (!bits.length) bits.push(REASONS[r.reason]?.hint || '');
  return bits.join('. ');
}

function fixCsv(d) {
  const head = ['barcode', 'scans', 'reason', 'detail', 'last_scanned'];
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(t)) t = `'${t}`;
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [head.join(',')].concat((d.fix_list || []).map((r) =>
    [r.barcode, r.scans, REASONS[r.reason]?.label || r.reason, detail(r), r.last_day].map(cell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bettr-fix-list-${d.today}.csv`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- Small helpers ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function num(n) { return Number(n || 0).toLocaleString('en-US'); }
function pct(x) { return `${Math.round(x * 1000) / 10}%`; }
function big(text, cls = '', small = false) {
  return `<p class="big ${cls}"${small ? ' style="font-size:20px"' : ''}>${esc(text)}</p>`;
}
function empty(text) { return `<p class="empty">${esc(text)}</p>`; }
function meter(share) {
  const w = Math.max(0, Math.min(1, share)) * 100;
  return `<div class="meter" role="img" aria-label="${pct(share)} against the 90% goal"><span style="width:${w}%"></span><i style="left:${GOAL * 100}%"></i></div>`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function day(iso) {
  if (!iso) return '';
  const [, m, dd] = String(iso).slice(0, 10).split('-').map(Number);
  return `${dd} ${MONTHS[m - 1]}`;
}
function when(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}
function legend(series) {
  return `<ul class="legend">${series.map((s) => `<li><i style="background:${s.color}"></i>${esc(s.label)}</li>`).join('')}</ul>`;
}

// Stacked bars per day. rows: [{day, key1, key2…}]. Plain SVG, no library.
function barChart(rows, series) {
  if (!rows || !rows.length) return empty('No days to show.');
  const total = (r) => series.reduce((a, s) => a + (r[s.key] || 0), 0);
  const max = Math.max(1, ...rows.map(total));
  const W = 640, H = 180, left = 34, bottom = 22, top = 8, right = 4;
  const plotW = W - left - right, plotH = H - top - bottom;
  const step = plotW / rows.length;
  const bw = Math.max(1, Math.min(18, step * 0.7));
  const niceMax = niceCeil(max);
  const ticks = [0, niceMax / 2, niceMax];
  const y = (v) => top + plotH - (v / niceMax) * plotH;
  const labelEvery = Math.ceil(rows.length / 7);
  let bars = '';
  rows.forEach((r, i) => {
    let base = 0;
    const x = left + i * step + (step - bw) / 2;
    for (const s of series) {
      const v = r[s.key] || 0;
      if (v > 0) {
        bars += `<rect x="${x.toFixed(1)}" y="${y(base + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(base) - y(base + v)).toFixed(1)}" fill="${s.color}" rx="1.5"><title>${esc(day(r.day))}: ${esc(s.label)} ${num(v)}</title></rect>`;
      }
      base += v;
    }
  });
  const grid = ticks.map((t) => `<line x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${left - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${num(t)}</text>`).join('');
  const labels = rows.map((r, i) => (i % labelEvery === 0 || i === rows.length - 1)
    ? `<text x="${(left + i * step + step / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(day(r.day))}</text>` : '').join('');
  const allZero = rows.every((r) => total(r) === 0);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart by day">${grid}${bars}${labels}</svg>${allZero ? empty('Nothing yet in this period.') : ''}`;
}
function niceCeil(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ---------- Drawing the board ----------
function render(d) {
  lastData = d;
  $('stamp').textContent = `${d.days} days, ${day(d.since)} to ${day(d.today)} (Bangkok). ${d.testers_included ? 'Testers included.' : 'Shoppers only.'} Updated ${when(d.generated_at)}.`;
  $('sections').innerHTML = SECTIONS.map((s) => {
    const panels = PANELS.filter((p) => p.section === s.id);
    if (!panels.length) return '';
    return `<section class="section" aria-labelledby="sec-${s.id}">
      <div class="section-head"><h2 id="sec-${s.id}">${esc(s.title)}</h2><p>${esc(s.note)}</p></div>
      <div class="grid">${panels.map((p) => panelHtml(p, d)).join('')}</div></section>`;
  }).join('');
  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => { fixFilter = chip.dataset.filter; render(lastData); });
  }
  const csv = document.getElementById('fix-csv');
  if (csv) csv.addEventListener('click', () => fixCsv(lastData));
}

function panelHtml(p, d) {
  const size = p.size === 'tile' ? '' : p.size;
  if (p.planned) {
    return `<article class="panel planned ${size}" data-panel="${p.id}"><span class="planned-tag">Planned</span><h3>${esc(p.title)}</h3><p class="sub">${esc(p.planned)}</p></article>`;
  }
  let body;
  try { body = p.render(d); } catch (e) { body = empty('This panel could not be drawn.'); console.error(p.id, e); }
  return `<article class="panel ${size}" data-panel="${p.id}">${p.title ? `<h3>${esc(p.title)}</h3>` : ''}${body}</article>`;
}

// ---------- Talking to Supabase ----------
const $ = (id) => document.getElementById(id);

function readSession() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }
function writeSession(v) { try { if (v) sessionStorage.setItem(SESSION_KEY, v); else sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode */ } }
function savedContributor() { try { return localStorage.getItem(CONTRIBUTOR_KEY) || ''; } catch { return ''; } }

async function fetchData(passcode) {
  const res = await fetch(`${SHARED_DB_URL.replace(/\/$/, '')}/rest/v1/rpc/dashboard_data`, {
    method: 'POST',
    headers: { apikey: SHARED_DB_KEY, 'Content-Type': 'application/json',
      ...(SHARED_DB_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SHARED_DB_KEY}` } : {}) },
    body: JSON.stringify({ p_passcode: passcode, p_days: Number($('range').value), p_testers: $('testers').checked }),
  });
  if (res.status === 404) return { status: 'not-set-up' };
  if (!res.ok) return { status: 'error', code: res.status };
  return res.json();
}

let passcode = '';

async function load({ fromGate = false } = {}) {
  $('load-error').hidden = true;
  $('loading').hidden = false;
  let d;
  try { d = await fetchData(passcode); } catch { d = { status: 'offline' }; }
  $('loading').hidden = true;
  if (d.status === 'ok') {
    writeSession(passcode);
    $('gate').hidden = true;
    $('controls').hidden = false;
    $('board').hidden = false;
    render(d);
    return;
  }
  const messages = {
    'wrong-passcode': 'That passcode isn’t right.',
    locked: 'Too many wrong passcodes in the last 10 minutes. Wait a few minutes and try again.',
    'not-set-up': 'The dashboard isn’t set up in Supabase yet. Run supabase/dashboard.sql first.',
    offline: 'Couldn’t reach the database. Check the internet connection and try again.',
    error: 'The database answered with an error. Try again in a moment.',
  };
  const msg = messages[d.status] || messages.error;
  const notOpenYet = $('board').hidden;
  if (d.status === 'wrong-passcode' || d.status === 'locked' || notOpenYet) {
    if (d.status === 'wrong-passcode') writeSession('');
    // A saved passcode tried automatically and refused: just ask, without an error.
    showGate(d.status === 'wrong-passcode' && !fromGate ? '' : msg);
  } else {
    $('load-error').textContent = msg;
    $('load-error').hidden = false;
  }
}

function showGate(error = '') {
  $('board').hidden = true;
  $('controls').hidden = true;
  $('gate').hidden = false;
  $('gate-error').textContent = error;
  $('gate-error').hidden = !error;
  $('passcode').value = '';
  $('passcode').focus();
}

$('gate-form').addEventListener('submit', (e) => {
  e.preventDefault();
  passcode = $('passcode').value.trim();
  if (passcode) load({ fromGate: true });
});
$('refresh').addEventListener('click', () => load());
$('range').addEventListener('change', () => load());
$('testers').addEventListener('change', () => load());
$('sign-out').addEventListener('click', () => { passcode = ''; writeSession(''); showGate(); });

// Start: this tab's passcode, else the contributor passcode this phone saved in the Audit log, else ask.
passcode = readSession() || savedContributor();
if (passcode) load(); else showGate();
