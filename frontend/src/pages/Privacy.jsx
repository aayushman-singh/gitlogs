export default function Privacy() {
  return (
    <div className="container" style={{ padding: '60px 20px', maxWidth: '800px' }}>
      <div className="card">
        <h1 style={{ marginBottom: '24px', fontSize: '32px' }}>Privacy Policy</h1>
        <div style={{ lineHeight: '1.8', color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: '20px' }}>
            <strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>1. Information We Collect</h2>
            <p style={{ marginBottom: '12px' }}>
              GitLogs collects the following information to provide our services:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>GitHub account information (username, email, public repositories)</li>
              <li>X/Twitter account information (username, profile data)</li>
              <li>Commit data from repositories you enable</li>
              <li>Usage data and analytics</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>2. How We Use Your Information</h2>
            <p style={{ marginBottom: '12px' }}>
              We use the collected information to:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Automatically post your commits to X/Twitter</li>
              <li>Generate AI-powered changelogs from your commits</li>
              <li>Provide and improve our services</li>
              <li>Communicate with you about your account</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>3. Data Security</h2>
            <p style={{ marginBottom: '12px' }}>
              We implement industry-standard security measures to protect your data. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>4. Third-Party Services</h2>
            <p style={{ marginBottom: '12px' }}>
              GitLogs integrates with:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li><strong>GitHub:</strong> For accessing your repositories and commit data</li>
              <li><strong>X/Twitter:</strong> For posting content on your behalf</li>
              <li><strong>Google Gemini:</strong> For AI-powered commit summaries</li>
            </ul>
            <p style={{ marginBottom: '12px' }}>
              These services have their own privacy policies. We recommend reviewing them.
            </p>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>5. Your Rights</h2>
            <p style={{ marginBottom: '12px' }}>
              You have the right to:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Access your personal data</li>
              <li>Delete your account and data at any time</li>
              <li>Revoke access to GitHub or X/Twitter</li>
              <li>Disable automatic posting for any repository</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>6. Contact Us</h2>
            <p style={{ marginBottom: '12px' }}>
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <p style={{ marginBottom: '12px' }}>
              <a href="https://github.com/aayushman-singh/gitlogs" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>
                GitHub Repository
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

