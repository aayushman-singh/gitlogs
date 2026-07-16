function sectionError(errors, section) {
  if (!Array.isArray(errors)) return null;
  return errors.find((entry) => entry.section === section) || null;
}

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

function QueueValue({ queue, queueError }) {
  if (queueError) {
    return (
      <>
        <strong>Unavailable</strong>
        <small>{queueError.message}</small>
      </>
    );
  }

  if (!queue) {
    return (
      <>
        <strong>Unavailable</strong>
        <small>Queue metrics are unavailable.</small>
      </>
    );
  }

  const queueTotal = queue.pending + queue.processing + queue.retrying + queue.failed;
  const queueParts = [];
  if (queue.pending > 0) queueParts.push(`${queue.pending} pending`);
  if (queue.processing > 0) queueParts.push(`${queue.processing} processing`);
  if (queue.retrying > 0) queueParts.push(`${queue.retrying} retrying`);
  if (queue.failed > 0) queueParts.push(`${queue.failed} failed`);

  return (
    <>
      <strong>{queueTotal}</strong>
      <small>{queueParts.length > 0 ? queueParts.join(' · ') : 'All clear'}</small>
    </>
  );
}

export default function DashboardStats({ stats, errors = [] }) {
  const queueError = sectionError(errors, 'queue');

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
        <QueueValue queue={stats.queue} queueError={queueError} />
      </article>
      <article className="dashboard-stat-card">
        <span>Avg engagement</span>
        <EngagementValue engagement={stats.averageEngagement} />
      </article>
    </section>
  );
}
