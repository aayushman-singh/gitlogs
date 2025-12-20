const crypto = require('crypto');
const config = require('../config/config');
const commitFormatter = require('./commitFormatter');
const geminiClient = require('./geminiClient');
const twitterClient = require('./twitterClient');
const database = require('./database');
const repoIndexer = require('./repoIndexer');

/**
 * Verify GitHub webhook signature
 * Supports both global secret and per-repository secrets (multi-user)
 * 
 * @param {string} payload - Raw request body as string
 * @param {string} signature - X-Hub-Signature-256 header value
 * @param {string} repoFullName - Repository full name for per-repo secrets
 * @returns {boolean} - True if signature is valid
 */
function verifyGitHubSignature(payload, signature, repoFullName = null) {
  // Try per-repository secret first (multi-user support)
  let secret = null;
  if (repoFullName) {
    secret = database.getRepoWebhookSecret(repoFullName);
  }
  
  // Fall back to global secret
  if (!secret) {
    secret = config.github.webhookSecret;
  }
  
  if (!secret) {
    console.warn('⚠️  Webhook secret not set - skipping verification (NOT RECOMMENDED)');
    return true;
  }

  if (!signature) {
    console.error('❌ No signature provided in request');
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch (err) {
    return false;
  }
}

/**
 * Check if repository is allowed and enabled for posting (supports multi-user)
 */
function isRepoAllowed(repoFullName) {
  // First check if repo is enabled by any user
  if (database.isRepoEnabled(repoFullName)) {
    return true;
  }
  
  // Fall back to global allowed repos list (for legacy/admin use)
  if (!config.github.allowedRepos) {
    return false; // No global list and not enabled by user = not allowed
  }
  return config.github.allowedRepos.includes(repoFullName);
}

/**
 * Get or generate repository context
 * Caches context for performance
 */
async function getOrGenerateRepoContext(repository, commits = []) {
  const repoFullName = repository.full_name;
  
  // Check cache first
  if (!database.isRepoContextStale(repoFullName, 24)) {
    const cached = database.getRepoContext(repoFullName);
    if (cached) {
      console.log(`📦 Using cached repo context for: ${repoFullName}`);
      return cached;
    }
  }
  
  // Generate context from webhook data (no local clone needed)
  console.log(`🔍 Generating repo context for: ${repoFullName}`);
  const context = repoIndexer.generateContextFromWebhook(repository, commits);
  
  // Cache the context
  database.storeRepoContext(repoFullName, context, context.description || '');
  
  return context;
}

function isMergeCommit(commit) {
  // Check if commit message indicates a merge
  const message = commit.message || '';
  const mergePatterns = [
    /^Merge branch/i,
    /^Merge pull request/i,
    /^Merge .+ into/i,
    /^Merged .+ into/i
  ];
  
  // Check message patterns
  if (mergePatterns.some(pattern => pattern.test(message))) {
    return true;
  }
  
  // Check if commit has multiple parents (merge commit)
  // Note: GitHub webhook doesn't always include parent info, so we rely on message
  return false;
}

/**
 * Process a single commit with enhanced context
 * @param {object} commit - Git commit object
 * @param {object} repository - Repository information
 * @param {object} pusher - Pusher information
 * @param {object} options - Additional options (repoContext, userId)
 */
async function processCommit(commit, repository, pusher, options = {}) {
  const { repoContext = null, userId = 'default' } = options;
  
  try {
    console.log(`📝 Processing commit: ${commit.id.substring(0, 7)} (user: ${userId})`);

    const commitData = commitFormatter.formatCommit(commit, repository, pusher);

    let changelogText = commitData.subject;
    if (geminiClient.isInitialized()) {
      console.log('🤖 Generating changelog with Gemini AI (with project context)...');
      
      const commitContext = {
        message: commit.message,
        type: commitData.type,
        filesChanged: commitData.filesChanged,
        added: commit.added || [],
        modified: commit.modified || [],
        removed: commit.removed || [],
        sha: commit.id.substring(0, 7)
      };
      
      // Pass repo context and user ID for enhanced prompts and quota tracking
      changelogText = await geminiClient.generateChangelog(commitContext, repository, {
        userId,
        repoContext,
        priority: geminiClient.PRIORITY.NORMAL
      });
    }

    const tweetData = commitFormatter.formatTweetText(
      changelogText,
      commitData,
      repository,
      pusher
    );

    // Validate tweet data before posting
    if (!tweetData || typeof tweetData !== 'string' || tweetData.trim().length === 0) {
      throw new Error(`Invalid tweet data generated for commit ${commit.id.substring(0, 7)}`);
    }

    // Get OG post to quote (if set for this repo)
    let quoteTweetId = null;
    if (config.database.enabled) {
      quoteTweetId = await database.getOgPost(repository.full_name);
    }

    console.log('🐦 Posting to X...');
    console.log(`📝 Tweet preview (${tweetData.length} chars): ${tweetData.substring(0, 100)}...`);
    const tweetId = await twitterClient.postTweet(tweetData, null, quoteTweetId);

    if (config.database.enabled) {
      await database.saveTweetId(repository.full_name, commit.id, tweetId);
    }

    console.log(`✅ Successfully posted tweet: ${tweetId}`);
    console.log(`🔗 https://x.com/user/status/${tweetId}`);

    return { success: true, tweetId };

  } catch (error) {
    console.error(`❌ Error processing commit ${commit.id}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function handleWebhook(req, res) {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];
    const contentType = req.headers['content-type'] || '';

    // Get raw body for signature verification (as sent by GitHub)
    let rawBody = req.rawBody;
    if (Buffer.isBuffer(rawBody)) {
      rawBody = rawBody.toString('utf8');
    }

    // Parse the payload first to get repo name for per-repo secret lookup
    let body;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const querystring = require('querystring');
      const parsed = querystring.parse(rawBody);
      if (!parsed.payload) {
        console.error('❌ Missing payload in form-encoded webhook');
        return res.status(400).send('Missing payload');
      }
      body = JSON.parse(parsed.payload);
    } else {
      try {
        body = JSON.parse(rawBody);
      } catch (parseError) {
        console.error('❌ Failed to parse JSON payload:', parseError.message);
        console.error('Raw body preview:', rawBody.substring(0, 200));
        return res.status(400).send('Invalid JSON payload');
      }
    }

    if (!body || typeof body !== 'object') {
      console.error('❌ Invalid body structure:', typeof body);
      return res.status(400).send('Invalid body structure');
    }

    // Get repository name for per-repo secret verification
    const repoFullName = body.repository?.full_name;

    // Verify signature using raw body (supports per-repo secrets)
    if (!verifyGitHubSignature(rawBody, signature, repoFullName)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }

    if (event !== 'push') {
      console.log(`ℹ️  Ignoring ${event} event`);
      return res.status(200).send('Event ignored');
    }

    const { commits, repository, pusher, ref } = body;

    console.log(`\n🔔 Push event received`);

    // Validate required fields
    if (!repository) {
      console.error('❌ Missing repository in webhook payload');
      return res.status(400).send('Missing repository');
    }

    if (!repository.full_name) {
      console.error('❌ Missing repository.full_name in webhook payload');
      return res.status(400).send('Missing repository.full_name');
    }

    if (!commits || !Array.isArray(commits)) {
      console.error('❌ Missing or invalid commits array in webhook payload');
      return res.status(400).send('Missing or invalid commits');
    }

    console.log(`📦 Repository: ${repository.full_name}`);
    console.log(`🌿 Branch: ${ref || 'unknown'}`);
    console.log(`📊 Commits: ${commits.length}`);

    if (!isRepoAllowed(repository.full_name)) {
      console.log(`⏭️  Repository ${repository.full_name} not in allowed list`);
      return res.status(200).send('Repository not allowed');
    }

    // Get user associated with this repository (multi-user support)
    const user = database.getUserByRepo(repository.full_name);
    const userId = user ? user.user_id : 'default';
    
    if (user) {
      console.log(`👤 User: ${user.display_name || user.user_id}`);
    }

    // Generate/fetch repository context for enhanced AI prompts
    const repoContext = await getOrGenerateRepoContext(repository, commits);
    console.log(`📋 Repo context: ${repoContext.languages?.join(', ') || 'unknown stack'}`);

    // Filter out merge commits and process individual commits
    const nonMergeCommits = commits.filter(commit => !isMergeCommit(commit));
    
    console.log(`📝 Processing ${nonMergeCommits.length} non-merge commits (skipped ${commits.length - nonMergeCommits.length} merge commits)`);

    // Process commits with enhanced context
    const results = [];
    for (const commit of nonMergeCommits) {
      const result = await processCommit(commit, repository, pusher, {
        repoContext,
        userId
      });
      results.push(result);
    }

    // Log queue stats for monitoring
    const queueStats = geminiClient.getQueueStats();
    if (queueStats) {
      console.log(`📊 Queue stats: ${queueStats.currentQueueLength} pending, ${queueStats.totalProcessed} processed, ${queueStats.rateLimitRemaining} rate limit remaining`);
    }

    const successCount = results.filter(r => r.success).length;
    res.status(200).json({
      status: 'OK',
      processed: successCount,
      total: nonMergeCommits.length,
      userId
    });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(200).send('Error processed');
  }
}

/**
 * Get queue statistics (for admin/monitoring endpoints)
 */
function getStats() {
  return {
    queue: geminiClient.getQueueStats()
  };
}

module.exports = {
  handleWebhook,
  getStats,
  getOrGenerateRepoContext
};

