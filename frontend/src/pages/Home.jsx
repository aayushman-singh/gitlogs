import { Link } from 'react-router-dom';

const benefits = [
  {
    title: 'Save Hours Weekly',
    description:
      'Stop context-switching between coding and posting. gitlogs handles your social presence automatically.',
    image:
      '/img1.png',
    icon: 'clock',
  },
  {
    title: 'Boost Visibility',
    description:
      'Every commit becomes a post. Build your developer brand and showcase your consistency without lifting a finger.',
    image:
      '/img2.png',
    icon: 'trend',
  },
  {
    title: 'Zero Effort Required',
    description:
      'Connect once, forget forever. Your commits automatically transform into engaging posts that attract opportunities.',
    image:
      '/img3.png',
    icon: 'zap',
  },
];

const steps = [
  {
    number: '01',
    title: 'Connect GitHub',
    description: 'Authorize gitlogs with one click. We only need read access to your public commits.',
    features: ['Secure OAuth', 'Public repos only', 'Revoke anytime'],
  },
  {
    number: '02',
    title: 'Link Social Platforms',
    description: 'Connect your social accounts (X and more) so we can post on your behalf when you push code.',
    features: ['Multiple platforms', 'Custom templates', 'Edit before post'],
  },
  {
    number: '03',
    title: 'Code Normally',
    description: "That's it. Keep pushing commits and building. gitlogs handles the rest automatically.",
    features: ['Auto-detect commits', 'Smart formatting', 'Perfect timing'],
  },
];

const icons = {
  code: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 16L5 12l4-4M15 8l4 4-4 4M13 4l-2 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  branch: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 3a3 3 0 100 6 3 3 0 000-6zm12 12a3 3 0 100 6 3 3 0 000-6zM6 9v3a4 4 0 004 4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  trend: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 17l6-6 4 4 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 8h6v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12h14M13 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export default function Home() {
  const handleGetStarted = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${getBackendUrl()}/auth/github`;
  };

  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-hero-background" aria-hidden="true" />
        <div className="landing-shell landing-hero-content">
          <div className="landing-badge landing-animate" style={{ '--delay': '0s' }}>
            <span className="landing-badge-icon">{icons.code}</span>
            <span>For developers, by developers</span>
          </div>

          <h1 className="landing-title landing-animate" style={{ '--delay': '0.1s' }}>
            Code more.
            <br />
            Post less.
          </h1>

          <p className="landing-lead landing-animate" style={{ '--delay': '0.2s' }}>
            gitlogs takes your GitHub commits and posts on X on your behalf. Spend your time coding, not yapping.
          </p>

          <div className="landing-actions landing-animate" style={{ '--delay': '0.3s' }}>
            <button onClick={handleGetStarted} className="landing-button primary">
              <span className="landing-button-icon">{icons.branch}</span>
              Get started
            </button>
            <Link to="/dashboard" className="landing-button secondary">
              Dashboard
            </Link>
          </div>

          <p className="landing-note landing-animate" style={{ '--delay': '0.4s' }}>
            No credit card required • 2 minute setup
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-shell">
          <div className="landing-section-header landing-animate" style={{ '--delay': '0.1s' }}>
            <h2>Why developers choose gitlogs</h2>
            <p>Built to solve the real problem: staying visible while staying productive.</p>
          </div>

          <div className="landing-grid">
            {benefits.map((benefit, index) => (
              <article
                key={benefit.title}
                className="landing-card landing-animate"
                style={{ '--delay': `${0.1 + index * 0.1}s` }}
              >
                <div className="landing-card-media">
                  <img src={benefit.image} alt={benefit.title} />
                </div>
                <div className="landing-card-body">
                  <div className="landing-card-title">
                    <span className="landing-icon">{icons[benefit.icon]}</span>
                    <h3>{benefit.title}</h3>
                  </div>
                  <p>{benefit.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-steps-section">
        <div className="landing-shell">
          <div className="landing-section-header landing-animate" style={{ '--delay': '0.1s' }}>
            <h2>Get started in 2 minutes</h2>
            <p>Simple setup, powerful automation.</p>
          </div>

          <div className="landing-steps">
            {steps.map((step, index) => (
              <article
                key={step.number}
                className="landing-step-card landing-animate"
                style={{ '--delay': `${0.1 + index * 0.1}s` }}
              >
                <div className="landing-step-header">
                  <span className="landing-step-number">{step.number}</span>
                  {index < steps.length - 1 && (
                    <span className="landing-step-arrow">{icons.arrow}</span>
                  )}
                </div>
                <div className="landing-step-body">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                <ul className="landing-step-list">
                  {step.features.map((feature) => (
                    <li key={feature}>
                      <span className="landing-check">{icons.check}</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="landing-dashboard landing-animate" style={{ '--delay': '0.3s' }}>
            <img
              src="/dashboard.png"
              alt="gitlogs dashboard showing GitHub commits automatically posted to X with engagement metrics and customization options"
            />
            <p>Your dashboard shows all automated posts and engagement.</p>
          </div>
        </div>
      </section>

    </main>
  );
}
