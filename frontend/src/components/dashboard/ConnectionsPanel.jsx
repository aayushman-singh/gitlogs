import { getBackendUrl } from '../../utils/api';

export default function ConnectionsPanel({ connections, onDisconnectX }) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Connections</h2>
          <p>Accounts GitLogs can read or post with</p>
        </div>
      </div>

      <div className="dashboard-connection-list">
        <article className="dashboard-connection-row">
          <div>
            <strong>GitHub</strong>
            <span>@{connections.github.login}</span>
          </div>
          <small>Connected</small>
        </article>

        <article className="dashboard-connection-row">
          <div>
            <strong>X</strong>
            <span>{connections.x.connected ? `@${connections.x.username || 'connected'}` : 'Not connected'}</span>
          </div>
          {connections.x.connected ? (
            <button type="button" onClick={onDisconnectX}>Disconnect</button>
          ) : (
            <a href={`${getBackendUrl()}/auth/x`}>Connect</a>
          )}
        </article>

        <article className="dashboard-connection-row is-disabled">
          <div>
            <strong>LinkedIn</strong>
            <span>Coming soon</span>
          </div>
          <small>Unavailable</small>
        </article>
      </div>
    </section>
  );
}
