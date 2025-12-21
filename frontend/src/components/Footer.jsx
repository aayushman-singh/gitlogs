import { FaLinkedin, FaGithub } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';

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
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-social">
          <p className="footer-label">Connect with me</p>
          <div className="footer-social-links">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-social-link"
                aria-label={link.label}
              >
                {link.icon}
              </a>
            ))}
          </div>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-copyright">
          © {new Date().getFullYear()} GitLogs. Built by{' '}
          <a
            href="https://github.com/aayushman-singh"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Aayushman Singh
          </a>
        </p>
      </div>
    </footer>
  );
}

