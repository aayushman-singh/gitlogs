const crypto = require('crypto');
const config = require('../config/config');
const commitFormatter = require('./commitFormatter');
const geminiClient = require('./geminiClient');
const twitterClient = require('./twitterClient');
const database = require('./database');

/**
 * Verify GitHub webhook signature
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

  const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
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

function isRepoAllowed(repoFullName) {
  if (!config.github.allowedRepos) {
    return true;
  }
  return config.github.allowedRepos.includes(repoFullName);
}

async function processCommit(commit, repository, pusher) {
  try {
    console.log(`📝 Processing commit: ${commit.id.substring(0, 7)}`);

    const commitData = commitFormatter.formatCommit(commit, repository, pusher);

    let changelogText = commitData.subject;
    if (geminiClient.isInitialized()) {
      console.log('🤖 Generating changelog with Gemini AI...');
      const commitContext = {
        message: commit.message,
        type: commitData.type,
        filesChanged: commitData.filesChanged,
        added: commit.added || [],
        modified: commit.modified || [],
        removed: commit.removed || []
      };
      changelogText = await geminiClient.generateChangelog(commitContext, repository);
    }

    const tweetData = commitFormatter.formatTweetText(
      changelogText,
      commitData,
      repository,
      pusher
    );

    let replyToId = null;
    if (config.database.enabled) {
      replyToId = await database.getLastTweetId(repository.full_name);
    }

    console.log('🐦 Posting to Twitter...');
    const tweetId = await twitterClient.postTweet(tweetData, null, replyToId);

    if (config.database.enabled) {
      await database.saveTweetId(repository.full_name, commit.id, tweetId);
    }

    console.log(`✅ Successfully posted tweet: ${tweetId}`);
    console.log(`🔗 https://twitter.com/user/status/${tweetId}`);

  } catch (error) {
    console.error(`❌ Error processing commit ${commit.id}:`, error.message);
  }
}

async function handleWebhook(req, res) {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    const payload = JSON.stringify(req.body);
    if (!verifyGitHubSignature(payload, signature)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }

    if (event !== 'push') {
      console.log(`ℹ️  Ignoring ${event} event`);
      return res.status(200).send('Event ignored');
    }

    const { commits, repository, pusher, ref } = req.body;

    console.log(`\n🔔 Push event received`);
    console.log(`📦 Repository: ${repository.full_name}`);
    console.log(`🌿 Branch: ${ref}`);
    console.log(`📊 Commits: ${commits.length}`);

    if (!isRepoAllowed(repository.full_name)) {
      console.log(`⏭️  Repository ${repository.full_name} not in allowed list`);
      return res.status(200).send('Repository not allowed');
    }

    for (const commit of commits) {
      await processCommit(commit, repository, pusher);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(200).send('Error processed');
  }
}

module.exports = {
  handleWebhook
};

