# Label reader test (20 photos)

A one-off test from the data plan (27 Nov 2026). It answers three questions before we build anything:

1. Can Claude read Thai nutrition labels from phone photos accurately?
2. Do the app's number checks (`checks.js`) catch the values it reads wrongly?
3. What does it really cost per product, on Claude Haiku 5.5 and Claude Sonnet 5.5?

This folder is not part of the app; the app never loads anything from it. Photos, the answer key and results stay
out of git (see `.gitignore`).

## What you need

- **20 products** from 7-Eleven, a mix: snacks, instant noodles, drinks, dairy, a sauce, an own brand.
  Include a few hard ones (shiny packs, curved bottles, small print).
- **Photos**: one folder per product in `photos/`, named by barcode, with 1 to 3 photos in it
  (the nutrition table, the ingredients, the front). Ordinary phone photos, no editing.
  ```
  photos/8850987101021/table.jpg
  photos/8850987101021/front.jpg
  ```
- **Answer key**: copy `answer-key.template.csv` to `answer-key.csv` and type each product's values exactly
  as printed on the pack (leave a box empty when the pack doesn't print it). This is what the test marks
  the readings against.
- **An Anthropic API key** (see below). Nothing is sent to the API until the key is set.

## The API key, safely

The key is read only from the `ANTHROPIC_API_KEY` environment variable. **Never** put it in a file in this
folder, in the repo, or in a chat message.

1. Create an account at console.anthropic.com, add a small credit ($5 is plenty), and under Limits set a
   monthly spend limit (for example $5) so a mistake can't cost more.
2. Create a key named `label-reader-test`. Copy it once, straight into one of the places below.
3. Delete the key in the Console after the test.

Where the key goes, pick one:

- **In the project's cloud environment** (easiest, Claude runs the test for you): Project settings, Cloud
  environment, the gear beside the environment, add an environment variable `ANTHROPIC_API_KEY`. Note that
  anyone who uses this environment, and commands in its sessions, can read it, which is why the spend
  limit and deleting the key afterwards matter.
- **On your own computer** (the key never leaves it): in Terminal, in this folder,
  ```
  npm install
  read -s ANTHROPIC_API_KEY && export ANTHROPIC_API_KEY   # paste the key, it isn't shown
  node run.mjs
  ```

## Running it

```
npm install
node run.mjs --dry-run          # checks photos and answer key, prints the expected cost, no API calls
node run.mjs                    # both models
node run.mjs --models haiku     # one model only
```

Expected cost for 20 products with 2 photos each: about 2 cents on Haiku 5.5 and about 35 cents on
Sonnet 5.5, well under $1 together. The script stops if there are more than 25 product folders.

## What comes out

`results/run-<time>.csv` has one row per product per model: the values read, right / wrong / missed for
each one (within 10% or 1 g, energy 10 kcal, sodium 30 mg, the same rule the app uses for agreeing
entries), which number checks failed, tokens, cost and time.

`results/summary-<time>.md` has the totals per model: share of values right, products with every value
right, how many wrong readings the number checks caught, and cost per product and per 1,000 products.

## How it reads a label

Photos are shrunk to 1,568 px on the long side (what the app would send) and sent with an instruction to
copy numbers exactly as printed, never estimate, and return nothing for a value it can't read. The answer
comes back in a fixed shape (structured output), so there is no free text to parse.
