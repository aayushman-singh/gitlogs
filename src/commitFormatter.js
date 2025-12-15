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
  const metadataLength = 100;
  const maxChangelogLength = 280 - metadataLength;
  
  let finalChangelog = changelogText;
  if (changelogText.length > maxChangelogLength) {
    const truncated = changelogText.substring(0, maxChangelogLength);
    const lastBullet = truncated.lastIndexOf('\n- ');
    if (lastBullet > maxChangelogLength * 0.7) {
      finalChangelog = truncated.substring(0, lastBullet) + '...';
    } else {
      finalChangelog = truncateText(changelogText, maxChangelogLength);
    }
  }
  
  const emoji = getCommitEmoji(commitData.type);
  
  const tweetText = [
    `${emoji} ${finalChangelog}`,
    '',
    `📦 ${repository.name}`,
    `👤 ${pusher.name}`,
    `🔗 ${commitData.url}`,
    '',
    '#coding #github #dev'
  ].join('\n');
  
  return tweetText;
}

module.exports = {
  formatCommit,
  formatTweetText,
  truncateText,
  parseCommitMessage
};

