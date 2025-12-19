import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getHealth, getBackendUrl } from '../utils/api';

export default function Home() {
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(console.error);
  }, []);
  
  return (
    <div className="container">
      <div className="hero">
        <h1>🐙 GitLogs</h1>
        <p>Automatically tweet your Git commits with AI-powered changelogs</p>
        <div className="quick-actions" style={{ justifyContent: 'center' }}>
          <Link to="/admin" className="btn btn-primary">Admin Dashboard</Link>
          <Link to="/dashboard" className="btn btn-secondary">User Dashboard</Link>
          <a href={`${getBackendUrl()}/oauth`} className="btn btn-secondary">Authenticate with X</a>
        </div>
      </div>

      <div className="grid grid-3 mb-4">
        <div className="card stat-card">
          <div className={`stat-value ${health?.status === 'healthy' ? 'green' : 'red'}`}>
            {health?.status === 'healthy' ? '✓ OK' : '--'}
          </div>
          <div className="stat-label">System Status</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{health?.queue?.pending ?? '--'}</div>
          <div className="stat-label">Queue Pending</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value purple">{health?.version ?? '--'}</div>
          <div className="stat-label">Version</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📋 Quick Start</h2>
        </div>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Login with GitHub to connect your repositories</li>
          <li>Authenticate with X (Twitter) via <a href={`${getBackendUrl()}/oauth`}>/oauth</a></li>
          <li>Configure your GitHub webhook to point to <code>/webhook/github</code></li>
          <li>Set an OG post for your repo in the Dashboard</li>
          <li>Push commits and watch them get tweeted!</li>
        </ol>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🔗 API Endpoints</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="badge badge-green">GET</span></td>
                <td><code>/api/health</code></td>
                <td>Health check</td>
              </tr>
              <tr>
                <td><span className="badge badge-green">GET</span></td>
                <td><code>/api/stats</code></td>
                <td>System statistics (admin)</td>
              </tr>
              <tr>
                <td><span className="badge badge-blue">POST</span></td>
                <td><code>/webhook/github</code></td>
                <td>GitHub webhook endpoint</td>
              </tr>
              <tr>
                <td><span className="badge badge-blue">POST</span></td>
                <td><code>/api/repos/:owner/:repo/og-post</code></td>
                <td>Set OG post for quoting</td>
              </tr>
              <tr>
                <td><span className="badge badge-green">GET</span></td>
                <td><code>/auth/github</code></td>
                <td>GitHub OAuth login</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
