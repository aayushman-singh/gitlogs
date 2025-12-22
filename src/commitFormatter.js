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

/**
 * Remove all emojis from text
 * Filters out emoji characters including Unicode ranges and common symbols
 * @param {string} text - Text to filter
 * @returns {string} - Text with emojis removed
 */
function removeEmojis(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  // Comprehensive emoji regex covering:
  // - Emoticons (😀-🙏)
  // - Symbols & Pictographs (🌀-🗿)
  // - Transport & Map Symbols (🚀-🛿)
  // - Flags (🇦-🇿)
  // - Miscellaneous Symbols (☀-⛿)
  // - Dingbats (✀-➿)
  // - Supplemental Symbols (🀀-🃿)
  // - Emoji modifiers and zero-width joiners
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu;
  
  return text.replace(emojiRegex, '').trim();
}

/**
 * Remove all hashtags from text
 * Filters out hashtag patterns like #hashtag or #coding #github
 * @param {string} text - Text to filter
 * @returns {string} - Text with hashtags removed
 */
function removeHashtags(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  // Remove hashtags (word starting with #)
  // This regex matches # followed by word characters, including at start/end of line
  const hashtagRegex = /#\w+/g;
  
  return text.replace(hashtagRegex, '').trim();
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

function formatTweetText(changelogText, commitData, repository, pusher, options = {}) {
  const { isDefaultTemplate = true } = options;
  const MAX_TWITTER_LENGTH = 280;
  
  // Validate changelog text
  if (!changelogText || typeof changelogText !== 'string' || changelogText.trim().length === 0) {
    changelogText = commitData.subject || 'update: changes made';
  }
  
  // Get repository URL (prefer html_url, fallback to constructing from full_name)
  const repoUrl = repository.html_url || (repository.full_name ? `https://github.com/${repository.full_name}/` : 'https://github.com/');
  
  // Helper function to build tweet with a given changelog
  // Only add repo info and "please star" message for default template
  const buildTweet = (changelog) => {
    // For custom templates, return the changelog as-is (user controls the format)
    if (!isDefaultTemplate) {
      return changelog;
    }
    
    // Default template: add repo info and "please star" message
    return [
      changelog,
      '',
      repository.name || 'Gitlogs',
      `🔗 ${repoUrl}`,
      '',
      'please star the repo ^^ if you like it!'
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
    const metadataLength = calculateTwitterLength(metadataTweet);
    
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
      
      // Last resort: shorten the "please star" message if still too long
      if (twitterLength > MAX_TWITTER_LENGTH) {
        tweetText = [
          finalChangelog,
          '',
          repository.name || 'Gitlogs',
          `🔗 ${repoUrl}`,
          '',
          'please star the repo ^^ if you like it!'
        ].join('\n');
        twitterLength = calculateTwitterLength(tweetText);
        
        // Final truncation if needed
        if (twitterLength > MAX_TWITTER_LENGTH) {
          const finalExcess = twitterLength - MAX_TWITTER_LENGTH;
          const finalMaxLength = Math.max(30, finalChangelog.length - finalExcess);
          finalChangelog = truncateText(changelogText, finalMaxLength);
          tweetText = buildTweet(finalChangelog);
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
  extractUrls,
  removeEmojis,
  removeHashtags
};

