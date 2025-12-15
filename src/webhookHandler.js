const crypto = require('crypto');
const config = require('../config/config');
const commitFormatter = require('./commitFormatter');
const imageGenerator = require('./imageGenerator');
const twitterClient = require('./twitterClient');
const database = require('./database');

/**
 * GitHub webhook handler
 * Verifies webhook signature and processes push events
 */

/**
 * Verify GitHub webhook signature
 * This ensures the request actually came from GitHub
 * 
 * @param {string} payload - Raw request body as string
 * @param {string} signature - X-Hub-Signature-256 header value
 * @returns {boolean} - True if signature is valid
 */
function verifyGitHubSignature(payload, signature) {
  if (!config.github.webhookSecret) {
    console.warn('⚠️  Webhook secret not set - skipping verification (NOT RECOMMENDED)');
    return true;
  }

  if (!signature) {
    console.error('❌ No signature provided in request');
    return false;
  }

  // Create HMAC signature using webhook secret
  const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
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
 * Check if repository is allowed based on config
 * 
 * @param {string} repoFullName - Repository full name (owner/repo)
 * @returns {boolean} - True if repo is allowed
 */
function isRepoAllowed(repoFullName) {
  // If no filter is set, allow all repos
  if (!config.github.allowedRepos) {
    return true;
  }

  return config.github.allowedRepos.includes(repoFullName);
}

/**
 * Process a single commit
 * Generates image and posts to Twitter
 * 
 * @param {object} commit - Commit data from GitHub
 * @param {object} repository - Repository data from GitHub
 * @param {object} pusher - Pusher data from GitHub
 */
async function processCommit(commit, repository, pusher) {
  try {
    console.log(`📝 Processing commit: ${commit.id.substring(0, 7)}`);

    // Step 1: Format commit data for tweet
    const tweetData = commitFormatter.formatCommit(commit, repository, pusher);

    // Step 2: Generate commit preview image
    console.log('🎨 Generating image...');
    const imageBuffer = await imageGenerator.generateImage(tweetData);

    // Step 3: Get previous tweet ID for threading (if enabled)
    let replyToId = null;
    if (config.database.enabled) {
      replyToId = await database.getLastTweetId(repository.full_name);
    }

    // Step 4: Post to Twitter
    console.log('🐦 Posting to Twitter...');
    const tweetId = await twitterClient.postTweet(
      tweetData.text,
      imageBuffer,
      replyToId
    );

    // Step 5: Save tweet ID for future threading
    if (config.database.enabled) {
      await database.saveTweetId(
        repository.full_name,
        commit.id,
        tweetId
      );
    }

    console.log(`✅ Successfully posted tweet: ${tweetId}`);
    console.log(`🔗 https://twitter.com/user/status/${tweetId}`);

  } catch (error) {
    console.error(`❌ Error processing commit ${commit.id}:`, error.message);
    // Don't throw - continue processing other commits
  }
}

/**
 * Main webhook handler
 * Express route handler for POST /webhook/github
 */
async function handleWebhook(req, res) {
  try {
    // Get signature from headers
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    // Verify signature
    const payload = JSON.stringify(req.body);
    if (!verifyGitHubSignature(payload, signature)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }

    // Only handle push events
    if (event !== 'push') {
      console.log(`ℹ️  Ignoring ${event} event`);
      return res.status(200).send('Event ignored');
    }

    // Extract data from webhook payload
    const { commits, repository, pusher, ref } = req.body;

    // Log the push event
    console.log(`\n🔔 Push event received`);
    console.log(`📦 Repository: ${repository.full_name}`);
    console.log(`🌿 Branch: ${ref}`);
    console.log(`📊 Commits: ${commits.length}`);

    // Check if repository is allowed
    if (!isRepoAllowed(repository.full_name)) {
      console.log(`⏭️  Repository ${repository.full_name} not in allowed list`);
      return res.status(200).send('Repository not allowed');
    }

    // Process each commit
    // Note: GitHub sends commits in chronological order (oldest first)
    for (const commit of commits) {
      await processCommit(commit, repository, pusher);
    }

    // Respond to GitHub that webhook was processed
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    // Still respond 200 to GitHub to avoid retries
    res.status(200).send('Error processed');
  }
}

module.exports = {
  handleWebhook
};

