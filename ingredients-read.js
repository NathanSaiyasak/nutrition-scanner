// ingredients-read.js — finds additives in an ingredients list (28 Nov 2026, ranked additives).
// Thai labels name additives in three ways, and all three count:
//   1. an INS or E number: "INS 211", "INS211", "E150d", "INS 296, 327, 330" (numbers listed after one INS)
//   2. a Thai name: "ซูคราโลส", "โซเดียมเบนโซเอต", "ผงชูรส"
//   3. an English name: "sucralose", "sodium benzoate", "monosodium glutamate"
// Returns additive tags the score reads, like "ins:211" or "ins:150d". No other module is needed here,
// so lookup.js and shared-db.js can both use it.

// Additive names in words → INS number. Several spellings because labels (and photo-read text) vary.
const WORDS = [
  ['951', /aspartame|แอสปาร์แตม|แอสปาแตม|แอสปาเตม|เอสปาเตม/i],
  ['950', /acesulfame|อะซีซัลเฟม|แอซีซัลเฟม|เอซีซัลเฟม|แอซิซัลเฟ|อะเซซัลเฟม/i],
  ['955', /sucralose|ซูคราโลส|ซูกราโลส/i],
  ['952', /cyclamate|ไซคลาเมต|ไซคลาเมท/i],
  ['954', /saccharin|ขัณฑสกร|แซคคาริน|แซ็กคาริน/i],
  ['960', /steviol|stevia|สตีวิออล|สตีเวีย|หญ้าหวาน/i],
  ['961', /neotame|นีโอแตม/i],
  ['968', /erythritol|อีริทริทอล|อิริทริทอล/i],
  ['210', /benzoic acid|กรดเบนโซอิก/i],
  ['211', /sodium benzoate|โซเดียมเบนโซเอต|โซเดียมเบนโซเอท/i],
  ['212', /potassium benzoate|โพแทสเซียมเบนโซเอต/i],
  ['249', /potassium nitrite|โพแทสเซียมไนไตรต์/i],
  ['250', /sodium nitrite|โซเดียมไนไตรต์|โซเดียมไนไตรท์/i],
  ['251', /sodium nitrate|โซเดียมไนเตรต|โซเดียมไนเตรท/i],
  ['252', /potassium nitrate|โพแทสเซียมไนเตรต/i],
  ['171', /titanium dioxide|ไทเทเนียมไดออกไซด์/i],
  ['320', /\bBHA\b|butylated hydroxyanisole/i],
  ['321', /\bBHT\b|butylated hydroxytoluene/i],
  ['319', /\bTBHQ\b|tert-butylhydroquinone/i],
  ['924', /potassium bromate|โพแทสเซียมโบรเมต/i],
  ['102', /tartrazine|ทาร์ทราซีน/i],
  ['104', /quinoline yellow|ควิโนลีนเยลโลว์/i],
  ['110', /sunset yellow|ซันเซ็ตเยลโลว์|ซันเซตเยลโลว์/i],
  ['122', /carmoisine|azorubine|คาร์โมอีซีน/i],
  ['124', /ponceau|ปองโซ/i],
  ['129', /allura red|อัลลูราเรด/i],
  ['220', /sulphur dioxide|sulfur dioxide|ซัลเฟอร์ไดออกไซด์/i],
  ['223', /sodium metabisulphite|sodium metabisulfite|โซเดียมเมตาไบซัลไฟต์/i],
  ['338', /phosphoric acid|กรดฟอสฟอริก/i],
  ['407', /carrageenan|คาราจีแนน/i],
  ['466', /carboxymethyl ?cellulose|คาร์บอกซีเมทิลเซลลูโลส/i],
  ['433', /polysorbate|โพลีซอร์เบต/i],
  ['471', /mono-? ?and diglycerides|โมโน ?-? ?และไดกลีเซอไรด์/i],
  ['621', /monosodium (?:l-)?glutamate|โมโนโซเดียม ?(?:แอล-?)?กลูตาเมต|ผงชูรส/i],
  ['627', /guanylate|กัวไนเลต|กัวนีเลท|กัวนิเลต/i],
  ['631', /inosinate|ไอโนซิเนต|ไอโนซิเนท/i],
  ['635', /ribonucleotide|ไรโบนิวคลีโอไทด์|ไรโบนิวคลีโอไตด์|ไรโบนิวคลิโอไตด์/i],
];

// "INS 211", "E-211", "INS150d", then any more numbers in the same list ("INS 296, 327, 330(i)").
const INS_RUN = /\b(?:INS|E)\s*\.?\s*-?\s*(\d{3,4}[a-d]?)((?:\s*\([ivx\d]+\))?(?:\s*(?:,|และ|and)\s*\d{3,4}[a-d]?(?:\s*\([ivx\d]+\))?)*)/gi;

/** Additive tags ("ins:211") found in an ingredients list and an optional INS box. */
export function readAdditives(ingredients, insBox) {
  const codes = new Set();
  const text = String(ingredients || '');
  for (const m of text.matchAll(INS_RUN)) {
    codes.add(tag(m[1]));
    for (const more of (m[2] || '').matchAll(/(?<![\d(])(\d{3,4}[a-d]?)(?![\d)])/g)) codes.add(tag(more[1]));
  }
  for (const [code, re] of WORDS) if (re.test(text)) codes.add(`ins:${code}`);
  // In the INS box every three or four digit number counts ("211, 621", "E102", "INS 150d").
  for (const m of String(insBox || '').matchAll(/(?<!\d)(\d{3,4}[a-d]?)(?![\da-z])/gi)) codes.add(tag(m[1]));
  return [...codes];
}

function tag(code) {
  return `ins:${code.toLowerCase()}`;
}
