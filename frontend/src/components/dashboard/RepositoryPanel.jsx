import { useMemo, useState } from 'react';

function extractTweetId(input) {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:twitter\.com|x\.com)\/(?:\w+\/status|i\/status)\/(\d+)/i);
  return match?.[1] || null;
}

export default function RepositoryPanel({ repositories, onToggleRepo, onSetOgPost }) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [page, setPage] = useState(1);
  const [editingRepo, setEditingRepo] = useState(null);
  const [tweetInput, setTweetInput] = useState('');
  const pageSize = 5;

  const filteredRepos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = repositories.filter((repo) => {
      if (!normalizedQuery) return true;
      return `${repo.full_name} ${repo.description || ''}`.toLowerCase().includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') return a.full_name.localeCompare(b.full_name);
      if (sortBy === 'enabled') return Number(b.enabled) - Number(a.enabled);
      return new Date(b.pushed_at || b.updated_at || 0) - new Date(a.pushed_at || a.updated_at || 0);
    });
  }, [repositories, query, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRepos.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRepos = filteredRepos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const submitOgPost = async (repoFullName) => {
    const tweetId = extractTweetId(tweetInput);
    if (!tweetId) {
      throw new Error('Paste a valid X/Twitter status URL or numeric tweet id.');
    }
    await onSetOgPost(repoFullName, tweetId);
    setEditingRepo(null);
    setTweetInput('');
  };

  return (
    <section className="dashboard-panel dashboard-repositories">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Repositories</h2>
          <p>{filteredRepos.length} repositories available</p>
        </div>
        <div className="dashboard-repo-tools">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Filter repositories"
            aria-label="Filter repositories"
          />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort repositories">
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="enabled">Enabled</option>
          </select>
        </div>
      </div>

      <div className="dashboard-repo-list">
        {visibleRepos.map((repo) => (
          <article className="dashboard-repo-card" key={repo.full_name}>
            <div className="dashboard-repo-main">
              <div>
                <a href={repo.html_url} target="_blank" rel="noreferrer">{repo.full_name}</a>
                <p>{repo.description || 'No description'}</p>
                <div className="dashboard-repo-badges">
                  <span>{repo.private ? 'Private' : 'Public'}</span>
                  {repo.og_post_id ? <span>OG set</span> : <span>No OG post</span>}
                  <span>{repo.stargazers_count} stars</span>
                </div>
              </div>
              <label className="dashboard-switch">
                <input
                  type="checkbox"
                  checked={repo.enabled}
                  onChange={() => onToggleRepo(repo.full_name, repo.enabled)}
                />
                <span>{repo.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            {repo.og_post_id && (
              <a className="dashboard-text-link" href={`https://x.com/i/status/${repo.og_post_id}`} target="_blank" rel="noreferrer">
                View OG post
              </a>
            )}

            {editingRepo === repo.full_name ? (
              <div className="dashboard-og-editor">
                <input
                  value={tweetInput}
                  onChange={(event) => setTweetInput(event.target.value)}
                  placeholder="https://x.com/user/status/123 or 123"
                  aria-label={`OG post for ${repo.full_name}`}
                />
                <button type="button" onClick={() => submitOgPost(repo.full_name)}>Save</button>
                <button type="button" onClick={() => setEditingRepo(null)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="dashboard-text-button" onClick={() => setEditingRepo(repo.full_name)}>
                {repo.og_post_id ? 'Update OG post' : 'Set OG post'}
              </button>
            )}
          </article>
        ))}
      </div>

      <div className="dashboard-pagination">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage} of {totalPages}</span>
        <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    </section>
  );
}
