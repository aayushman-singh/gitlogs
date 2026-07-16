function EngagementValue({ engagement }) {
  if (!engagement || engagement.status !== 'available') {
    return (
      <>
        <strong>Unavailable</strong>
        <span>{engagement?.reason || 'Engagement metrics are unavailable.'}</span>
      </>
    );
  }

  return (
    <>
      <strong>{engagement.averageHeartsPerPost}</strong>
      <span>hearts/post</span>
    </>
  );
}

export default function DashboardStats({ stats }) {
  const queue = stats.queue || { pending: 0, processing: 0, retrying: 0, failed: 0 };
  const queueTotal = queue.pending + queue.processing + queue.retrying;

  return (
    <section className="dashboard-stats" aria-label="Dashboard summary">
      <article className="dashboard-stat-card">
        <span>Posts this week</span>
        <strong>{stats.postsThisWeek}</strong>
        <small>Persisted GitLogs posts</small>
      </article>
      <article className="dashboard-stat-card">
        <span>Repos enabled</span>
        <strong>{stats.enabledRepos}/{stats.totalRepos}</strong>
        <small>Webhook-backed repositories</small>
      </article>
      <article className="dashboard-stat-card">
        <span>Queue</span>
        <strong>{queueTotal}</strong>
        <small>{queue.failed > 0 ? `${queue.failed} failed` : 'All clear'}</small>
      </article>
      <article className="dashboard-stat-card">
        <span>Avg engagement</span>
        <EngagementValue engagement={stats.averageEngagement} />
      </article>
    </section>
  );
}
