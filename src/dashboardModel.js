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

function pushSectionError(errors, section, message) {
  errors.push({ section, message });
}

async function readXConnection({ database, getXUserInfo, githubUserId, errors }) {
  const xOAuthUserId = database.getXOAuthUserId(githubUserId);
  const connected = Boolean(xOAuthUserId && database.isOAuthTokenValid(xOAuthUserId));
  if (!connected) {
    return {
      connected: false,
      userId: xOAuthUserId || null,
      username: null,
      name: null,
      profileImageUrl: null,
    };
  }

  try {
    const xUserInfo = await getXUserInfo(xOAuthUserId);
    if (!xUserInfo) {
      const message = `Failed to load X profile for ${xOAuthUserId}`;
      pushSectionError(errors, 'connections.x', message);
      return {
        connected: true,
        userId: xOAuthUserId,
        username: null,
        name: null,
        profileImageUrl: null,
        error: message,
      };
    }
    return {
      connected: true,
      userId: xOAuthUserId,
      username: xUserInfo.username || null,
      name: xUserInfo.name || xUserInfo.username || null,
      profileImageUrl: xUserInfo.profileImageUrl || null,
    };
  } catch (error) {
    const message = `Failed to load X profile for ${xOAuthUserId}: ${error.message}`;
    pushSectionError(errors, 'connections.x', message);
    return {
      connected: true,
      userId: xOAuthUserId,
      username: null,
      name: null,
      profileImageUrl: null,
      error: message,
    };
  }
}

async function buildDashboardModel({ githubUserId, deps, now = new Date() }) {
  if (!githubUserId) {
    throw new Error('dashboard: githubUserId is required');
  }

  const { database, githubAuth, getXUserInfo, getXEngagementSummary } = deps;
  const userId = `github:${githubUserId}`;
  const errors = [];
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

  const getOgPost = database.getOgPostForDashboard || database.getOgPost;
  const getRepoStatus = database.getRepoStatusForDashboard || database.getRepoStatus;

  let repositories;
  try {
    repositories = await Promise.all(githubRepos.map(async (repo) => {
      const ogPostId = await Promise.resolve(getOgPost(repo.full_name));
      const repoStatus = getRepoStatus(userId, repo.full_name);
      return normalizeRepo(repo, {
        enabled: Boolean(repoStatus?.enabled),
        ogPostId,
      });
    }));
  } catch (error) {
    throw new Error(
      `dashboard: failed to enrich repositories for github user ${githubUserId}: ${error.message}`
    );
  }

  const weekStartIso = startOfWeekUtc(now);

  let recentPosts;
  let postsThisWeek;
  try {
    recentPosts = database.getRecentTweetsForUser(userId, 8);
    postsThisWeek = database.getTweetCountForUserSince(userId, weekStartIso);
  } catch (error) {
    throw new Error(
      `dashboard: failed to read recent posts for ${userId}: ${error.message}`
    );
  }

  let queueStats = null;
  try {
    if (typeof database.getQueueItemStatsForUser !== 'function') {
      throw new Error('getQueueItemStatsForUser is required');
    }
    queueStats = database.getQueueItemStatsForUser(userId);
  } catch (error) {
    pushSectionError(
      errors,
      'queue',
      `Failed to read queue status for ${userId}: ${error.message}`
    );
    queueStats = null;
  }

  const xConnection = await readXConnection({ database, getXUserInfo, githubUserId, errors });
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
    errors,
  };
}

module.exports = {
  buildDashboardModel,
  startOfWeekUtc,
};
