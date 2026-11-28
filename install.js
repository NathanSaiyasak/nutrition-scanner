// install.js — the installable web app (28 Nov 2026).
// 1. Starts sw.js, which keeps a copy of the app's files so it opens without internet.
// 2. Fills "Add to your home screen" in the More menu with the steps for this phone's browser.
// Inside the iPhone or Android app (Capacitor) neither is needed: the files are already on the phone.
import { t } from './i18n.js?v=r20';

const $ = (id) => document.getElementById(id);
const inNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());
const openedFromHomeScreen =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

if ('serviceWorker' in navigator && !inNativeApp && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* no offline copy; the app still works online */ });
  });
}

const item = $('install-item');
const steps = $('install-steps');
const button = $('install-button');

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

if (item && !inNativeApp && !openedFromHomeScreen) {
  item.hidden = false;
  if (isIOS) steps.textContent = t(isIOSSafari ? 'install.ios' : 'install.iosOther');
  else steps.textContent = t('install.other');
}

// Chrome on Android (and desktop) offers its own install button. Keep the offer and show our button.
let offer = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  offer = event;
  if (!item || inNativeApp) return;
  item.hidden = false;
  steps.textContent = t('install.prompt');
  button.hidden = false;
});

button?.addEventListener('click', async () => {
  if (!offer) return;
  offer.prompt();
  await offer.userChoice.catch(() => null);
  offer = null;
  button.hidden = true;
});

window.addEventListener('appinstalled', () => {
  if (item) item.hidden = true;
});
