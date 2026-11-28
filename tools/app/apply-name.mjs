// apply-name.mjs — writes the app's name from app-name.js everywhere it has to be spelled out (28 Nov 2026).
// Run `npm run rename` after changing app-name.js. It is safe to run again and again.
// It updates:
//   manifest.webmanifest        the web app's install file (name under the icon, colours, icons)
//   index.html                  the page title and the home-screen title on iPhone
//   capacitor.config.json       the settings for the iPhone and Android app projects
//   android/…/strings.xml       the name under the icon on Android
//   ios/App/App/Info.plist      the name under the icon on iPhone, and the camera message
// It also makes sure both phone apps are allowed to ask for the camera.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { APP_NAME, APP_SHORT_NAME, APP_ID } from '../../app-name.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = (p) => path.join(ROOT, p);
const BG = '#FFF7ED'; // --bg in style.css
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CAMERA_TEXT = `${APP_NAME} uses the camera only to read barcodes. Nothing is recorded.`;
const PHOTO_TEXT = `${APP_NAME} reads the barcode in a photo you pick. The photo stays on your phone.`;

function edit(p, change) {
  if (!existsSync(file(p))) return console.log(`  skipped ${p} (not there yet)`);
  const before = readFileSync(file(p), 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(file(p), after);
  console.log(`  ${after !== before ? 'updated' : 'already right'} ${p}`);
}

console.log(`Setting the app name to ${APP_NAME} (${APP_SHORT_NAME}), ID ${APP_ID}`);

const manifest = {
  id: './',
  name: APP_NAME,
  short_name: APP_SHORT_NAME,
  description: 'Scan a barcode on a packaged food and see what is in it',
  lang: 'en',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: BG,
  theme_color: BG,
  categories: ['food', 'health', 'shopping'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(file('manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('  wrote manifest.webmanifest');

edit('index.html', (s) => s
  .replace(/<title>[^<]*<\/title>/, `<title>${escapeXml(APP_NAME)}</title>`)
  .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*/, `$1${escapeXml(APP_SHORT_NAME)}`)
  .replace(/aria-label="[^"]*"( data-app-name)/g, `aria-label="${escapeXml(APP_NAME)}"$1`));

const capConfig = {
  appId: APP_ID,
  appName: APP_NAME,
  webDir: 'www',
  backgroundColor: BG,
  ios: { backgroundColor: BG },
  android: { backgroundColor: BG },
};
writeFileSync(file('capacitor.config.json'), `${JSON.stringify(capConfig, null, 2)}\n`);
console.log('  wrote capacitor.config.json');

edit('android/app/src/main/res/values/strings.xml', (s) => s
  .replace(/(<string name="app_name">)[^<]*/, `$1${escapeXml(APP_SHORT_NAME)}`)
  .replace(/(<string name="title_activity_main">)[^<]*/, `$1${escapeXml(APP_NAME)}`));

edit('android/app/src/main/AndroidManifest.xml', (s) => {
  if (s.includes('android.permission.CAMERA')) return s;
  return s.replace(/(\s*<uses-permission android:name="android.permission.INTERNET" \/>)/,
    '$1\n    <!-- The scanner reads barcodes with the camera. Not required, so phones without one can still install. -->\n' +
    '    <uses-permission android:name="android.permission.CAMERA" />\n' +
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />');
});

function plistString(s, key, value) {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (re.test(s)) return s.replace(re, `$1${escapeXml(value)}$2`);
  return s.replace(/(<dict>\n)/, `$1\t<key>${key}</key>\n\t<string>${escapeXml(value)}</string>\n`);
}
edit('ios/App/App/Info.plist', (s) => {
  let out = plistString(s, 'CFBundleDisplayName', APP_SHORT_NAME);
  out = plistString(out, 'NSCameraUsageDescription', CAMERA_TEXT);
  out = plistString(out, 'NSPhotoLibraryUsageDescription', PHOTO_TEXT);
  return out;
});

console.log('Done. Run `npm run sync` to copy the change into the phone app projects.');
