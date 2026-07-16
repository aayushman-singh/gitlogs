function startOfWeekUtc(now) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`dashboard: invalid now value ${now}`);
  }
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function publicUserFromToken(tokenData) {
  const user = tokenData?.user;
  if (!user) {
    throw new Error('dashboard: GitHub token is missing user payload');
  }
  return {
    id: user.id,
    login: user.login,
    name: user.name || user.login,
    avatar_url: user.avatar_url,
  };
}

function normalizeRepo(repo, { enabled, ogPostId }) {
  return {
    id: repo.id,
    full_name: repo.full_name,
    name: repo.name,
    description: repo.description,
    html_url: repo.html_url,
    private: Boolean(repo.private),
    stargazers_count: repo.stargazers_count || 0,
    pushed_at: repo.pushed_at,
    updated_at: repo.updated_at,
    permissions: repo.permissions || {},
    enabled: Boolean(enabled),
    og_post_id: ogPostId || null,
  };
}

async function readXConnection({ database, getXUserInfo, githubUserId }) {
  const xOAuthUserId = database.getXOAuthUserId(githubUserId);
  const connected = Boolean(xOAuthUserId && database.isOAuthTokenValid(xOAuthUserId));
  if (!connected) {
    return { connected: false, userId: xOAuthUserId || null, username: null, name: null, profileImageUrl: null };
  }
  const xUserInfo = await getXUserInfo(xOAuthUserId);
  return {
    connected: true,
    userId: xOAuthUserId,
    username: xUserInfo?.username || null,
    name: xUserInfo?.name || xUserInfo?.username || null,
    profileImageUrl: xUserInfo?.profileImageUrl || null,
  };
}

async function buildDashboardModel({ githubUserId, deps, now = new Date() }) {
  if (!githubUserId) {
    throw new Error('dashboard: githubUserId is required');
  }

  const { database, githubAuth, getXUserInfo, getXEngagementSummary } = deps;
  const userId = `github:${githubUserId}`;
  const validToken = await githubAuth.getValidAccessToken(githubUserId);
  if (!validToken) {
    throw new Error(`dashboard: no valid GitHub token for github user ${githubUserId}`);
  }

  const tokenData = database.getGithubToken(githubUserId);
  const user = publicUserFromToken(tokenData);

  let githubRepos;
  try {
    githubRepos = await githubAuth.getUserRepos(githubUserId);
  } catch (error) {
    throw new Error(
      `dashboard: failed to read repositories for github user ${githubUserId}: ${error.message}`
    );
  }

  const repositories = await Promise.all(githubRepos.map(async (repo) => {
    const ogPostId = await database.getOgPost(repo.full_name);
    const repoStatus = database.getRepoStatus(userId, repo.full_name);
    return normalizeRepo(repo, {
      enabled: repoStatus?.enabled || false,
      ogPostId,
    });
  }));

  const weekStartIso = startOfWeekUtc(now);
  const recentPosts = database.getRecentTweetsForUser(userId, 8);
  const postsThisWeek = database.getTweetCountForUserSince(userId, weekStartIso);
  const queueStats = database.getQueueItemStats();
  const xConnection = await readXConnection({ database, getXUserInfo, githubUserId });
  const averageEngagement = await getXEngagementSummary({
    userId,
    xConnection,
    recentPosts,
  });

  return {
    user,
    connections: {
      github: { connected: true, mode: 'read-only', login: user.login },
      x: xConnection,
      linkedin: { connected: false, status: 'coming-soon' },
    },
    stats: {
      postsThisWeek,
      enabledRepos: repositories.filter((repo) => repo.enabled).length,
      totalRepos: repositories.length,
      queue: queueStats,
      averageEngagement,
    },
    repositories,
    recentPosts,
    errors: [],
  };
}

module.exports = {
  buildDashboardModel,
  startOfWeekUtc,
};
