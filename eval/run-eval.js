/**
 * Evaluation harness for the commit-intelligence worthiness classifier.
 *
 * WHAT IT DOES
 *   Loads eval/golden-commits.json (a human-labeled corpus where each commit is
 *   tagged "worthy" or "noise"), runs scoreCommit() from src/commitIntelligence.js
 *   over every commit, treats "worthy" as the positive class, and reports
 *   TP/FP/TN/FN, precision, recall, F1, accuracy, a confusion matrix, and a
 *   prominent list of every misclassification. Exit code is 0 iff accuracy clears
 *   a threshold (default 0.85) so this can gate CI.
 *
 *   Run:    node eval/run-eval.js
 *   Args:   --min-score=<n>   classifier worthiness cutoff (default 40)
 *           --threshold=<f>   accuracy gate, 0..1 (default 0.85)
 *   Env:    EVAL_MIN_SCORE, EVAL_ACCURACY_THRESHOLD  (overridden by args)
 *
 *   Deterministic and OFFLINE — no network, no API keys. The classifier under
 *   test is pure/LLM-free, so this harness is fully reproducible in CI.
 *
 * FAILURE BEHAVIOUR (per project rule: no silent fallbacks)
 *   Missing/unreadable/malformed corpus, a commit missing required fields, or an
 *   unknown label throws loudly with the offending index and value. The harness
 *   never substitutes defaults or skips bad rows.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FUTURE EXTENSION POINT — optional LLM-judge mode for tweet QUALITY
 * ─────────────────────────────────────────────────────────────────────────────
 *   This harness evaluates ONLY the deterministic triage decision (worthy vs
 *   noise). It does NOT evaluate the quality of the generated tweet text, because
 *   that requires the Gemini diff→tweet step, which is non-deterministic and
 *   needs an API key — both at odds with an offline CI gate.
 *
 *   A future quality eval would live BEHIND a flag and stay opt-in:
 *
 *     1. Extend the corpus: add a `goldenTweet` (the ideal human-written tweet)
 *        and a representative `diff` to each WORTHY commit.
 *     2. Gate on a key: only activate when GEMINI_API_KEY is set AND an explicit
 *        flag is passed (e.g. `node eval/run-eval.js --judge`). With no key, the
 *        harness stays exactly as it is today — deterministic, offline, no calls.
 *     3. Generate: feed each (commit, diff) to the real diff→tweet generator.
 *     4. Judge: send {diff, goldenTweet, generatedTweet} to an LLM judge with a
 *        rubric (factual accuracy, specificity, no hallucinated numbers, tone,
 *        length ≤ 280) and ask for a 1–5 score + short justification per axis.
 *        Report mean scores and flag any generated tweet that invents facts not
 *        present in the diff.
 *     5. Determinism: pin the judge model + temperature 0, log every prompt and
 *        raw judge response (rich context for debugging), and treat a missing key
 *        or judge error as a LOUD failure of judge-mode — never a silent skip.
 *
 *   Deliberately NOT implemented here: no network code exists in this file. This
 *   block is the documented seam, nothing more.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { scoreCommit } = require('../src/commitIntelligence');

const CORPUS_PATH = path.join(__dirname, 'golden-commits.json');
const VALID_LABELS = new Set(['worthy', 'noise']);

// ── Config (args override env override defaults) ───────────────────────────────
function readConfig(argv) {
  const args = new Map();
  for (const a of argv) {
    const m = a.match(/^--([\w-]+)=(.*)$/);
    if (m) args.set(m[1], m[2]);
  }
  const minScore = Number(args.get('min-score') ?? process.env.EVAL_MIN_SCORE ?? 40);
  const threshold = Number(args.get('threshold') ?? process.env.EVAL_ACCURACY_THRESHOLD ?? 0.85);
  if (!Number.isFinite(minScore)) throw new Error(`Invalid min-score: ${args.get('min-score')}`);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`Invalid threshold (must be 0..1): ${args.get('threshold')}`);
  }
  return { minScore, threshold };
}

// ── Load + validate corpus (fail loudly with rich context) ─────────────────────
function loadCorpus() {
  let raw;
  try {
    raw = fs.readFileSync(CORPUS_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Golden corpus not found / unreadable at ${CORPUS_PATH}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Golden corpus at ${CORPUS_PATH} is not valid JSON: ${err.message}`);
  }

  const commits = parsed.commits;
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error(`Golden corpus at ${CORPUS_PATH} must have a non-empty "commits" array; got ${typeof commits}`);
  }

  commits.forEach((c, i) => {
    const where = `commits[${i}] (id=${c && c.id})`;
    if (typeof c !== 'object' || c === null) throw new Error(`${where}: not an object`);
    if (typeof c.id !== 'string' || !/^[0-9a-f]{7}$/.test(c.id)) {
      throw new Error(`${where}: "id" must be a 7-char hex string, got ${JSON.stringify(c.id)}`);
    }
    if (typeof c.message !== 'string' || c.message.length === 0) {
      throw new Error(`${where}: "message" must be a non-empty string`);
    }
    for (const field of ['added', 'modified', 'removed']) {
      if (!Array.isArray(c[field])) throw new Error(`${where}: "${field}" must be an array`);
    }
    if (!VALID_LABELS.has(c.label)) {
      throw new Error(`${where}: "label" must be one of ${[...VALID_LABELS].join('|')}, got ${JSON.stringify(c.label)}`);
    }
    if (typeof c.note !== 'string' || c.note.length === 0) {
      throw new Error(`${where}: "note" must be a non-empty string explaining the label`);
    }
  });

  return commits;
}

// ── Metrics ────────────────────────────────────────────────────────────────────
function evaluate(commits, minScore) {
  const rows = commits.map((c) => {
    const result = scoreCommit(c, { minScore });
    const expectedWorthy = c.label === 'worthy';
    const predictedWorthy = result.worthy;
    const correct = predictedWorthy === expectedWorthy;
    let outcome; // confusion-matrix cell (positive class = worthy)
    if (predictedWorthy && expectedWorthy) outcome = 'TP';
    else if (predictedWorthy && !expectedWorthy) outcome = 'FP';
    else if (!predictedWorthy && !expectedWorthy) outcome = 'TN';
    else outcome = 'FN';
    return {
      id: c.id,
      message: c.message,
      score: result.score,
      predictedWorthy,
      expectedLabel: c.label,
      correct,
      outcome,
      rationale: result.rationale,
      note: c.note,
    };
  });

  const counts = { TP: 0, FP: 0, TN: 0, FN: 0 };
  for (const r of rows) counts[r.outcome] += 1;

  const { TP, FP, TN, FN } = counts;
  const safeDiv = (n, d) => (d === 0 ? 0 : n / d);
  const precision = safeDiv(TP, TP + FP);
  const recall = safeDiv(TP, TP + FN);
  const f1 = safeDiv(2 * precision * recall, precision + recall);
  const accuracy = safeDiv(TP + TN, TP + TN + FP + FN);

  return { rows, counts, precision, recall, f1, accuracy };
}

// ── Reporting ──────────────────────────────────────────────────────────────────
const pct = (x) => (x * 100).toFixed(1) + '%';
const num = (x) => x.toFixed(3);

function printReport({ rows, counts, precision, recall, f1, accuracy }, { minScore, threshold }) {
  const pad = (s, n) => String(s).padEnd(n);
  const pre = (s, n) => String(s).padStart(n);

  console.log('');
  console.log('═'.repeat(96));
  console.log(`  COMMIT-INTELLIGENCE EVAL  —  minScore=${minScore}  positive class = "worthy"`);
  console.log('═'.repeat(96));
  console.log('');
  console.log(
    `  ${pad('SHA', 9)}${pre('SCORE', 6)}  ${pad('PRED', 6)}${pad('EXPECT', 8)}${pad('OK', 4)}RATIONALE`,
  );
  console.log('  ' + '─'.repeat(92));
  for (const r of rows) {
    console.log(
      `  ${pad(r.id, 9)}${pre(r.score, 6)}  ${pad(r.predictedWorthy ? 'worthy' : 'noise', 6)}` +
        `${pad(r.expectedLabel, 8)}${pad(r.correct ? '✓' : '✗', 4)}${r.rationale}`,
    );
  }

  console.log('');
  console.log('─'.repeat(96));
  console.log('  CONFUSION MATRIX (positive = worthy)');
  console.log('─'.repeat(96));
  console.log('                     predicted worthy   predicted noise');
  console.log(`    actual worthy   ${pre('TP=' + counts.TP, 16)}   ${pre('FN=' + counts.FN, 15)}`);
  console.log(`    actual noise    ${pre('FP=' + counts.FP, 16)}   ${pre('TN=' + counts.TN, 15)}`);

  console.log('');
  console.log('─'.repeat(96));
  console.log('  METRICS');
  console.log('─'.repeat(96));
  console.log(`    precision : ${num(precision)}  (${pct(precision)})   of commits flagged worthy, how many really were`);
  console.log(`    recall    : ${num(recall)}  (${pct(recall)})   of truly-worthy commits, how many we caught`);
  console.log(`    f1        : ${num(f1)}  (${pct(f1)})`);
  console.log(`    accuracy  : ${num(accuracy)}  (${pct(accuracy)})   gate threshold = ${num(threshold)}`);

  const misses = rows.filter((r) => !r.correct);
  console.log('');
  console.log('─'.repeat(96));
  console.log(`  MISCLASSIFICATIONS  (${misses.length})  ← tune the classifier on these`);
  console.log('─'.repeat(96));
  if (misses.length === 0) {
    console.log('    (none)');
  } else {
    for (const r of misses) {
      const kind = r.outcome === 'FP' ? 'FALSE POSITIVE (noise scored worthy)' : 'FALSE NEGATIVE (worthy scored noise)';
      console.log('');
      console.log(`    [${r.outcome}] ${kind}`);
      console.log(`      sha      : ${r.id}`);
      console.log(`      message  : ${r.message.split('\n')[0]}`);
      console.log(`      score    : ${r.score}  (predicted ${r.predictedWorthy ? 'worthy' : 'noise'}, expected ${r.expectedLabel})`);
      console.log(`      rationale: ${r.rationale}`);
      console.log(`      corpus   : ${r.note}`);
    }
  }
  console.log('');
}

// ── Main ────────────────────────────────────────────────────────────────────────
function main() {
  const config = readConfig(process.argv.slice(2));
  const commits = loadCorpus();
  const results = evaluate(commits, config.minScore);
  printReport(results, config);

  const passed = results.accuracy >= config.threshold;
  console.log('═'.repeat(96));
  if (passed) {
    console.log(`  RESULT: PASS — accuracy ${pct(results.accuracy)} >= threshold ${pct(config.threshold)}`);
  } else {
    console.log(`  RESULT: FAIL — accuracy ${pct(results.accuracy)} < threshold ${pct(config.threshold)}`);
  }
  console.log('═'.repeat(96));
  console.log('');
  process.exit(passed ? 0 : 1);
}

main();
