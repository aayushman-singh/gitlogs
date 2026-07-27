import { FaLinkedin, FaGithub } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { getBackendUrl } from '../../utils/api';

const PLATFORM_ICONS = {
  github: <FaGithub size={18} aria-hidden="true" />,
  x: <FaXTwitter size={18} aria-hidden="true" />,
  linkedin: <FaLinkedin size={18} aria-hidden="true" />,
};

export default function ConnectionsPanel({ connections, errors = [], onDisconnectX }) {
  const xError = Array.isArray(errors)
    ? errors.find((entry) => entry.section === 'connections.x')
    : null;
  const connectionError = connections?.x?.error || xError?.message || null;

  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Connections</h2>
          <p>Accounts GitLogs can read or post with</p>
        </div>
      </div>

      {connectionError && (
        <p className="dashboard-section-error" role="alert">{connectionError}</p>
      )}

      <div className="dashboard-connection-list">
        <article className="dashboard-connection-row">
          <div>
            <span className="dashboard-connection-name">
              {PLATFORM_ICONS.github}
              <strong>GitHub</strong>
            </span>
            <span>@{connections.github.login}</span>
          </div>
          <small>Connected</small>
        </article>

        <article className="dashboard-connection-row">
          <div>
            <span className="dashboard-connection-name">
              {PLATFORM_ICONS.x}
              <strong>X</strong>
            </span>
            <span>
              {connections.x.connected
                ? (connections.x.username ? `@${connections.x.username}` : 'Connected')
                : 'Not connected'}
            </span>
          </div>
          {connections.x.connected ? (
            <button type="button" onClick={onDisconnectX}>Disconnect</button>
          ) : (
            <a href={`${getBackendUrl()}/auth/x`}>Connect</a>
          )}
        </article>

        <article className="dashboard-connection-row is-disabled">
          <div>
            <span className="dashboard-connection-name">
              {PLATFORM_ICONS.linkedin}
              <strong>LinkedIn</strong>
            </span>
            <span>Coming soon</span>
          </div>
          <small>Unavailable</small>
        </article>
      </div>
    </section>
  );
}
