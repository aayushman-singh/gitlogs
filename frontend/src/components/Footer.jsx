import { FaLinkedin, FaGithub } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { Link } from 'react-router-dom';
import logo from '../../gitlogs.png';

export default function Footer() {
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

  return (
    <footer className="landing-footer">
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
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a href="#" rel="noreferrer">Docs</a>
            <a href="https://github.com/aayushman-singh/gitlogs" rel="noreferrer" target="_blank">GitHub</a>
            <a href="https://x.com/gitlogs_" rel="noreferrer" target="_blank">X</a>
          </div>
          <p>
            © 2026 gitlogs. Built by{' '}
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
    </footer>
  );
}

