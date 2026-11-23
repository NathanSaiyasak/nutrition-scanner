// score-placeholder.js — SAMPLE SCORE ONLY.
// The scoring method is NOT agreed yet (CLAUDE.md: "No score until the scoring method is agreed").
// Nathan's v0.3 design has a score, so this file gives a clearly labelled stand-in. All score logic
// lives here: to change or remove the score, change only this file (and the score line in index.html).
//
// Stand-in rule: start at 100; each "High" fact −20, each "Medium" fact −10, each good source of
// protein or fibre +5; keep between 0 and 100. Hidden when more than 2 key facts are missing.

export const SCORE_LABEL = 'Sample score · method not agreed yet';

export function sampleScore(view) {
  if (view.missingCount > 2 || view.judged === false) return null;
  let score = 100;
  for (const item of view.items) {
    if (item.level === 'high') score -= 20;
    else if (item.level === 'medium') score -= 10;
    else if (item.level === 'good' && (item.key === 'protein' || item.key === 'fibre')) score += 5;
  }
  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 75 ? ['Good', 'good']
    : score >= 50 ? ['OK', 'warn']
      : score >= 25 ? ['Poor', 'bad']
        : ['Bad', 'bad'];
  return { score, verdict: verdict[0], tone: verdict[1] };
}
