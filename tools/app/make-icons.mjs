// make-icons.mjs — draws the app icons from one picture (28 Nov 2026).
// The icon is the "B." from the wordmark in cream on caramel, the brand colours in style.css.
// Run `npm run icons` after changing the artwork. It writes:
//   icons/        the web app icons (home screen, install, browser tab)
//   native-art/   big source pictures that `npx capacitor-assets generate` turns into the
//                 iPhone and Android icons and launch screens
// It uses the headless Chromium browser that comes with Playwright to turn the drawing into PNG files.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CARAMEL = '#A66E35';
const CREAM = '#FFF7ED';
const BG = '#FFF7ED'; // the app's page colour, used behind the launch screen

// The "B" and the full stop, copied from the wordmark in index.html (#logo).
const B = 'M11.9555 8.99937C13.5585 8.24358 14.5581 6.67715 14.5581 4.83491C14.5581 1.98852 12.5696 0 9.72316 0H0V18.9374H10.1788C13.2263 18.9374 15.355 16.7858 15.355 13.7048C15.355 11.4572 14.043 9.67592 11.9555 8.99937ZM4.66425 10.9772H8.75709C9.8283 10.9772 10.5749 11.7482 10.5749 12.853C10.5749 13.9577 9.80392 14.7287 8.69919 14.7287H4.66273V10.9787L4.66425 10.9772ZM8.18872 7.56246H4.66425V4.15227H8.2451C9.23098 4.15227 9.8923 4.83796 9.8923 5.85736C9.8923 6.87676 9.19136 7.56246 8.1872 7.56246H8.18872Z';
const LOGO_PATHS = `
  <path d="M11.9555 8.99937C13.5585 8.24358 14.5581 6.67715 14.5581 4.83491C14.5581 1.98852 12.5696 0 9.72316 0H0V18.9374H10.1788C13.2263 18.9374 15.355 16.7858 15.355 13.7048C15.355 11.4572 14.043 9.67592 11.9555 8.99937ZM4.66425 10.9772H8.75709C9.8283 10.9772 10.5749 11.7482 10.5749 12.853C10.5749 13.9577 9.80392 14.7287 8.69919 14.7287H4.66273V10.9787L4.66425 10.9772ZM8.18872 7.56246H4.66425V4.15227H8.2451C9.23098 4.15227 9.8923 4.83796 9.8923 5.85736C9.8923 6.87676 9.19136 7.56246 8.1872 7.56246H8.18872Z"/>
  <path d="M49.5072 14.968C48.6234 15.2834 47.8249 15.2606 47.3175 14.9025C46.9351 14.6328 46.7415 14.1924 46.7415 13.5905V8.24666H50.1533V4.26353H46.7415V0.284973H42.5314V3.01556C42.5314 3.7744 42.0849 4.26505 41.3946 4.26505H37.7559V0.284973H33.5457V3.01556C33.5457 3.7744 33.0992 4.26505 32.409 4.26505H31.385V8.24818H33.3187V14.3874C33.3187 16.0849 33.951 17.438 35.1457 18.2989C36.6801 19.4052 38.9993 19.5957 41.3535 18.8109L41.5455 18.7469L40.7714 14.8781L40.523 14.9665C39.6393 15.2819 38.8408 15.259 38.3334 14.9009C37.9509 14.6312 37.7574 14.1909 37.7574 13.589V8.24513H42.3043V14.3844C42.3043 16.0819 42.9367 17.435 44.1313 18.2959C45.041 18.9511 46.2265 19.2848 47.5324 19.2848C48.4283 19.2848 49.3807 19.1279 50.3391 18.8079L50.5311 18.7439L49.7571 14.875L49.5087 14.9634L49.5072 14.968Z"/>
  <path d="M60.4067 9.27213L60.9735 4.35341L60.8212 4.28484C59.788 3.82009 58.5919 3.79876 57.5405 4.22541C56.7664 4.53931 56.1462 5.05892 55.7516 5.71566L55.2 4.26503H51.7426V18.9374H56.1798V11.2027C56.1798 10.2123 56.5226 9.47174 57.1717 9.06033C57.9199 8.58796 59.0201 8.61539 60.1172 9.13499L60.4052 9.27213H60.4067Z"/>
  <path d="M62.7183 13.7032C61.1686 13.7032 60.0441 14.8522 60.0441 16.4338C60.0441 18.0155 61.1686 19.1644 62.7183 19.1644C64.268 19.1644 65.3925 18.0155 65.3925 16.4338C65.3925 14.8522 64.268 13.7032 62.7183 13.7032Z"/>
  <path d="M22.3019 4.02887C24.3559 3.66164 26.2624 4.11474 27.8136 5.34137C29.5292 6.69755 30.6356 8.93271 30.7697 11.3218L30.7804 11.524L21.2921 13.2232C21.8986 14.5276 23.105 15.207 24.4337 14.9693C25.4957 14.7788 26.2804 14.0646 26.4298 13.149L26.4679 12.9175L30.9825 13.7769L30.9474 13.9957C30.5436 16.5114 28.2234 18.5683 25.1759 19.1138C23.1005 19.4856 21.0888 19.0654 19.5148 17.9302C17.9454 16.7981 16.8709 15.0014 16.4884 12.8697C16.1968 11.2423 16.352 9.70644 16.8741 8.38043C17.0593 8.4707 17.2667 8.52301 17.4865 8.52301C18.2594 8.52266 18.8868 7.89564 18.8868 7.12262C18.8868 7.02564 18.8754 6.93084 18.8566 6.83942C19.0065 6.88423 19.1657 6.90973 19.3302 6.90973C20.2407 6.90927 20.9786 6.17086 20.9786 5.26031C20.9786 4.97166 20.9038 4.70043 20.7736 4.46442C21.2516 4.27275 21.762 4.12538 22.3009 4.02887H22.3019ZM25.7941 9.64215C25.2881 8.53162 24.1651 7.91421 22.9767 8.1275C21.8585 8.32718 21.0682 9.23564 20.8624 10.5259L25.7941 9.64215Z"/>`;

// The "B." mark: the B (15.36 wide, 18.94 tall) and a dot of radius 2.73 just after it.
// mark(width) draws it centred in a 100 x 100 square, `width` units wide.
function mark(width, colour) {
  const w = 15.355 + 1.4 + 2 * 2.73; // B, gap, dot
  const h = 18.94;
  const s = width / w;
  const x = (100 - w * s) / 2;
  const y = (100 - h * s) / 2;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${colour}">
    <path d="${B}"/><circle cx="${15.355 + 1.4 + 2.73}" cy="${18.94 - 2.73}" r="2.73"/></g>`;
}

const svg = (body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}${body}</svg>`;

// Ordinary icon: the mark fills about half the square. Maskable (Android cuts it to a circle or
// squircle): smaller, inside the safe middle circle.
const ICON = svg(mark(52, CREAM), CARAMEL);
const MASKABLE = svg(mark(40, CREAM), CARAMEL);
const FOREGROUND = svg(mark(34, CREAM), null); // Android's layered icon, drawn over the caramel layer
const BACKGROUND = svg('', CARAMEL);
// Launch screen: the whole wordmark in caramel on the cream page colour, like the web splash.
const splash = (bg, colour) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${bg}"/>
   <g transform="translate(${(2732 - 66 * 9) / 2} ${(2732 - 20 * 9) / 2}) scale(9)" fill="${colour}">${LOGO_PATHS}</g></svg>`;

async function render(browser, svgText, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}

mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
mkdirSync(path.join(ROOT, 'native-art'), { recursive: true });
writeFileSync(path.join(ROOT, 'icons/icon.svg'), ICON);

const browser = await chromium.launch();
await render(browser, ICON, 192, 'icons/icon-192.png');
await render(browser, ICON, 512, 'icons/icon-512.png');
await render(browser, MASKABLE, 512, 'icons/icon-maskable-512.png');
await render(browser, ICON, 180, 'icons/apple-touch-icon.png');
await render(browser, ICON, 32, 'icons/favicon-32.png');
await render(browser, ICON, 1024, 'native-art/icon-only.png');
await render(browser, FOREGROUND, 1024, 'native-art/icon-foreground.png');
await render(browser, BACKGROUND, 1024, 'native-art/icon-background.png');
await render(browser, splash(BG, CARAMEL), 2732, 'native-art/splash.png');
await browser.close();
console.log('Icons written to icons/ and native-art/');
