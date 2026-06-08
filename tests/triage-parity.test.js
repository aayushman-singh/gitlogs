import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards against drift between the backend scorer (src/commitIntelligence.js,
// CommonJS) and its browser mirror (frontend/src/demo/commitTriage.js, ESM).
// Both must produce identical scores/verdicts for the same input.
const require = createRequire(import.meta.url);
const backend = require('../src/commitIntelligence');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpus = require(path.join(__dirname, '..', 'eval', 'golden-commits.json')).commits;

describe('frontend triage port mirrors the backend exactly', () => {
  it('produces identical score + verdict for every golden-corpus commit', async () => {
    const frontend = await import('../frontend/src/demo/commitTriage.js');
    for (const c of corpus) {
      const b = backend.scoreCommit(c, { minScore: 40 });
      const f = frontend.scoreCommit(c, { minScore: 40 });
      expect({ id: c.id, score: f.score, worthy: f.worthy, rationale: f.rationale })
        .toEqual({ id: c.id, score: b.score, worthy: b.worthy, rationale: b.rationale });
    }
  });

  it('triagePush worthy/skipped partition matches across implementations', async () => {
    const frontend = await import('../frontend/src/demo/commitTriage.js');
    const b = backend.triagePush(corpus, { minScore: 40 });
    const f = frontend.triagePush(corpus, { minScore: 40 });
    expect(f.worthy.map((s) => s.id)).toEqual(b.worthy.map((s) => s.id));
    expect(f.skipped.map((s) => s.id)).toEqual(b.skipped.map((s) => s.id));
  });
});
