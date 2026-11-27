// run.mjs: the 20-photo label reader test (data plan, 27 Nov 2026). Not part of the app.
//
// For each product folder in photos/, sends the photos to two Claude models, asks for the nutrition
// table exactly as printed, then:
//   1. runs the app's own number checks (../../checks.js) on what was read,
//   2. compares each value with answer-key.csv (typed by hand from the pack),
//   3. adds up the tokens and the cost.
// Results go to results/ (a CSV per run and a short summary). Nothing is uploaded anywhere else.
//
// The API key is read only from the ANTHROPIC_API_KEY environment variable. Never put it in a file here.
//
//   npm install
//   node run.mjs --dry-run        # checks the photos and answer key, estimates the cost, no API calls
//   node run.mjs                  # runs both models
//   node run.mjs --models haiku   # one model only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import sharp from 'sharp';
import { checkNumbers } from '../../checks.js';
import { entriesAgree, servingGrams } from '../../entry-state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS = path.join(here, 'photos');
const RESULTS = path.join(here, 'results');
const KEY_FILE = path.join(here, 'answer-key.csv');

// Prices per million tokens, checked 26 Nov 2026 (Haiku price is for prompts under 100K tokens).
const MODELS = {
  haiku: { id: 'claude-haiku-5-5', input: 0.10, output: 0.50 },
  sonnet: { id: 'claude-sonnet-5-5', input: 2.00, output: 10.00 },
};
const MAX_EDGE = 1568; // the size the app would send; about 2,400 tokens for a phone photo
const MAX_PRODUCTS = 25; // a guard so a wrong folder can't run up a bill
const FIELDS = ['energy_kcal', 'fat_g', 'saturated_fat_g', 'carbohydrates_g', 'sugars_g', 'fibre_g', 'protein_g', 'sodium_mg'];
const TOLERANCE = { energy_kcal: 10, sodium_mg: 30 }; // same rule as entry-state.js: 10% or 1 g

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const modelArg = args.includes('--models') ? args[args.indexOf('--models') + 1] : 'haiku,sonnet';
const modelKeys = modelArg.split(',').map((s) => s.trim()).filter((k) => MODELS[k]);

// What we ask for. Values are strings as printed ("<1", "12.5"), null when not printed or unreadable.
const value = z.string().nullable().describe('The number exactly as printed, without the unit, e.g. "12", "0.5", "<1". null if not printed or unreadable.');
const Label = z.object({
  is_nutrition_label: z.boolean().describe('false if no nutrition table can be seen in the photos'),
  product_name: z.string().nullable(),
  brand: z.string().nullable(),
  basis: z.enum(['per serving', 'per 100 g', 'per 100 ml']).describe('Which column the values below come from. Prefer per 100 g/ml when the label has it.'),
  serving_size: z.string().nullable().describe('Serving size as printed, e.g. "1 ซอง (60 ก.)"'),
  energy_kcal: value, fat_g: value, saturated_fat_g: value, carbohydrates_g: value,
  sugars_g: value, fibre_g: value, protein_g: value, sodium_mg: value,
  ingredients: z.string().nullable().describe('The ingredients list as printed, in its own language'),
  ins_numbers: z.array(z.string()).describe('INS or E numbers in the ingredients, e.g. ["621", "211"]'),
  unreadable: z.array(z.string()).describe('Names of values that are printed but could not be read with confidence'),
});

const PROMPT = `These are photos of one packaged food or drink sold in Thailand. Read the nutrition table (ข้อมูลโภชนาการ) and the ingredients.

Rules:
- Copy numbers exactly as printed. Never estimate, calculate or guess a value. If a number is blurred, cut off or hidden, return null and list it in "unreadable".
- Thai labels usually give values per serving (หนึ่งหน่วยบริโภค). Use the per 100 g/ml column only if the label prints one.
- Energy in kcal (กิโลแคลอรี). If only kJ is printed, return null for energy.
- Sodium (โซเดียม) in mg. If the label gives salt in g instead, return null for sodium.
- Fibre is ใยอาหาร, saturated fat is ไขมันอิ่มตัว, sugars is น้ำตาล, carbohydrate is คาร์โบไฮเดรตทั้งหมด.`;

function readKey() {
  if (!fs.existsSync(KEY_FILE)) return new Map();
  const [head, ...lines] = fs.readFileSync(KEY_FILE, 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',').map((s) => s.trim());
  const map = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = splitCsv(line);
    const row = Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]));
    map.set(row.barcode, row);
  }
  return map;
}

function splitCsv(line) {
  const out = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const csv = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function loadPhotos(dir) {
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f)).sort();
  const images = [];
  for (const f of files) {
    const buf = await sharp(path.join(dir, f)).rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    const meta = await sharp(buf).metadata();
    images.push({ name: f, data: buf.toString('base64'), tokens: Math.ceil(meta.width / 28) * Math.ceil(meta.height / 28) });
  }
  return images;
}

// Per 100 g/ml number from a read value, for the number checks.
function per100(entry, key) {
  const raw = entry[key];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).replace('<', ''));
  if (!Number.isFinite(n)) return null;
  if (entry.basis !== 'per serving') return n;
  const g = servingGrams(entry.serving_size);
  return g ? (n * 100) / g : null;
}

function runChecks(read) {
  const keyMap = { energy: 'energy_kcal', fat: 'fat_g', satfat: 'saturated_fat_g', carbs: 'carbohydrates_g', sugars: 'sugars_g', fibre: 'fibre_g', protein: 'protein_g', sodium: 'sodium_mg' };
  const facts = Object.entries(keyMap).map(([key, field]) => ({ key, judge100: per100(read, field) }));
  const p = { name: read.product_name || '', categories: [], rows: [] };
  const drink = read.basis === 'per 100 ml' || /ml|มล|มิลลิลิตร/i.test(read.serving_size || '');
  return checkNumbers(p, facts, { drink });
}

function sameValue(field, a, b) {
  if ((a === null || a === '') && (b === null || b === '')) return 'both blank';
  if (a === null || a === '') return 'missed';
  if (b === null || b === '') return 'extra';
  const x = Number(String(a).replace('<', ''));
  const y = Number(String(b).replace('<', ''));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'wrong';
  const tol = Math.max(TOLERANCE[field] ?? 1, 0.1 * Math.max(x, y));
  return Math.abs(x - y) <= tol ? 'right' : 'wrong';
}

async function main() {
  if (!fs.existsSync(PHOTOS)) {
    console.error('No photos/ folder. Make one folder per product, named by barcode, with 1 to 3 photos in each.');
    process.exit(1);
  }
  const products = fs.readdirSync(PHOTOS).filter((d) => fs.statSync(path.join(PHOTOS, d)).isDirectory()).sort();
  if (!products.length) { console.error('photos/ has no product folders.'); process.exit(1); }
  if (products.length > MAX_PRODUCTS) { console.error(`More than ${MAX_PRODUCTS} products, stopping to protect the budget.`); process.exit(1); }
  const key = readKey();

  // Load photos once, estimate cost.
  const loaded = [];
  let imageTokens = 0;
  for (const barcode of products) {
    const images = await loadPhotos(path.join(PHOTOS, barcode));
    if (!images.length) { console.warn(`${barcode}: no photos, skipped`); continue; }
    imageTokens += images.reduce((s, i) => s + i.tokens, 0);
    loaded.push({ barcode, images });
    if (!key.has(barcode)) console.warn(`${barcode}: not in answer-key.csv, accuracy won't be measured`);
  }
  const promptTokens = imageTokens + loaded.length * 700; // instructions and schema
  console.log(`${loaded.length} products, ${loaded.reduce((s, p) => s + p.images.length, 0)} photos, about ${imageTokens.toLocaleString()} image tokens.`);
  for (const k of modelKeys) {
    const m = MODELS[k];
    const est = (promptTokens * m.input + loaded.length * 1500 * m.output) / 1e6;
    console.log(`Estimated cost on ${m.id}: about $${est.toFixed(3)} (a ceiling, thinking included).`);
  }
  if (dryRun) { console.log('Dry run, no API calls made.'); return; }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. See README.md for how to set it without saving it in a file.');
    process.exit(1);
  }

  const client = new Anthropic();
  fs.mkdirSync(RESULTS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rows = [];
  const summary = [];

  for (const k of modelKeys) {
    const m = MODELS[k];
    const tally = { products: 0, inputTokens: 0, outputTokens: 0, cost: 0, right: 0, wrong: 0, missed: 0, extra: 0, allRight: 0, flagged: 0, flaggedWrong: 0, wrongNotFlagged: 0, refused: 0, errors: 0, seconds: 0 };
    for (const prod of loaded) {
      const started = Date.now();
      let read = null; let usage = null; let note = '';
      try {
        const res = await client.messages.parse({
          model: m.id,
          max_tokens: 8000,
          output_config: { effort: 'low', format: zodOutputFormat(Label) },
          messages: [{
            role: 'user',
            content: [
              ...prod.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: i.data } })),
              { type: 'text', text: PROMPT },
            ],
          }],
        });
        usage = res.usage;
        if (res.stop_reason === 'refusal') { note = 'refused'; tally.refused += 1; } else if (!res.parsed_output) { note = `no result (${res.stop_reason})`; tally.errors += 1; } else read = res.parsed_output;
      } catch (err) {
        note = `error ${err.status || ''} ${err.message}`.trim();
        tally.errors += 1;
      }
      const seconds = (Date.now() - started) / 1000;
      tally.seconds += seconds;
      if (usage) {
        tally.inputTokens += usage.input_tokens;
        tally.outputTokens += usage.output_tokens;
      }
      const cost = usage ? (usage.input_tokens * m.input + usage.output_tokens * m.output) / 1e6 : 0;
      tally.cost += cost;
      tally.products += 1;

      const answer = key.get(prod.barcode);
      const checks = read ? runChecks(read) : { hard: [], soft: [] };
      const verdicts = {};
      let anyWrong = false;
      if (read && answer) {
        // Compare on the same basis: if the model read a different column, convert both to per 100.
        const sameBasis = read.basis === answer.basis;
        for (const f of FIELDS) {
          const a = sameBasis ? read[f] : per100(read, f);
          const b = sameBasis ? answer[f] : per100(answer, f);
          const v = sameValue(f, a === null ? null : String(a), b === null ? null : String(b));
          verdicts[f] = v;
          if (v === 'right') tally.right += 1;
          if (v === 'wrong') { tally.wrong += 1; anyWrong = true; }
          if (v === 'missed') { tally.missed += 1; anyWrong = true; }
          if (v === 'extra') { tally.extra += 1; anyWrong = true; }
        }
        if (!anyWrong) tally.allRight += 1;
        const agree = entriesAgree(
          { basis: read.basis, servingSize: read.serving_size, values: read },
          { basis: answer.basis, servingSize: answer.serving_size, values: answer },
        );
        if (agree === false) note = note ? `${note}; disagrees with pack` : 'disagrees with pack';
      }
      if (checks.hard.length) { tally.flagged += 1; if (anyWrong) tally.flaggedWrong += 1; } else if (anyWrong) tally.wrongNotFlagged += 1;

      rows.push([
        m.id, prod.barcode, prod.images.length, read?.product_name ?? '', read?.basis ?? '', read?.serving_size ?? '',
        ...FIELDS.map((f) => read?.[f] ?? ''), ...FIELDS.map((f) => verdicts[f] ?? ''),
        checks.hard.join(' '), checks.soft.join(' '), (read?.unreadable || []).join(' '), (read?.ins_numbers || []).join(' '),
        usage?.input_tokens ?? '', usage?.output_tokens ?? '', cost.toFixed(5), seconds.toFixed(1), note,
      ]);
      console.log(`${m.id} ${prod.barcode}: ${note || (anyWrong ? 'some values differ' : answer ? 'all values right' : 'read, no answer key')} ($${cost.toFixed(4)}, ${seconds.toFixed(1)} s)`);
    }
    const compared = tally.right + tally.wrong + tally.missed + tally.extra;
    summary.push([
      `## ${m.id}`,
      `Products ${tally.products}, refused ${tally.refused}, errors ${tally.errors}`,
      `Values right ${tally.right} of ${compared} (${compared ? ((100 * tally.right) / compared).toFixed(1) : '-'}%), wrong ${tally.wrong}, missed ${tally.missed}, extra ${tally.extra}`,
      `Products with every value right ${tally.allRight}`,
      `Caught by the number checks ${tally.flagged} (of which really wrong ${tally.flaggedWrong}); wrong but not caught ${tally.wrongNotFlagged}`,
      `Tokens in ${tally.inputTokens.toLocaleString()}, out ${tally.outputTokens.toLocaleString()}`,
      `Cost $${tally.cost.toFixed(4)} total, $${(tally.cost / Math.max(1, tally.products)).toFixed(5)} per product, $${((1000 * tally.cost) / Math.max(1, tally.products)).toFixed(2)} per 1,000 products`,
      `Average time ${(tally.seconds / Math.max(1, tally.products)).toFixed(1)} s per product`,
      '',
    ].join('\n'));
  }

  const head = ['model', 'barcode', 'photos', 'name_read', 'basis_read', 'serving_read',
    ...FIELDS, ...FIELDS.map((f) => `${f}_result`), 'checks_failed', 'checks_worth_a_look', 'unreadable', 'ins_numbers',
    'input_tokens', 'output_tokens', 'cost_usd', 'seconds', 'note'];
  const csvPath = path.join(RESULTS, `run-${stamp}.csv`);
  fs.writeFileSync(csvPath, [head, ...rows].map((r) => r.map(csv).join(',')).join('\n') + '\n');
  const mdPath = path.join(RESULTS, `summary-${stamp}.md`);
  fs.writeFileSync(mdPath, `# Label reader test, ${new Date().toISOString().slice(0, 10)}\n\n${summary.join('\n')}`);
  console.log(`\n${summary.join('\n')}\nSaved ${path.relative(here, csvPath)} and ${path.relative(here, mdPath)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
