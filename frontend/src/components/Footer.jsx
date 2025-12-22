import { FaLinkedin, FaGithub } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { useLocation } from 'react-router-dom';
import { getBackendUrl } from '../utils/api';
import logo from '../../gitlogs.png';

const icons = {
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
};

export default function Footer() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  
  const socialLinks = [
    {
      href: 'https://www.linkedin.com/in/aayushman-singh-zz/',
      icon: <FaLinkedin size={20} />,
      label: 'LinkedIn',
    },
    {
      href: 'https://github.com/aayushman-singh',
      icon: <FaGithub size={20} />,
      label: 'GitHub',
    },
    {
      href: 'https://x.com/aayushman2703',
      icon: <FaXTwitter size={20} />,
      label: 'X (Twitter)',
    },
  ];

  const handleGetStarted = () => {
    window.location.href = `${getBackendUrl()}/auth/github`;
  };

  return (
    <footer className="landing-footer">
      {/* CTA Section - only show on home page */}
      {isHomePage && (
        <section className="landing-footer-cta">
          <div className="landing-shell landing-footer-inner landing-animate" style={{ '--delay': '0.1s' }}>
            <h2>Ready to automate your presence?</h2>
            <p>Join developers who code more and post less.</p>
            <button onClick={handleGetStarted} className="landing-button primary">
              <span className="landing-button-icon">{icons.branch}</span>
              Get Started Free
            </button>
          </div>
        </section>
      )}

      {/* Promotional Section - Connect with me */}
      <section className="landing-footer-promo">
        <div className="landing-shell landing-footer-promo-inner">
          <div className="landing-footer-promo-content">
            <p className="landing-footer-promo-label">Connect with me</p>
            <div className="landing-footer-social-links">
              {socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="landing-footer-social-link"
                  aria-label={link.label}
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>
          <p className="landing-footer-promo-text">
            © {new Date().getFullYear()} GitLogs. Built by{' '}
            <a
              href="https://github.com/aayushman-singh"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-footer-link"
            >
              Aayushman Singh
            </a>
          </p>
        </div>
      </section>

      {/* Project Links Section */}
      <section className="landing-footer-links">
        <div className="landing-shell landing-footer-links-inner">
          <div className="landing-footer-brand">
            <img src={logo} alt="GitLogs logo" className="landing-footer-logo" />
            <span>gitlogs</span>
          </div>
          <div className="landing-footer-nav">
            <a href="#" rel="noreferrer">Privacy</a>
            <a href="#" rel="noreferrer">Terms</a>
            <a href="#" rel="noreferrer">Docs</a>
            <a href="https://github.com" rel="noreferrer" target="_blank">GitHub</a>
            <a href="https://x.com" rel="noreferrer" target="_blank">X</a>
          </div>
          <p>© 2025 gitlogs. For developers, by developers.</p>
        </div>
      </section>
    </footer>
  );
}

