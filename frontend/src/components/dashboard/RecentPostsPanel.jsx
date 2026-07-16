export default function RecentPostsPanel({ posts, errors = [] }) {
  const postsError = Array.isArray(errors)
    ? errors.find((entry) => entry.section === 'recentPosts')
    : null;

  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Recent posts</h2>
          <p>Persisted posts created by GitLogs</p>
        </div>
      </div>

      {postsError ? (
        <p className="dashboard-section-error" role="alert">{postsError.message}</p>
      ) : (
        <div className="dashboard-post-list">
          {posts.length === 0 ? (
            <p className="dashboard-empty">No posts recorded yet.</p>
          ) : posts.map((post) => (
            <article className="dashboard-post-row" key={`${post.repo_name}-${post.commit_sha}`}>
              <div>
                <strong>{post.repo_name}</strong>
                <p>{post.tweet_text || `Tweet ${post.tweet_id}`}</p>
                <small>{post.commit_sha.slice(0, 7)} · {post.status} · {new Date(post.created_at).toLocaleString()}</small>
              </div>
              <a href={`https://x.com/i/status/${post.tweet_id}`} target="_blank" rel="noreferrer">View</a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
