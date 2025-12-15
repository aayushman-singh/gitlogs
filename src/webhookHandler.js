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
    const contentType = req.headers['content-type'] || '';

    // Get raw body for signature verification (as sent by GitHub)
    let rawBody = req.rawBody;
    if (Buffer.isBuffer(rawBody)) {
      rawBody = rawBody.toString('utf8');
    }

    // Verify signature using raw body (GitHub signs the raw request body)
    if (!verifyGitHubSignature(rawBody, signature)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload based on content type
    // Note: We parse from rawBody because express.raw() consumes the stream,
    // preventing express.json() from parsing it properly
    let body;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Form-encoded: GitHub sends payload=<json_string>
      const querystring = require('querystring');
      const parsed = querystring.parse(rawBody);
      if (!parsed.payload) {
        console.error('❌ Missing payload in form-encoded webhook');
        return res.status(400).send('Missing payload');
      }
      body = JSON.parse(parsed.payload);
    } else {
      // JSON payload: Parse directly from rawBody since express.raw() consumed the stream
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

    // Filter out merge commits and process individual commits
    const nonMergeCommits = commits.filter(commit => !isMergeCommit(commit));
    
    console.log(`📝 Processing ${nonMergeCommits.length} non-merge commits (skipped ${commits.length - nonMergeCommits.length} merge commits)`);

    for (const commit of nonMergeCommits) {
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

