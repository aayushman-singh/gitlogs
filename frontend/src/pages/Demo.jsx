import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_EXAMPLES, PERSONA_KEYS, TRIAGE_PUSH } from '../demo/demoData';
import { triagePush } from '../demo/commitTriage';

// Deterministic, dependency-free avatar: colored tile + initials derived from
// the handle. Keeps the demo fully offline (no dicebear / external fetch).
function avatarFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const parts = seed.split(/[-/]/).filter(Boolean);
  const initials = (parts[0]?.[0] || seed[0] || '?').toUpperCase()
    + (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase();
  return {
    initials,
    background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 60% 22%))`,
  };
}

// Render a unified diff with +/- line colouring.
function DiffView({ diff }) {
  const lines = diff.split('\n');
  return (
    <pre className="demo-diff" aria-label="git diff">
      <code>
        {lines.map((line, i) => {
          let cls = 'demo-diff-line';
          if (line.startsWith('+') && !line.startsWith('+++')) cls += ' is-add';
          else if (line.startsWith('-') && !line.startsWith('---')) cls += ' is-del';
          else if (line.startsWith('@@')) cls += ' is-hunk';
          else if (
            line.startsWith('diff ')
            || line.startsWith('index ')
            || line.startsWith('+++')
            || line.startsWith('---')
            || line.startsWith('new file')
          ) cls += ' is-meta';
          return (
            <span key={i} className={cls}>
              {line || ' '}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

function TweetCard({ example, thread }) {
  const avatar = avatarFor(example.avatarSeed);
  const displayName = example.author
    .split(/[-/]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
  return (
    <div className="demo-thread" aria-label="generated changelog thread">
      {thread.map((text, i) => (
        <article className="demo-tweet" key={i}>
          <div className="demo-tweet-avatar" style={{ background: avatar.background }} aria-hidden="true">
            {avatar.initials}
          </div>
          <div className="demo-tweet-body">
            <div className="demo-tweet-head">
              <span className="demo-tweet-name">{displayName}</span>
              <span className="demo-tweet-handle">@{example.author}</span>
              {thread.length > 1 && (
                <span className="demo-tweet-index">{i + 1}/{thread.length}</span>
              )}
            </div>
            <p className="demo-tweet-text">{text}</p>
            <div className="demo-tweet-meta">
              <span className={`demo-char-count${text.length > 280 ? ' is-over' : ''}`}>
                {text.length}/280
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// Stage 00 — Commit triage. Runs the REAL deterministic scorer (ported in
// commitTriage.js, mirroring src/commitIntelligence.js) live on the bundled
// push fixture. No network — every score and rationale is computed in-browser.
function TriageStage() {
  const { repoFullName, author, branch, commits } = TRIAGE_PUSH;
  const { scored, worthy } = useMemo(
    () => triagePush(commits, { minScore: 40 }),
    [commits],
  );

  return (
    <section className="demo-triage" aria-labelledby="stage-triage">
      <header className="demo-stage-head">
        <span className="demo-stage-num">00</span>
        <h2 id="stage-triage">Commit triage</h2>
      </header>
      <div className="demo-card demo-triage-card">
        <div className="demo-triage-head">
          <div className="demo-commit-repo">{repoFullName}</div>
          <div className="demo-triage-refs">
            <span className="demo-chip">{branch}</span>
            <span className="demo-chip">@{author}</span>
            <span className="demo-chip">{commits.length} commits pushed</span>
          </div>
          <p className="demo-triage-summary">
            <strong>{worthy.length}</strong> of <strong>{commits.length}</strong>{' '}
            commits worth tweeting — the rest are noise.
          </p>
        </div>
        <ul className="demo-triage-list">
          {scored.map((c) => (
            <li
              key={c.sha}
              className={`demo-triage-item${c.worthy ? ' is-worthy' : ' is-skipped'}`}
            >
              <span
                className={`demo-triage-score${c.worthy ? ' is-worthy' : ' is-skipped'}`}
                aria-label={`score ${c.score} of 100`}
              >
                {c.score}
              </span>
              <div className="demo-triage-body">
                <div className="demo-triage-msg-row">
                  <code className="demo-triage-sha">{c.sha}</code>
                  <span className="demo-triage-msg">
                    {commits.find((x) => x.id.startsWith(c.sha))?.message}
                  </span>
                  <span
                    className={`demo-triage-pill${c.worthy ? ' is-worthy' : ' is-skipped'}`}
                  >
                    {c.worthy ? 'WORTHY' : 'SKIPPED'}
                  </span>
                </div>
                <div className="demo-triage-rationale">{c.rationale}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Demo() {
  const [exampleId, setExampleId] = useState(DEMO_EXAMPLES[0].id);
  const [personaKey, setPersonaKey] = useState(PERSONA_KEYS[0]);

  const example = useMemo(
    () => DEMO_EXAMPLES.find((e) => e.id === exampleId),
    [exampleId],
  );
  const persona = example.personas[personaKey];
  const prompt = useMemo(() => example.promptTemplate(persona), [example, persona]);

  return (
    <div className="demo">
      <section className="demo-intro">
        <span className="demo-eyebrow">Interactive demo · no login · no backend</span>
        <h1>See the gitlogs AI pipeline, end to end.</h1>
        <p>
          A no-login walkthrough of the gitlogs pipeline on bundled commit fixtures. Pick a commit,
          see its git diff become the real interpolated Gemini prompt the backend would send, and
          read the matching sample changelog post. Switch persona to see how the prompt instruction
          and output change. The posts are pre-generated fixtures — this demo calls no API and runs
          entirely in your browser.
        </p>
        <Link to="/" className="demo-back">&larr; Back to home</Link>
      </section>

      <TriageStage />

      <div className="demo-pipeline-intro">
        <h2>From the worthy commits to a post</h2>
        <p>
          The triage above decides <em>what</em> ships. The pipeline below shows <em>how</em> a
          single worthy commit becomes a changelog post — diff to prompt to output.
        </p>
      </div>

      <div className="demo-toolbar">
        <div className="demo-selector" role="group" aria-label="Example commits">
          {DEMO_EXAMPLES.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={e.id === exampleId}
              className={`demo-tab${e.id === exampleId ? ' is-active' : ''}`}
              onClick={() => setExampleId(e.id)}
            >
              <span className="demo-tab-repo">{e.repoFullName}</span>
              <span className="demo-tab-sha">{e.commit.sha}</span>
            </button>
          ))}
        </div>

        <div className="demo-personas" role="group" aria-label="Persona">
          <span className="demo-personas-label">Persona</span>
          {PERSONA_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === personaKey}
              className={`demo-persona-btn${key === personaKey ? ' is-active' : ''}`}
              onClick={() => setPersonaKey(key)}
            >
              {example.personas[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-pipeline">
        {/* Stage 1: commit + diff */}
        <section className="demo-stage" aria-labelledby="stage-input">
          <header className="demo-stage-head">
            <span className="demo-stage-num">01</span>
            <h2 id="stage-input">Commit &amp; diff</h2>
          </header>
          <div className="demo-card demo-commit">
            <div className="demo-commit-repo">{example.repoFullName}</div>
            <div className="demo-commit-msg">{example.commit.message}</div>
            <div className="demo-commit-refs">
              <span className="demo-chip">{example.commit.branch}</span>
              <span className="demo-chip demo-chip-sha">{example.commit.sha}</span>
              <span className="demo-chip">@{example.author}</span>
            </div>
            <DiffView diff={example.diff} />
          </div>
        </section>

        {/* Stage 2: prompt */}
        <section className="demo-stage" aria-labelledby="stage-prompt">
          <header className="demo-stage-head">
            <span className="demo-stage-num">02</span>
            <h2 id="stage-prompt">Gemini prompt</h2>
          </header>
          <div className="demo-card demo-prompt">
            <div className="demo-prompt-label">
              Persona: <strong>{persona.label}</strong>
            </div>
            <pre className="demo-prompt-body"><code>{prompt}</code></pre>
          </div>
        </section>

        {/* Stage 3: output */}
        <section className="demo-stage" aria-labelledby="stage-output">
          <header className="demo-stage-head">
            <span className="demo-stage-num">03</span>
            <h2 id="stage-output">Generated post</h2>
          </header>
          <div className="demo-card demo-output">
            <TweetCard example={example} thread={persona.thread} />
          </div>
        </section>
      </div>
    </div>
  );
}
