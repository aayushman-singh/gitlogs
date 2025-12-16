/**
 * Truncate text to max length while preserving words
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 
    ? truncated.substring(0, lastSpace) + '...'
    : truncated + '...';
}

/**
 * Calculate Twitter character count
 * URLs count as 23 characters regardless of actual length
 * @param {string} text - Text to count
 * @returns {number} - Twitter character count
 */
function calculateTwitterLength(text) {
  // Twitter counts URLs as 23 characters
  // Match URLs (http://, https://, or www.)
  const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
  let twitterLength = text.length;
  const matches = text.match(urlRegex);
  
  if (matches) {
    matches.forEach(url => {
      // Subtract actual URL length and add 23 (Twitter's URL length)
      twitterLength = twitterLength - url.length + 23;
    });
  }
  
  return twitterLength;
}

/**
 * Extract URLs from text
 * @param {string} text - Text to extract URLs from
 * @returns {string[]} - Array of URLs found
 */
function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
  const matches = text.match(urlRegex);
  return matches || [];
}

function parseCommitMessage(message) {
  const lines = message.split('\n');
  const firstLine = lines[0];
  const conventionalMatch = firstLine.match(/^(\w+)(\(.+\))?:\s*(.+)$/);
  
  if (conventionalMatch) {
    return {
      type: conventionalMatch[1],
      scope: conventionalMatch[2]?.replace(/[()]/g, ''),
      subject: conventionalMatch[3],
      body: lines.slice(1).join('\n').trim()
    };
  }
  
  return {
    type: null,
    scope: null,
    subject: firstLine,
    body: lines.slice(1).join('\n').trim()
  };
}

function getCommitEmoji(type) {
  const emojiMap = {
    feat: '✨',
    fix: '🐛',
    docs: '📝',
    style: '💄',
    refactor: '♻️',
    perf: '⚡',
    test: '✅',
    build: '🔧',
    ci: '👷',
    chore: '🔨'
  };
  
  return emojiMap[type] || '🚀';
}

function formatCommit(commit, repository, pusher) {
  const parsed = parseCommitMessage(commit.message);
  const shortSha = commit.id.substring(0, 7);
  const emoji = getCommitEmoji(parsed.type);
  const maxMessageLength = 180;
  const truncatedSubject = truncateText(parsed.subject, maxMessageLength);
  
  const tweetText = [
    `${emoji} ${truncatedSubject}`,
    '',
    `📦 ${repository.name}`,
    `👤 ${pusher.name}`,
    `🔗 ${commit.url}`,
    '',
    '#coding #github #dev'
  ].join('\n');
  
  return {
    text: tweetText,
    sha: shortSha,
    fullSha: commit.id,
    subject: parsed.subject,
    message: commit.message,
    type: parsed.type,
    emoji: emoji,
    author: pusher.name,
    authorEmail: commit.author.email,
    repoName: repository.name,
    repoFullName: repository.full_name,
    url: commit.url,
    timestamp: commit.timestamp,
    filesChanged: commit.added.length + commit.modified.length + commit.removed.length,
    additions: 0,
    deletions: 0
  };
}

function formatTweetText(changelogText, commitData, repository, pusher) {
  const emoji = getCommitEmoji(commitData.type);
  const MAX_TWITTER_LENGTH = 280;
  
  // Helper function to build tweet with a given changelog
  const buildTweet = (changelog) => {
    return [
      `${emoji} ${changelog}`,
      '',
      `📦 ${repository.name}`,
      `👤 ${pusher.name}`,
      `🔗 ${commitData.url}`,
      '',
      '#coding #github #dev'
    ].join('\n');
  };
  
  // Start with full changelog
  let finalChangelog = changelogText;
  let tweetText = buildTweet(finalChangelog);
  let twitterLength = calculateTwitterLength(tweetText);
  
  // If too long, truncate changelog iteratively
  if (twitterLength > MAX_TWITTER_LENGTH) {
    // Calculate metadata length (without changelog)
    const metadataTweet = buildTweet('');
    const metadataLength = calculateTwitterLength(metadataTweet) - 2; // Subtract emoji + space
    
    // Available space for changelog (with buffer)
    const availableLength = MAX_TWITTER_LENGTH - metadataLength - 10;
    
    // Truncate changelog
    if (changelogText.length > availableLength) {
      const truncated = changelogText.substring(0, availableLength);
      const lastBullet = truncated.lastIndexOf('\n- ');
      if (lastBullet > availableLength * 0.7) {
        finalChangelog = truncated.substring(0, lastBullet) + '...';
      } else {
        finalChangelog = truncateText(changelogText, availableLength);
      }
    } else {
      finalChangelog = changelogText;
    }
    
    // Rebuild and verify
    tweetText = buildTweet(finalChangelog);
    twitterLength = calculateTwitterLength(tweetText);
    
    // If still too long, truncate more aggressively
    if (twitterLength > MAX_TWITTER_LENGTH) {
      const excess = twitterLength - MAX_TWITTER_LENGTH;
      const newMaxLength = Math.max(50, finalChangelog.length - excess - 5);
      finalChangelog = truncateText(changelogText, newMaxLength);
      tweetText = buildTweet(finalChangelog);
      twitterLength = calculateTwitterLength(tweetText);
      
      // Last resort: remove hashtags if still too long
      if (twitterLength > MAX_TWITTER_LENGTH) {
        tweetText = [
          `${emoji} ${finalChangelog}`,
          '',
          `📦 ${repository.name}`,
          `👤 ${pusher.name}`,
          `🔗 ${commitData.url}`
        ].join('\n');
        twitterLength = calculateTwitterLength(tweetText);
        
        // Final truncation if needed
        if (twitterLength > MAX_TWITTER_LENGTH) {
          const finalExcess = twitterLength - MAX_TWITTER_LENGTH;
          const finalMaxLength = Math.max(30, finalChangelog.length - finalExcess);
          finalChangelog = truncateText(changelogText, finalMaxLength);
          tweetText = [
            `${emoji} ${finalChangelog}`,
            '',
            `📦 ${repository.name}`,
            `👤 ${pusher.name}`,
            `🔗 ${commitData.url}`
          ].join('\n');
        }
      }
    }
  }
  
  return tweetText;
}

module.exports = {
  formatCommit,
  formatTweetText,
  truncateText,
  parseCommitMessage,
  calculateTwitterLength,
  extractUrls
};

