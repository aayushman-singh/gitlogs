import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ci = require('../src/commitIntelligence');

const commit = (over) => ({ id: 'abcdef1234567', message: '', added: [], modified: [], removed: [], ...over });

describe('commitIntelligence.scoreCommit', () => {
  it('rates a substantive feat with source changes as worthy', () => {
    const r = ci.scoreCommit(commit({
      message: 'feat(payments): add idempotency keys to POST /charges',
      added: ['src/middleware/idempotency.js'],
      modified: ['src/routes/charges.js'],
    }));
    expect(r.worthy).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.type).toBe('feat');
    expect(r.scope).toBe('payments');
    expect(r.signals.some((s) => s.label === 'source')).toBe(true);
  });

  it('skips a dependency bump (lockfiles only)', () => {
    const r = ci.scoreCommit(commit({
      message: 'chore(deps): bump lockfile',
      modified: ['pnpm-lock.yaml'],
    }));
    expect(r.worthy).toBe(false);
    expect(r.signals.some((s) => s.label === 'deps-only')).toBe(true);
  });

  it('skips merge commits', () => {
    const r = ci.scoreCommit(commit({ message: 'Merge branch "main" into feature', modified: ['src/a.js'] }));
    expect(r.worthy).toBe(false);
    expect(r.signals.some((s) => s.label === 'merge')).toBe(true);
  });

  it('skips wip / scratch commits', () => {
    expect(ci.scoreCommit(commit({ message: 'wip', modified: ['src/x.js'] })).worthy).toBe(false);
    expect(ci.scoreCommit(commit({ message: 'fixup! something', modified: ['src/x.js'] })).worthy).toBe(false);
  });

  it('skips version-bump / release commits', () => {
    expect(ci.scoreCommit(commit({ message: 'v1.4.2', modified: ['package.json'] })).worthy).toBe(false);
    expect(ci.scoreCommit(commit({ message: 'bump version to 2.0.0', modified: ['package.json'] })).worthy).toBe(false);
  });

  it('skips vague one-word subjects', () => {
    expect(ci.scoreCommit(commit({ message: 'update', modified: ['notes.txt'] })).worthy).toBe(false);
    expect(ci.scoreCommit(commit({ message: 'changes', modified: ['notes.txt'] })).worthy).toBe(false);
  });

  it('penalizes cosmetic/formatting-only changes', () => {
    const r = ci.scoreCommit(commit({ message: 'fix typo in readme', modified: ['README.md'] }));
    expect(r.worthy).toBe(false);
    expect(r.signals.some((s) => s.label === 'cosmetic')).toBe(true);
  });

  it('always returns a rationale and clamps score to 0..100', () => {
    const r = ci.scoreCommit(commit({ message: 'feat: x', modified: ['src/a.js'] }));
    expect(typeof r.rationale).toBe('string');
    expect(r.rationale.length).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('respects a custom minScore threshold', () => {
    const c = commit({ message: 'docs: explain the queue retry behavior in detail', modified: ['docs/x.md'] });
    expect(ci.scoreCommit(c, { minScore: 90 }).worthy).toBe(false);
    expect(ci.scoreCommit(c, { minScore: 10 }).worthy).toBe(true);
  });
});

describe('commitIntelligence.triagePush', () => {
  it('splits a mixed push into worthy and skipped with rationale', () => {
    const t = ci.triagePush([
      commit({ id: '1111111', message: 'feat(api): add pagination to /users', modified: ['src/api/users.js'] }),
      commit({ id: '2222222', message: 'chore: bump deps', modified: ['pnpm-lock.yaml'] }),
      commit({ id: '3333333', message: 'wip', modified: ['src/x.js'] }),
      commit({ id: '4444444', message: 'fix(auth): reject expired tokens before DB lookup', modified: ['src/auth.js'] }),
    ]);
    expect(t.worthy.map((s) => s.sha)).toEqual(['1111111', '4444444']);
    expect(t.skipped.map((s) => s.sha)).toEqual(['2222222', '3333333']);
    expect(t.scored.every((s) => s.rationale)).toBe(true);
    expect(t.scored.every((s) => typeof s.id === 'string')).toBe(true); // full SHA carried
  });

  it('throws on malformed input rather than silently coercing', () => {
    expect(() => ci.triagePush(null)).toThrow();
    expect(() => ci.scoreCommit({ id: 'abc', message: 5 })).toThrow();
    expect(() => ci.scoreCommit({ id: 'abc', message: 'feat: x', added: 'nope' })).toThrow();
  });
});
