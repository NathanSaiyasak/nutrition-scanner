// app-name.js — the app's name, in one place (28 Nov 2026).
// The name Bettr is not settled yet (trademark risk), so everything that shows the name reads it from here.
// To rename the app:
//   1. Change NAME (and SHORT_NAME if the new name is long) below.
//   2. Run `npm run rename`. It writes the new name into the web app's install file
//      (manifest.webmanifest), the page title, and the iPhone and Android app projects.
// Text inside the app (strings.js) uses {app} and picks the name up from here by itself.
// Not covered by this file: the drawn wordmark and the "B." icon (they are artwork), and the
// landing, About and Privacy pages (they are the website, not the app).

export const APP_NAME = 'Bettr';

// The name under the icon on a phone's home screen. Keep it to about 12 letters.
export const APP_SHORT_NAME = 'Bettr';

// The app's ID in the App Store and Google Play. It has no brand name in it on purpose,
// because once an app is in a store this ID can never change. Do not change it after the first upload.
export const APP_ID = 'io.github.nathansaiyasak.nutritionscanner';
