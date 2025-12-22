export default function Terms() {
  return (
    <div className="container" style={{ padding: '60px 20px', maxWidth: '800px' }}>
      <div className="card">
        <h1 style={{ marginBottom: '24px', fontSize: '32px' }}>Terms of Service</h1>
        <div style={{ lineHeight: '1.8', color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: '20px' }}>
            <strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>1. Acceptance of Terms</h2>
            <p style={{ marginBottom: '12px' }}>
              By accessing and using GitLogs, you accept and agree to be bound by these Terms of Service. If you do not agree, please do not use our service.
            </p>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>2. Description of Service</h2>
            <p style={{ marginBottom: '12px' }}>
              GitLogs is an automated service that:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Monitors your GitHub repositories for new commits</li>
              <li>Generates AI-powered summaries of your commits</li>
              <li>Automatically posts these summaries to your X/Twitter account</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>3. User Responsibilities</h2>
            <p style={{ marginBottom: '12px' }}>
              You agree to:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Provide accurate account information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Comply with GitHub and X/Twitter's terms of service</li>
              <li>Not use the service for any illegal or unauthorized purpose</li>
              <li>Review and approve content before it's posted (when applicable)</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>4. Service Availability</h2>
            <p style={{ marginBottom: '12px' }}>
              GitLogs is provided "as is" and "as available." We do not guarantee:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Uninterrupted or error-free service</li>
              <li>Immediate posting of all commits</li>
              <li>Accuracy of AI-generated summaries</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>5. Limitation of Liability</h2>
            <p style={{ marginBottom: '12px' }}>
              GitLogs shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use of the service, including but not limited to:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Loss of data or content</li>
              <li>Service interruptions</li>
              <li>Inaccurate AI-generated content</li>
              <li>Issues with third-party platforms (GitHub, X/Twitter)</li>
            </ul>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>6. Termination</h2>
            <p style={{ marginBottom: '12px' }}>
              You may terminate your account at any time by:
            </p>
            <ul style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <li>Disconnecting your GitHub and X/Twitter accounts</li>
              <li>Deleting your account through the dashboard</li>
              <li>Revoking access through GitHub or X/Twitter settings</li>
            </ul>
            <p style={{ marginBottom: '12px' }}>
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>7. Changes to Terms</h2>
            <p style={{ marginBottom: '12px' }}>
              We may update these Terms of Service from time to time. Continued use of the service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ marginBottom: '16px', fontSize: '24px', color: 'var(--text-primary)' }}>8. Contact</h2>
            <p style={{ marginBottom: '12px' }}>
              For questions about these Terms of Service, please contact us via:
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

