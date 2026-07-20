import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, getGitHubAuthUrl } from '../utils/useAuth';

const personaNames = ['Professional', 'Hype', 'Deadpan Technical'];

const personaBlurbs = [
  'Clean changelog voice — what shipped, why it matters',
  'Build-in-public energy, caps lock authorized',
  'Just the mechanics. No adjectives were harmed',
];

const personaTweets = [
  'shipped: idempotency keys on POST /charges. retries now return the original charge instead of creating a duplicate. one required header, zero double-charges. (a1b2c3d)',
  'DOUBLE-CHARGES ARE DEAD 💀 just shipped idempotency keys on /charges — retry all you want, you get the same charge back every time. huge for payment reliability. (a1b2c3d)',
  'POST /charges: require Idempotency-Key header (400 if missing). lookup by key first, return existing charge 200 if found, else create with key. backed by a partial unique index where key is not null. (a1b2c3d)',
];

const pipeSteps = [
  {
    num: '01',
    tag: 'webhook',
    title: 'You push',
    desc: 'GitHub fires a webhook on every push. HMAC-verified, fails closed if unsigned.',
  },
  {
    num: '02',
    tag: 'diff',
    title: 'We read the diff',
    desc: 'The real diff is fetched from the GitHub API — the ground truth for everything written.',
  },
  {
    num: '03',
    tag: 'gemini',
    title: 'AI writes it up',
    desc: 'Gemini summarizes what actually changed, then styles it with your template.',
  },
  {
    num: '04',
    tag: 'x api',
    title: 'Posted as you',
    desc: 'The changelog lands on your own X timeline via a rate-limited, retrying queue.',
  },
];

const trustItems = [
  {
    glyph: '✓',
    title: 'Fails closed',
    desc: 'Webhooks are HMAC-SHA256 verified with timing-safe comparison. No secret configured? Requests are rejected, not trusted.',
  },
  {
    glyph: '⊘',
    title: 'Read-only reach',
    desc: 'GitHub access is scoped to reading commits on repos you explicitly enable. Nothing is written to your code, ever.',
  },
  {
    glyph: '↩',
    title: 'Revoke anytime',
    desc: 'Disable a repo and the webhook is deleted. Disconnect X and the token is gone. One click each, from the dashboard.',
  },
];

function GitHubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function XMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23z" />
    </svg>
  );
}

export default function Home() {
  const authState = useAuth();
  const location = useLocation();
  const [persona, setPersona] = useState(0);

  const handleGetStarted = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = getGitHubAuthUrl();
  };

  // Scroll to in-page sections when arriving through /#anchor nav links.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [location.hash]);

  const primaryCta = (label) => {
    if (authState === 'authenticated') {
      return (
        <Link to="/dashboard" className="home-btn home-btn-primary">
          Open dashboard
        </Link>
      );
    }

    if (authState === 'loading') {
      return (
        <Link to="/demo" className="home-btn home-btn-primary">
          See the live demo
        </Link>
      );
    }

    return (
      <button type="button" onClick={handleGetStarted} className="home-btn home-btn-primary">
        <GitHubMark />
        {label}
      </button>
    );
  };

  return (
    <div className="home">
      {/* HERO */}
      <section className="home-hero">
        <div className="home-hero-grid" aria-hidden="true" />
        <div className="home-shell home-hero-content">
          <div className="home-hero-intro">
            <p className="home-badge">
              <span className="home-badge-dot" aria-hidden="true" />
              your commits, but louder
            </p>
            <h1 className="home-title">
              You ship every day.
              <br />
              Nobody hears about it.
            </h1>
            <p className="home-lead">
              gitlogs watches your pushes, reads the actual diff, and posts a changelog tweet to
              your own X account. You keep coding — the yapping is automated.
            </p>
            <div className="home-actions">
              {primaryCta('Get started free')}
              <a href="#demo-out" className="home-btn home-btn-secondary">
                See example output
              </a>
            </div>
            <p className="home-note">read-only scopes · revoke anytime · 2 min setup</p>
          </div>

          {/* TRANSFORMATION: commit → tweet */}
          <div className="home-transform" id="demo-out">
            <div className="home-terminal">
              <div className="home-terminal-bar">
                <span className="home-terminal-dot" style={{ background: '#ff5d57' }} aria-hidden="true" />
                <span className="home-terminal-dot" style={{ background: '#f5b54a' }} aria-hidden="true" />
                <span className="home-terminal-dot" style={{ background: '#3ee089' }} aria-hidden="true" />
                <span className="home-terminal-title">~/payments-api</span>
              </div>
              <div className="home-terminal-body">
                <div className="home-term-dim">
                  $ git commit -m{' '}
                  <span className="home-term-violet">"feat: idempotency keys on POST /charges"</span>
                </div>
                <div className="home-term-dim">$ git push origin main</div>
                <div>Enumerating objects: 9, done.</div>
                <div>To github.com:octo-dev/payments-api.git</div>
                <div>
                  <span className="home-term-green">✓</span> a1b2c3d..e4f5a6b&nbsp;&nbsp;main → main
                  <span className="home-cursor" aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className="home-transform-arrow" aria-hidden="true">
              <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
                <path
                  className="home-flow-line"
                  d="M4 20h40"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                />
                <path
                  d="M40 12l10 8-10 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="home-tweet">
              <div className="home-tweet-head">
                <div className="home-tweet-avatar" aria-hidden="true" />
                <div className="home-tweet-meta">
                  <div className="home-tweet-name">Aayushman Singh</div>
                  <div className="home-tweet-handle">@aayushman2703 · just now</div>
                </div>
                <span className="home-tweet-x">
                  <XMark />
                </span>
              </div>
              <p className="home-tweet-body">{personaTweets[0]}</p>
              <div className="home-tweet-stats">
                <span>💬 4</span>
                <span>🔁 12</span>
                <span className="home-tweet-like">♥ 38</span>
              </div>
            </div>
          </div>
          <p className="home-transform-note">
            real pipeline, real diff — Gemini writes only what actually changed
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="home-section" id="how" aria-labelledby="home-how-title">
        <div className="home-shell">
          <div className="home-section-head">
            <p className="home-eyebrow">How it works</p>
            <h2 className="home-h2" id="home-how-title">
              Push. That's the whole workflow.
            </h2>
            <p className="home-section-lead">
              Every push fires a webhook. The pipeline does the rest — grounded in your actual diff,
              not vibes.
            </p>
          </div>
          <div className="home-steps">
            {pipeSteps.map((step) => (
              <article key={step.num} className="home-step">
                <div className="home-step-top">
                  <span className="home-step-num">{step.num}</span>
                  <span className="home-step-tag">{step.tag}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PERSONAS */}
      <section className="home-section home-section-tint" id="personas" aria-labelledby="home-personas-title">
        <div className="home-shell">
          <div className="home-personas">
            <div>
              <p className="home-eyebrow">Personas</p>
              <h2 className="home-h2" id="home-personas-title">
                Same diff, your voice.
              </h2>
              <p className="home-section-lead home-persona-lead">
                Pick a persona — or write your own prompt template. The persona changes the
                instruction sent to Gemini, so the tone changes but the facts don't.
              </p>
              <div className="home-persona-list">
                {personaNames.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    className="home-persona-btn"
                    aria-pressed={i === persona}
                    onClick={() => setPersona(i)}
                  >
                    <div className="home-persona-name">{name}</div>
                    <div className="home-persona-blurb">{personaBlurbs[i]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="home-persona-preview">
              <div className="home-persona-input">
                <div className="home-persona-input-head">
                  input · commit a1b2c3d on octo-dev/payments-api
                </div>
                <div className="home-persona-input-body">
                  feat: idempotency keys on POST /charges
                  <br />
                  <span className="home-term-green">+41</span>{' '}
                  <span className="home-term-red">−7</span>{' '}
                  <span className="home-term-dim">
                    · 3 files · charges.js, middleware/idempotency.js, schema.sql
                  </span>
                </div>
              </div>
              <div className="home-persona-output" aria-live="polite">
                <div className="home-persona-output-head">
                  <span className="home-persona-output-label">
                    GENERATED POST · {personaNames[persona].toUpperCase()}
                  </span>
                  <span className="home-persona-output-x">
                    <XMark size={16} />
                  </span>
                </div>
                <p key={personaNames[persona]} className="home-persona-tweet">
                  {personaTweets[persona]}
                </p>
              </div>
              <p className="home-persona-note">
                try the toggle ↑ · full interactive version at <Link to="/demo">/demo</Link> — no
                login, no API keys
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY */}
      <section className="home-section" id="trust" aria-labelledby="home-trust-title">
        <div className="home-shell">
          <div className="home-section-head">
            <p className="home-eyebrow">Security</p>
            <h2 className="home-h2" id="home-trust-title">
              Paranoid by default.
            </h2>
          </div>
          <div className="home-trust-grid">
            {trustItems.map((item) => (
              <article key={item.title} className="home-trust-card">
                <div className="home-trust-glyph" aria-hidden="true">
                  {item.glyph}
                </div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section className="home-section home-section-tint home-preview" aria-labelledby="home-preview-title">
        <div className="home-shell">
          <h2 className="home-h2" id="home-preview-title">
            One dashboard, zero babysitting.
          </h2>
          <p className="home-section-lead home-preview-lead">
            Enable repos, edit templates, review every post. Turn it off per-repo whenever you want.
          </p>
          <Link to="/dashboard" className="home-preview-link">
            <img
              src="/dashboard.png"
              alt="gitlogs dashboard showing connected repos, post templates, and automated X posts"
            />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="home-section home-cta" aria-labelledby="home-cta-title">
        <div className="home-shell">
          <p className="home-cta-mono">$ git push &amp;&amp; go touch grass</p>
          <h2 className="home-cta-title" id="home-cta-title">
            Your next push could be
            <br />
            your next post.
          </h2>
          <div className="home-actions">
            {primaryCta('Sign in with GitHub')}
            <Link to="/demo" className="home-btn home-btn-secondary">
              Try /demo — no login
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
