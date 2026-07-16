import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendStylesPath = path.join(repoRoot, 'frontend', 'src', 'styles.css');
const frontendHeaderPath = path.join(repoRoot, 'frontend', 'src', 'components', 'Header.jsx');
const frontendAppPath = path.join(repoRoot, 'frontend', 'src', 'App.jsx');
const userDashboardPath = path.join(repoRoot, 'frontend', 'src', 'pages', 'UserDashboard.jsx');
const dashboardHeaderPath = path.join(
  repoRoot,
  'frontend',
  'src',
  'components',
  'dashboard',
  'DashboardHeader.jsx'
);
const dashboardStatsPath = path.join(
  repoRoot,
  'frontend',
  'src',
  'components',
  'dashboard',
  'DashboardStats.jsx'
);
const repositoryPanelPath = path.join(
  repoRoot,
  'frontend',
  'src',
  'components',
  'dashboard',
  'RepositoryPanel.jsx'
);

describe('frontend offline contract', () => {
  it('keeps global CSS free of external resources so /demo can run offline', () => {
    const css = fs.readFileSync(frontendStylesPath, 'utf8');

    expect(css).not.toMatch(/@import\s+(?:url\()?['"]?https?:\/\//i);
    expect(css).not.toMatch(/url\(\s*['"]?https?:\/\//i);
  });

  it('keeps the mobile header login control compact beside the theme toggle', () => {
    const css = fs.readFileSync(frontendStylesPath, 'utf8');
    const header = fs.readFileSync(frontendHeaderPath, 'utf8');

    expect(header).toContain('header-login-text');
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*\.header-login-text/);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*\.header\s+\.btn-github\.btn-sm[\s\S]*width:\s*34px/);
  });

  it('uses the dashboard API instead of assembling dashboard state from silent empty reads', () => {
    const dashboard = fs.readFileSync(userDashboardPath, 'utf8');

    expect(dashboard).toContain('getMyDashboard');
    expect(dashboard).not.toContain('getMyRepos().catch(() => ({ repos: [] }))');
    expect(dashboard).not.toContain('getHealth().catch(() => null)');
  });

  it('uses dashboard-specific chrome on /dashboard', () => {
    const app = fs.readFileSync(frontendAppPath, 'utf8');
    const dashboardHeader = fs.readFileSync(dashboardHeaderPath, 'utf8');
    const dashboard = fs.readFileSync(userDashboardPath, 'utf8');

    expect(app).toContain("const hideGlobalChrome = location.pathname === '/dashboard';");
    expect(app).toContain('{!hideGlobalChrome && <Header />}');
    expect(app).toContain('{!hideGlobalChrome && <Footer />}');
    expect(dashboardHeader).toContain('dashboard');
    expect(dashboardHeader).toContain('Customisation');
    expect(dashboard).toContain('UnauthenticatedDashboardChrome');
    expect(dashboard).toContain('dashboard-shell-header');
  });

  it('does not hide customisation template load failures behind empty defaults', () => {
    const customisation = fs.readFileSync(
      path.join(repoRoot, 'frontend', 'src', 'components', 'Customisation.jsx'),
      'utf8'
    );

    expect(customisation).not.toContain("return { templates: [], activeTemplateId: 'default' };");
    expect(customisation).toContain("setResult({ type: 'error', message: err.message || 'Failed to load post settings' })");
    expect(customisation).toContain("setResult({ type: 'error', message: err.message || 'Failed to load X user info' })");
    expect(customisation).toContain("result.type !== 'error'");
  });

  it('surfaces invalid OG input through dashboard action errors instead of throwing', () => {
    const panel = fs.readFileSync(repositoryPanelPath, 'utf8');
    const dashboard = fs.readFileSync(userDashboardPath, 'utf8');

    expect(panel).not.toContain("throw new Error('Paste a valid X/Twitter status URL or numeric tweet id.')");
    expect(panel).toContain('await onSetOgPost(repoFullName, tweetId)');
    expect(dashboard).toContain("throw new Error('Paste a valid X/Twitter status URL or numeric tweet id.')");
    expect(dashboard).toContain('setActionError(error.message)');
    expect(dashboard).toContain('return false');
  });

  it('renders missing queue as unavailable instead of fabricating zeros', () => {
    const stats = fs.readFileSync(dashboardStatsPath, 'utf8');

    expect(stats).not.toContain('stats.queue ||');
    expect(stats).toContain('Queue metrics are unavailable.');
    expect(stats).toContain('<QueueValue queue={stats.queue} queueError={queueError} />');
  });

  it('constrains the dashboard logo so the 60px header is not overflowed', () => {
    const css = fs.readFileSync(frontendStylesPath, 'utf8');

    expect(css).toMatch(
      /\.dashboard-logo\s*\{[^}]*max-width:\s*104px[^}]*height:\s*32px[^}]*object-fit:\s*contain/
    );
    expect(css).not.toMatch(/\.dashboard-logo\s*\{\s*width:\s*104px;\s*height:\s*auto;\s*\}/);
  });

  it('reports queue pending/processing/retrying counts instead of a false All clear', () => {
    const stats = fs.readFileSync(dashboardStatsPath, 'utf8');

    expect(stats).toContain('queue.pending');
    expect(stats).toContain('queue.processing');
    expect(stats).toContain('queue.retrying');
    expect(stats).toContain('queue.failed');
    expect(stats).toContain('All clear');
    expect(stats).toContain('Queue metrics are unavailable.');
    expect(stats).toContain('queue.pending + queue.processing + queue.retrying + queue.failed');
    expect(stats).not.toMatch(
      /queue\.failed\s*>\s*0\s*\?\s*[`'"]\$\{queue\.failed\} failed[`'"]\s*:\s*[`'"]All clear[`'"]/
    );
  });

  it('renders dashboard section errors for queue, connections, and recent posts', () => {
    const dashboard = fs.readFileSync(userDashboardPath, 'utf8');
    const stats = fs.readFileSync(dashboardStatsPath, 'utf8');
    const connections = fs.readFileSync(
      path.join(repoRoot, 'frontend', 'src', 'components', 'dashboard', 'ConnectionsPanel.jsx'),
      'utf8'
    );
    const recent = fs.readFileSync(
      path.join(repoRoot, 'frontend', 'src', 'components', 'dashboard', 'RecentPostsPanel.jsx'),
      'utf8'
    );
    const api = fs.readFileSync(path.join(repoRoot, 'frontend', 'src', 'utils', 'api.js'), 'utf8');

    expect(dashboard).toContain('errors={sectionErrors}');
    expect(stats).toContain("sectionError(errors, 'queue')");
    expect(connections).toContain("entry.section === 'connections.x'");
    expect(recent).toContain("entry.section === 'recentPosts'");
    expect(api).toContain('data.message || data.error');
    expect(api).not.toContain('data.error || data.message');
  });

  it('uses --danger for dashboard error alerts', () => {
    const css = fs.readFileSync(frontendStylesPath, 'utf8');

    expect(css).toMatch(/\.dashboard-alert\.is-error\s*\{\s*border-color:\s*var\(--danger\)/);
    expect(css).not.toMatch(/\.dashboard-alert\.is-error\s*\{\s*border-color:\s*var\(--error\)/);
  });
});
