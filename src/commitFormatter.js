/**
 * Format commit data into tweet-ready content
 * Handles message truncation, hashtags, and metadata
 */

/**
 * Truncate text to max length while preserving words
 * 
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  
  // Find last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 
    ? truncated.substring(0, lastSpace) + '...'
    : truncated + '...';
}

/**
 * Extract commit message parts
 * Handles conventional commit format (feat:, fix:, etc.)
 * 
 * @param {string} message - Full commit message
 * @returns {object} - Parsed message parts
 */
function parseCommitMessage(message) {
  const lines = message.split('\n');
  const firstLine = lines[0];
  
  // Check for conventional commit format
  const conventionalMatch = firstLine.match(/^(\w+)(\(.+\))?:\s*(.+)$/);
  
  if (conventionalMatch) {
    return {
      type: conventionalMatch[1], // feat, fix, etc.
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

/**
 * Get emoji for commit type
 * 
 * @param {string} type - Commit type (feat, fix, etc.)
 * @returns {string} - Emoji
 */
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

/**
 * Format commit data into tweet text and metadata
 * 
 * @param {object} commit - Commit data from GitHub
 * @param {object} repository - Repository data
 * @param {object} pusher - Pusher data
 * @returns {object} - Formatted tweet data
 */
function formatCommit(commit, repository, pusher) {
  // Parse commit message
  const parsed = parseCommitMessage(commit.message);
  
  // Get short SHA (first 7 characters)
  const shortSha = commit.id.substring(0, 7);
  
  // Get emoji based on commit type
  const emoji = getCommitEmoji(parsed.type);
  
  // Build tweet text
  // Twitter has 280 char limit, but we need room for URLs and hashtags
  const maxMessageLength = 180;
  const truncatedSubject = truncateText(parsed.subject, maxMessageLength);
  
  // Construct tweet text
  // Format: Emoji + Message + Author + SHA + Link + Hashtags
  const tweetText = [
    `${emoji} ${truncatedSubject}`,
    '',
    `📦 ${repository.name}`,
    `👤 ${pusher.name}`,
    `🔗 ${commit.url}`,
    '',
    '#coding #github #dev'
  ].join('\n');
  
  // Return formatted data for both tweet and image generation
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
    // Additional data for image generation
    filesChanged: commit.added.length + commit.modified.length + commit.removed.length,
    additions: 0, // Not available in webhook payload
    deletions: 0  // Not available in webhook payload
  };
}

module.exports = {
  formatCommit,
  truncateText,
  parseCommitMessage
};

