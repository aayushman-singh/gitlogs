import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The classifier is CommonJS; load it (and read the corpus) the same way the
// rest of the suite bridges into src/.
const require = createRequire(import.meta.url);
const { scoreCommit } = require('../src/commitIntelligence');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.join(__dirname, '..', 'eval', 'golden-commits.json');

const MIN_SCORE = 40;
const ACCURACY_FLOOR = 0.85;
const PRECISION_FLOOR = 0.85;

function loadCorpus() {
  const raw = fs.readFileSync(CORPUS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.commits) || parsed.commits.length === 0) {
    throw new Error(`Golden corpus at ${CORPUS_PATH} has no commits`);
  }
  return parsed.commits;
}

describe('eval: golden corpus regression gate', () => {
  const commits = loadCorpus();

  it('corpus is a meaningful size with both classes represented', () => {
    expect(commits.length).toBeGreaterThanOrEqual(24);
    const worthy = commits.filter((c) => c.label === 'worthy').length;
    const noise = commits.filter((c) => c.label === 'noise').length;
    expect(worthy).toBeGreaterThan(0);
    expect(noise).toBeGreaterThan(0);
  });

  it('classifier meets the precision and accuracy floor on the golden corpus', () => {
    const counts = { TP: 0, FP: 0, TN: 0, FN: 0 };
    for (const c of commits) {
      const predictedWorthy = scoreCommit(c, { minScore: MIN_SCORE }).worthy;
      const expectedWorthy = c.label === 'worthy';
      if (predictedWorthy && expectedWorthy) counts.TP += 1;
      else if (predictedWorthy && !expectedWorthy) counts.FP += 1;
      else if (!predictedWorthy && !expectedWorthy) counts.TN += 1;
      else counts.FN += 1;
    }

    const total = counts.TP + counts.FP + counts.TN + counts.FN;
    const accuracy = (counts.TP + counts.TN) / total;
    const precision = counts.TP + counts.FP === 0 ? 0 : counts.TP / (counts.TP + counts.FP);

    // Reported so a regression shows the actual numbers in CI output.
    console.log(`eval gate → accuracy=${accuracy.toFixed(3)} precision=${precision.toFixed(3)}`, counts);

    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_FLOOR);
    expect(precision).toBeGreaterThanOrEqual(PRECISION_FLOOR);
  });
});
