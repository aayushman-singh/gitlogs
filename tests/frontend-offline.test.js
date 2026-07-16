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

    expect(app).toContain('hideGlobalChrome');
    expect(dashboardHeader).toContain('dashboard');
    expect(dashboardHeader).toContain('Customisation');
  });
});
