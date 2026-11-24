// dropdown.js — row dropdowns on the result screen (Nathan, 24 Nov 2026).
// The gauge (a half-circle dial from Nathan's mockup) and the smooth open and close.
// The gauge only draws what nutrition-view.js decided (see gaugeFor there); it decides nothing.

const SVG = 'http://www.w3.org/2000/svg';
const CX = 60;
const CY = 58;
const R = 46;
const OPEN_MS = 320;
const CLOSE_MS = 260;
const GAUGE_MS = 420;
const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A point on the half circle: t = 0 is the left end, 1 the right end, going over the top.
function point(t) {
  const a = Math.PI * (1 - t);
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
}

function arc(t1, t2) {
  const [x1, y1] = point(t1);
  const [x2, y2] = point(t2);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * gauge: { kind: 'bands' | 'fill', pos (0–1), pct, tone }. Returns the gauge element.
 * Starts at zero; setupDropdown moves it to its value when the dropdown opens.
 */
export function buildGauge(gauge) {
  const box = document.createElement('div');
  box.className = `gauge gauge--${gauge.kind}`;
  if (gauge.tone) box.dataset.tone = gauge.tone;
  box.setAttribute('aria-hidden', 'true'); // the sentences beside it say the same thing in words
  box.style.setProperty('--pos', String(gauge.pos));
  box.style.setProperty('--off', String(100 - gauge.pos * 100));
  box.dataset.pct = String(gauge.pct);

  const svg = svgEl('svg', { viewBox: '0 0 120 66', class: 'gauge-svg' });
  if (gauge.kind === 'bands') {
    // Three equal bands with small gaps: low (green), medium (orange), high (red).
    const gap = 0.075;
    ['good', 'warn', 'bad'].forEach((tone, i) => {
      const from = i / 3 + (i === 0 ? 0 : gap / 2);
      const to = (i + 1) / 3 - (i === 2 ? 0 : gap / 2);
      svg.append(svgEl('path', { d: arc(from, to), class: `gauge-band band-${tone}` }));
    });
  } else {
    svg.append(svgEl('path', { d: arc(0, 1), class: 'gauge-track' }));
    svg.append(svgEl('path', { d: arc(0, 1), class: 'gauge-fill', pathLength: '100' }));
  }
  // The marker: a solid dot in the colour of the band it sits on (Nathan, 24 Nov 2026), with a thin
  // white edge so it stands out from the band. Turned around the centre from the left end.
  const knob = svgEl('g', { class: 'gauge-knob' });
  const [kx, ky] = point(0);
  knob.append(svgEl('circle', { cx: kx, cy: ky, r: 7, class: 'knob-dot' }));
  svg.append(knob);

  const num = document.createElement('span');
  num.className = 'gauge-num';
  num.textContent = '0%';
  box.append(svg, num);
  return box;
}

// Move the gauge to its value (animated), or back to zero.
function runGauge(body, on) {
  const box = body.querySelector('.gauge');
  if (!box) return;
  const num = box.querySelector('.gauge-num');
  const target = Number(box.dataset.pct);
  cancelAnimationFrame(Number(box.dataset.raf || 0));
  if (!on) {
    box.classList.remove('is-on');
    num.textContent = '0%';
    return;
  }
  // Force the start state to be painted before moving, so the transition runs.
  void box.getBoundingClientRect();
  box.classList.add('is-on');
  if (reducedMotion()) {
    num.textContent = `${target}%`;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / GAUGE_MS);
    const eased = 1 - (1 - t) ** 3;
    num.textContent = `${Math.round(target * eased)}%`;
    if (t < 1) box.dataset.raf = String(requestAnimationFrame(step));
  };
  box.dataset.raf = String(requestAnimationFrame(step));
}

/**
 * Smooth open and close for a <details> row: the body slides down and fades in, the chevron turns,
 * and the gauge moves from zero to its value. With "reduce motion" on, it just opens and closes.
 */
export function setupDropdown(details) {
  const summary = details.querySelector('summary');
  const body = details.querySelector('.fact-body');
  let anim = null;

  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const opening = !details.classList.contains('is-open');
    if (anim) {
      anim.onfinish = null;
      anim.cancel();
      anim = null;
    }
    details.classList.toggle('is-open', opening);

    if (reducedMotion() || typeof body.animate !== 'function') {
      details.open = opening;
      runGauge(body, opening);
      return;
    }

    if (opening) {
      details.open = true;
      const height = body.scrollHeight;
      anim = body.animate([
        { height: '0px', opacity: 0, transform: 'translateY(-6px)' },
        { height: `${height}px`, opacity: 1, transform: 'translateY(0)' },
      ], { duration: OPEN_MS, easing: EASE_OUT });
      anim.onfinish = () => { anim = null; };
      setTimeout(() => { if (details.classList.contains('is-open')) runGauge(body, true); }, 60);
    } else {
      const height = body.offsetHeight;
      anim = body.animate([
        { height: `${height}px`, opacity: 1, transform: 'translateY(0)' },
        { height: '0px', opacity: 0, transform: 'translateY(-6px)' },
      ], { duration: CLOSE_MS, easing: 'ease-in' });
      anim.onfinish = () => {
        anim = null;
        details.open = false;
        runGauge(body, false);
      };
    }
  });
}
