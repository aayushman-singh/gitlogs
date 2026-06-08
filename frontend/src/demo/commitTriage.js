/**
 * Mirrors src/commitIntelligence.js — keep in sync.
 *
 * ESM port of the deterministic commit-intelligence scorer so the keyless
 * /demo can run the same triage algorithm live in the browser — no backend,
 * no network. Every constant and signal delta below is copied 1:1 from the
 * CommonJS backend module so identical input yields an identical score; a
 * parity test (tests/triage-parity.test.js) guards against drift.
 *
 * Pure functions, no Node/IO dependencies.
 */

// Conventional-commit type → base worthiness. The type is the single strongest
// signal of whether a change is user-facing news.
const TYPE_BASE = {
  feat: 60,
  fix: 52,
  perf: 50,
  revert: 40,
  refactor: 30,
  build: 18,
  ci: 12,
  docs: 22,
  test: 15,
  style: 8,
  chore: 10,
};
const DEFAULT_BASE = 34; // non-conventional message: judged on substance below

const LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'go.sum',
  'cargo.lock',
  'poetry.lock',
  'composer.lock',
  'gemfile.lock',
];

const ASSET_RE = /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp4|mp3|pdf|lock|map|min\.js|min\.css|snap)$/i;
const SOURCE_RE = /\.(js|jsx|ts|tsx|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|ex|exs|vue|svelte)$/i;
const GENERATED_RE = /(dist\/|build\/|\.min\.|node_modules\/|vendor\/|__snapshots__\/|\.generated\.)/i;
const TEST_RE = /(\.(test|spec)\.[jt]sx?$)|((^|\/)(tests?|__tests__|specs?)\/)/i;
const INTERNAL_RE = /\b(rename|reorg|reorganize|reorder|moved?|extract|inline|tidy|clean\s?up|cleanup|internal|formatting|whitespace|gofmt|prettier|lint)\b/i;
const VAGUE_HARD_CAP = 35;

const TRIVIAL_SUBJECTS = new Set([
  'update', 'updates', 'fix', 'fixes', 'changes', 'change', 'stuff', 'misc',
  'wip', 'tmp', 'temp', 'test', 'cleanup', 'minor', 'tweaks', 'tweak', '.', '..',
]);

function lc(s) {
  return (s || '').toLowerCase();
}

export function parseConventional(message) {
  const firstLine = (message || '').split('\n')[0].trim();
  const m = firstLine.match(/^(\w+)(\([^)]+\))?(!)?:\s*(.+)$/);
  if (m) {
    return {
      type: m[1].toLowerCase(),
      scope: m[2] ? m[2].replace(/[()]/g, '') : null,
      breaking: Boolean(m[3]),
      subject: m[4].trim(),
    };
  }
  return { type: null, scope: null, breaking: false, subject: firstLine };
}

function allFiles(commit) {
  for (const k of ['added', 'modified', 'removed']) {
    if (commit[k] !== undefined && !Array.isArray(commit[k])) {
      throw new Error(`commit ${commit.id}: "${k}" must be an array, got ${typeof commit[k]}`);
    }
  }
  return [
    ...(commit.added || []),
    ...(commit.modified || []),
    ...(commit.removed || []),
  ];
}

function isMerge(commit) {
  const msg = lc(commit.message);
  return /^merge\b/.test(msg) || /^merged\b/.test(msg);
}

/**
 * Score a single commit's tweet-worthiness.
 * @returns {{score:number, worthy:boolean, type:string|null, scope:string|null,
 *            signals:Array<{label:string,delta:number,detail:string}>, rationale:string}}
 */
export function scoreCommit(commit, options = {}) {
  if (!commit || typeof commit !== 'object') {
    throw new Error(`scoreCommit: expected a commit object, got ${commit === null ? 'null' : typeof commit}`);
  }
  if (typeof commit.id !== 'string' || typeof commit.message !== 'string') {
    throw new Error(`scoreCommit: commit needs string id and message (id=${JSON.stringify(commit.id)})`);
  }
  const minScore = options.minScore ?? 40;
  const { type, scope, breaking, subject } = parseConventional(commit.message);
  const files = allFiles(commit);
  const fileCount = files.length;
  const signals = [];
  const add = (label, delta, detail) => {
    if (delta !== 0) signals.push({ label, delta, detail });
  };

  // --- Base: commit type -----------------------------------------------------
  let score = type && type in TYPE_BASE ? TYPE_BASE[type] : DEFAULT_BASE;
  signals.push({
    label: 'base',
    delta: score,
    detail: type ? `conventional type "${type}"` : 'no conventional type — judged on substance',
  });

  if (breaking) {
    add('breaking', 15, 'marked as a breaking change (!)');
    score += 15;
  }

  // --- Hard noise: merges ----------------------------------------------------
  if (isMerge(commit)) {
    add('merge', -60, 'merge commit — not original news');
    score -= 60;
  }

  // --- File-shape signals ----------------------------------------------------
  const lowerFiles = files.map((f) => lc(f));
  const onlyLockfiles =
    fileCount > 0 && lowerFiles.every((f) => LOCKFILES.some((l) => f.endsWith(l)));
  if (onlyLockfiles) {
    add('deps-only', -45, 'only lockfiles changed — dependency bump');
    score -= 45;
  }

  const onlyAssets = fileCount > 0 && files.every((f) => ASSET_RE.test(f));
  if (onlyAssets && !onlyLockfiles) {
    add('assets-only', -30, 'only assets/binary/generated files changed');
    score -= 30;
  }

  const onlyGenerated = fileCount > 0 && files.every((f) => GENERATED_RE.test(f));
  if (onlyGenerated) {
    add('generated-only', -25, 'only generated/build output changed');
    score -= 25;
  }

  const onlyTests = fileCount > 0 && files.every((f) => TEST_RE.test(f));
  if (onlyTests) {
    add('tests-only', -15, 'only test files changed — not user-facing news');
    score -= 15;
  }

  const touchesSource = files.some(
    (f) => SOURCE_RE.test(f) && !GENERATED_RE.test(f) && !TEST_RE.test(f)
  );
  if (touchesSource) {
    add('source', 12, 'touches application source code');
    score += 12;
  }

  if (fileCount > 50) {
    add('mass-change', -20, `${fileCount} files — likely a vendored/mass change`);
    score -= 20;
  } else if (fileCount >= 1 && fileCount <= 12) {
    add('focused', 6, `focused change (${fileCount} file${fileCount === 1 ? '' : 's'})`);
    score += 6;
  }

  // --- Message-quality signals ----------------------------------------------
  const subjLc = lc(subject);
  const subjWords = subjLc.split(/\s+/).filter(Boolean);

  const vagueHard = TRIVIAL_SUBJECTS.has(subjLc) || subjWords.length <= 1 || subject.length < 8;
  if (vagueHard) {
    add('vague', -22, `vague/contentless subject "${subject}"`);
    score -= 22;
  } else if (subject.length >= 20 && subjWords.length >= 4) {
    add('descriptive', 8, 'specific, descriptive subject');
    score += 8;
  }

  if (/^(refactor|chore|style)$/.test(type || '') && INTERNAL_RE.test(subjLc)) {
    add('internal', -18, 'internal-only change (rename/cleanup) — not user-facing news');
    score -= 18;
  }

  if (/\b(wip|do not merge|dnm|temp|tmp|squash|fixup)\b/i.test(subjLc)) {
    add('wip', -30, 'work-in-progress / scratch commit');
    score -= 30;
  }

  if (/\b(typo|whitespace|formatting|reformat|lint|prettier|eslint|gofmt)\b/i.test(subjLc) && fileCount <= 5) {
    add('cosmetic', -18, 'cosmetic/formatting-only change');
    score -= 18;
  }

  if (/^(bump|release|v?\d+\.\d+\.\d+)\b/i.test(subjLc) || /\bversion bump\b/i.test(subjLc)) {
    add('version-bump', -25, 'version bump / release tag commit');
    score -= 25;
  }

  if (scope) {
    add('scope', 3, `scoped to "${scope}"`);
    score += 3;
  }

  // --- Clamp + verdict -------------------------------------------------------
  if (vagueHard) score = Math.min(score, VAGUE_HARD_CAP);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const worthy = score >= minScore;

  return {
    id: commit.id, // full SHA — the safe identity/join key
    sha: commit.id.substring(0, 7), // short SHA for display only
    score,
    worthy,
    type,
    scope,
    signals,
    rationale: buildRationale({ worthy, score, type, signals }),
  };
}

function buildRationale({ worthy, score, type, signals }) {
  // Pick the most influential non-base signals for the human explanation.
  const ranked = signals
    .filter((s) => s.label !== 'base')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2)
    .map((s) => s.detail);
  const lead = worthy ? `Worthy (${score})` : `Skipped (${score})`;
  const because = ranked.length ? ` — ${ranked.join('; ')}` : ` — ${type ? `${type} change` : 'low-substance change'}`;
  return lead + because;
}

/**
 * Triage a whole push: score every commit, split worthy from skipped.
 * @param {Array} commits - GitHub webhook commit objects (must be an array)
 * @param {object} options - { minScore }
 */
export function triagePush(commits, options = {}) {
  if (!Array.isArray(commits)) {
    throw new Error(`triagePush: expected an array of commits, got ${typeof commits}`);
  }
  const minScore = options.minScore ?? 40;
  const scored = commits.map((c) => scoreCommit(c, { minScore }));
  const worthy = scored.filter((s) => s.worthy);
  const skipped = scored.filter((s) => !s.worthy);
  return { minScore, scored, worthy, skipped };
}

// exported for tests / transparency
export { TYPE_BASE, DEFAULT_BASE };
