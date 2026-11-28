# Phone app guide

Written 28 Nov 2026. Nothing here submits anything to a store. It shows how to put the app on your own
phone, now, for free.

There are two ways the app can live on a phone. They run the same code as the website.

| | Home-screen web app | iPhone and Android app |
|---|---|---|
| What it is | The website, added to the home screen. Opens full screen with its own icon | A real app built from the same files, made with a free tool called Capacitor |
| Cost | Free | Free to run on your own phone. Store accounts cost money (see the end) |
| Updates | Automatic, every time we publish the website | A new build each time |
| Works offline | Opens without internet once opened once. Looking up a product still needs internet | Same |
| Ready now | Yes, after this pull request is merged | Yes, on your own phone. Store submission later |

## 1. Home-screen web app (2 minutes, no tools)

**iPhone**

1. Open the app link in **Safari** (not Chrome): https://nathansaiyasak.github.io/nutrition-scanner/
2. Tap the **Share** button (the square with an arrow, at the bottom).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Bettr from the home screen. There are no browser bars and the camera works as before.

**Android**

1. Open the app link in **Chrome**.
2. Open the More menu in Bettr and tap **Add Bettr to your home screen**, then **Add to home screen**.
   If that button is not there, use Chrome's own menu (three dots) and tap **Add to Home screen** or
   **Install app**.

The More menu in the app also shows these steps, in English and Thai. It hides itself once the app is on
the home screen.

## 2. Real iPhone app on your own iPhone (about 30 minutes the first time)

You need your Mac, your iPhone, a USB cable and a free Apple ID. No paid Apple account is needed to run
it on your own phone. Without the paid account, the app stops opening after 7 days; plug the phone in and
press Run again to renew it.

**One-time setup on the Mac**

1. Install **Xcode** from the Mac App Store (free, large download).
2. Install **Node.js** (the LTS version) from https://nodejs.org.
3. Open the Terminal app and get the code:
   ```
   git clone https://github.com/NathanSaiyasak/nutrition-scanner.git
   cd nutrition-scanner
   npm install
   ```

**Every time you want a fresh build**

1. In Terminal, inside the `nutrition-scanner` folder:
   ```
   git pull
   npm run ios
   ```
   This copies the web app into the iPhone project and opens it in Xcode.
2. In Xcode, click **App** in the left list, then the **Signing & Capabilities** tab. Under **Team**, pick
   your Apple ID (Add an Account if it is not there). If Xcode complains about the bundle identifier,
   add something to the end of it, such as `.nathan`.
3. Plug in your iPhone and unlock it. Pick it at the top of the Xcode window, then press the **Run**
   button (the triangle).
4. The first time, the iPhone says the developer is not trusted. Open **Settings > General > VPN & Device
   Management**, tap your Apple ID and tap **Trust**. On iOS 16 and later you may also need to switch on
   **Settings > Privacy & Security > Developer Mode** and restart.
5. Open Bettr on the phone. It asks once for the camera, with the message "Bettr uses the camera only to
   read barcodes. Nothing is recorded."

No iPhone handy? Pick an iPhone simulator at the top of Xcode instead and press Run. The simulator has no
camera, so use Type it or Use a photo there.

## 3. Real Android app (about 30 minutes the first time)

1. Install **Android Studio** (free) from https://developer.android.com/studio, and Node.js as above.
2. Get the code and run `npm install` as above, then:
   ```
   npm run android
   ```
   This opens the project in Android Studio. The first open downloads what it needs (a few minutes).
3. On the phone, switch on **Developer options** (tap Build number in Settings > About phone seven times)
   and then **USB debugging**. Plug it in and allow the computer.
4. Pick the phone at the top of Android Studio and press **Run**.

## Renaming the app later

The name lives in one file, `app-name.js`. Change the name there, then run:
```
npm run rename
npm run sync
```
That updates the name under the icon, the page title, the install file and both phone projects. Two things
are artwork and need a designer: the "Bettr." wordmark in the app and the "B." icon (redraw it, then run
`npm run icons`). The website's landing, About and Privacy pages are separate and say Bettr in their text.

The app's store ID is `io.github.nathansaiyasak.nutritionscanner`. It has no brand name in it on purpose,
because a store ID can never change after the first upload.

## What launching would need later (not done, needs your decision)

- **Apple Developer Program**, USD 99 a year, to put the app on the App Store or TestFlight.
- **Google Play developer account**, USD 25 once.
- A settled name (the Bettr name has trademark risk), a real contact email, a support web page, store
  screenshots and a store description in English and Thai.
- Apple sometimes turns away apps that are only a website in a wrapper. The camera scanner, offline
  history and favourites help, but this is a real risk to plan for.
- A lawyer's look at the Privacy page before public launch.

## For whoever works on the code

- The website still has no build step. `npm run build` only copies the web files into `www/` (not saved in
  git) for the phone projects. `npm run sync` copies them and updates both projects.
- `sw.js` keeps the offline copy. On every release change its `VERSION` to the same `rN` as the `?v=rN`
  on the files, and add any new `.js` file to its `SHELL` list.
- Inside the phone apps the offline copy and the install steps are switched off (`install.js`), because
  the files are already on the phone.
- Icons are drawn by `npm run icons` from the brand colours (`tools/app/make-icons.mjs`).
