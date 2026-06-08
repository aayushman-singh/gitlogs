/**
 * Evaluation harness for the commit-intelligence worthiness classifier.
 *
 * Loads eval/golden-commits.json (each commit labeled "worthy" or "noise"), runs
 * scoreCommit() over every commit with "worthy" as the positive class, and
 * reports TP/FP/TN/FN, precision, recall, F1, accuracy, a confusion matrix, and
 * every misclassification. Gates CI: exit 0 iff accuracy, precision, recall, and
 * F1 all clear their thresholds.
 *
 *   Run:    node eval/run-eval.js   (or: pnpm eval)
 *   Args:   --min-score=<n>   classifier cutoff (default 40)
 *           --threshold=<f>   accuracy gate (default 0.85)
 *           --precision=<f> --recall=<f> --f1=<f>  (each default 0.85)
 *   Env:    EVAL_MIN_SCORE, EVAL_ACCURACY_THRESHOLD (overridden by args)
 *
 * Deterministic and OFFLINE — no network, no API keys; fully reproducible in CI.
 * Malformed corpus / missing fields / unknown labels throw loudly with the
 * offending index (no silent fallbacks, no skipped rows).
 *
 * A future opt-in LLM-judge mode for tweet *quality* (diff→tweet) is described in
 * DECISIONS.md; it is intentionally NOT implemented here — this file has no
 * network code and stays a deterministic gate.
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
  const precisionMin = Number(args.get('precision') ?? 0.85);
  const recallMin = Number(args.get('recall') ?? 0.85);
  const f1Min = Number(args.get('f1') ?? 0.85);
  if (!Number.isFinite(minScore)) throw new Error(`Invalid min-score: ${args.get('min-score')}`);
  for (const [name, v] of [['threshold', threshold], ['precision', precisionMin], ['recall', recallMin], ['f1', f1Min]]) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`Invalid ${name} (must be 0..1): ${v}`);
  }
  return { minScore, threshold, precisionMin, recallMin, f1Min };
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

  // Gate on ALL of accuracy/precision/recall/F1 — accuracy alone can hide a
  // classifier that spams false positives on an imbalanced corpus.
  const gates = [
    ['accuracy', results.accuracy, config.threshold],
    ['precision', results.precision, config.precisionMin],
    ['recall', results.recall, config.recallMin],
    ['f1', results.f1, config.f1Min],
  ];
  const failures = gates.filter(([, v, min]) => !(v >= min));
  const passed = failures.length === 0;
  console.log('═'.repeat(96));
  if (passed) {
    console.log(`  RESULT: PASS — accuracy/precision/recall/F1 all >= their gates`);
  } else {
    for (const [name, v, min] of failures) {
      console.log(`  RESULT: FAIL — ${name} ${pct(v)} < gate ${pct(min)}`);
    }
  }
  console.log('═'.repeat(96));
  console.log('');
  process.exit(passed ? 0 : 1);
}

main();
