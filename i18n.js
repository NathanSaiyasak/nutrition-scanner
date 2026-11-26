// i18n.js — English and Thai (26 Nov 2026). All the words live in strings.js, side by side.
// The language is picked once when the page opens: the person's own choice from the More menu if they
// made one (kept on this phone), otherwise English. English stays the main language (Nathan, 26 Nov 2026):
// Thai only when someone picks it.
// Switching reloads the page, so every screen is drawn again in the new language.
import { STRINGS, ADDITIVE_TH } from './strings.js?v=r12';

const KEY = 'bettr-lang';
const LANGS = ['en', 'th'];

function pick() {
  // ?lang=th in the link wins (also used when the phone won't save the choice).
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage blocked: English */ }
  return 'en';
}

export const lang = pick();
export const locale = lang === 'th' ? 'th-TH' : 'en-GB';
document.documentElement.lang = lang;

/** The text for a key in the current language, with {name} filled in from vars. */
export function t(key, vars = {}) {
  const entry = STRINGS[key];
  if (!entry) {
    console.warn(`Missing text: ${key}`);
    return key;
  }
  const value = entry[lang === 'th' ? 1 : 0] ?? entry[0];
  if (typeof value === 'function') return value(vars);
  return value.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

/** An additive's name: Thai when there is one, else the English name. */
export function additiveName(code, english) {
  return lang === 'th' && ADDITIVE_TH[code] ? ADDITIVE_TH[code] : english;
}

/** Switch language: remember it on this phone and draw the app again. */
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  try {
    localStorage.setItem(KEY, next);
  } catch {
    url.searchParams.set('lang', next); // storage blocked: carry the choice in the link instead
  }
  window.location.replace(url.toString());
}

/**
 * Fill the fixed text in the page. In index.html:
 *   data-i18n="key"            → the element's text
 *   data-i18n-html="key"       → the element's HTML (only our own strings that hold a link)
 *   data-i18n-attr="attr:key;…" → attributes such as placeholder or aria-label
 */
export function applyStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-html]')) node.innerHTML = t(node.dataset.i18nHtml);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }
}
