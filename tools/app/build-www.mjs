// build-www.mjs — gathers the web app's files into www/ for the iPhone and Android apps (28 Nov 2026).
// The website itself has no build step: GitHub Pages serves the files as they are. The phone apps need
// the same files in one folder (www/, not saved in git), so this script copies them there. Nothing is
// changed on the way, so the phone apps run exactly the code the website runs.
// Run by `npm run sync`, `npm run ios` and `npm run android`.
import { cpSync, readdirSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'www');

// Folders the app uses. Everything else (tools, docs, supabase, native-art, the phone projects) stays out.
const FOLDERS = ['fonts', 'vendor', 'icons', 'landing'];
// Loose files at the top: the pages, styles and code, plus the install file.
const FILE_TYPES = ['.html', '.css', '.js', '.webmanifest'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const name of readdirSync(ROOT)) {
  const from = path.join(ROOT, name);
  if (statSync(from).isFile() && FILE_TYPES.includes(path.extname(name))) cpSync(from, path.join(OUT, name));
}
for (const folder of FOLDERS) cpSync(path.join(ROOT, folder), path.join(OUT, folder), { recursive: true });
console.log(`Copied the web app into www/ (${readdirSync(OUT).length} items).`);
