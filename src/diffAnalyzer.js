/**
 * Diff Analyzer Module
 * Fetches and analyzes git diffs from GitHub API
 * 
 * Two-stage approach:
 * 1. Fetch diff from GitHub API
 * 2. AI analyzes diff to extract meaningful change summary
 * 3. Summary is used by changelog generator for accurate descriptions
 */

const database = require('./database');

// Maximum diff size to send to AI (characters)
const MAX_DIFF_SIZE = 4000;

// Maximum files to include in diff analysis
const MAX_FILES_TO_ANALYZE = 10;

/**
 * Fetch commit diff from GitHub API
 * 
 * @param {string} repoFullName - Full repository name (owner/repo)
 * @param {string} commitSha - Commit SHA to fetch diff for
 * @param {string} githubUserId - GitHub user ID for authentication
 * @returns {Promise<object>} - { diff, files, stats, error }
 */
async function fetchCommitDiff(repoFullName, commitSha, githubUserId = null) {
  try {
    const [owner, repo] = repoFullName.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`;
    
    // Build headers
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot/1.0'
    };
    
    // Try to use user's GitHub token for higher rate limits
    if (githubUserId) {
      const tokenData = database.getGithubToken(githubUserId);
      if (tokenData && tokenData.token) {
        headers['Authorization'] = `Bearer ${tokenData.token}`;
      }
    }
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`⚠️  Commit ${commitSha} not found in ${repoFullName}`);
        return { diff: null, files: [], stats: null, error: 'Commit not found' };
      }
      if (response.status === 403) {
        console.warn('⚠️  GitHub API rate limit reached');
        return { diff: null, files: [], stats: null, error: 'Rate limit exceeded' };
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract file changes with patches (diffs)
    const files = (data.files || []).slice(0, MAX_FILES_TO_ANALYZE).map(file => ({
      filename: file.filename,
      status: file.status, // added, removed, modified, renamed
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch || null // The actual diff content
    }));
    
    // Build a combined diff summary
    const diffParts = [];
    let totalSize = 0;
    
    for (const file of files) {
      if (file.patch && totalSize < MAX_DIFF_SIZE) {
        const fileHeader = `\n--- ${file.filename} (${file.status}: +${file.additions}/-${file.deletions}) ---\n`;
        const remainingSpace = MAX_DIFF_SIZE - totalSize - fileHeader.length;
        
        if (remainingSpace > 100) {
          const truncatedPatch = file.patch.length > remainingSpace 
            ? file.patch.substring(0, remainingSpace) + '\n... (truncated)'
            : file.patch;
          
          diffParts.push(fileHeader + truncatedPatch);
          totalSize += fileHeader.length + truncatedPatch.length;
        }
      }
    }
    
    const combinedDiff = diffParts.join('\n');
    
    // Stats summary
    const stats = {
      total: data.stats?.total || 0,
      additions: data.stats?.additions || 0,
      deletions: data.stats?.deletions || 0,
      filesChanged: files.length
    };
    
    console.log(`📄 Fetched diff for ${commitSha.substring(0, 7)}: ${stats.filesChanged} files, +${stats.additions}/-${stats.deletions}`);
    
    return {
      diff: combinedDiff,
      files,
      stats,
      error: null
    };
    
  } catch (error) {
    console.error(`❌ Error fetching diff for ${commitSha}:`, error.message);
    return {
      diff: null,
      files: [],
      stats: null,
      error: error.message
    };
  }
}

/**
 * Build a prompt for AI to analyze the diff
 * 
 * @param {object} diffData - Data from fetchCommitDiff
 * @param {string} commitMessage - Original commit message
 * @param {string} repoName - Repository name
 * @returns {string} - Prompt for diff analysis
 */
function buildDiffAnalysisPrompt(diffData, commitMessage, repoName) {
  const { diff, files, stats } = diffData;
  
  // If no diff available, return null to skip analysis
  if (!diff || diff.trim().length === 0) {
    return null;
  }
  
  const fileList = files.map(f => `- ${f.filename} (${f.status}: +${f.additions}/-${f.deletions})`).join('\n');
  
  return `Analyze this git diff and provide a FACTUAL summary of what changed. Only describe changes you can directly see in the diff.

Repository: ${repoName}
Commit Message: ${commitMessage}
Stats: ${stats.filesChanged} files changed, +${stats.additions} additions, -${stats.deletions} deletions

Files Changed:
${fileList}

Diff Content:
${diff}

INSTRUCTIONS:
1. Summarize ONLY what you can see in the diff above - do not invent or assume features
2. Focus on the PURPOSE of the changes, not line-by-line details
3. Use plain language, no jargon
4. Keep summary to 2-4 bullet points
5. Each bullet should be under 50 characters
6. If changes are unclear from diff, describe file types/areas modified
7. NO emojis, NO hashtags

Format your response as:
- [first change]
- [second change]
- [third change if applicable]

Example good response:
- added opengraph meta tags for social sharing
- updated share page to use new og component
- removed old logo images

Example BAD response (DO NOT DO THIS):
- added CLI debug flag (NOT in diff!)
- improved performance (vague/assumed!)
- ✨ new features (emojis not allowed!)`;
}

/**
 * Extract a simple file-based summary when diff is unavailable
 * This is a fallback when GitHub API fails or diff is empty
 * 
 * @param {object} commit - Commit object from webhook
 * @returns {string} - Simple summary based on file names
 */
function buildFileBasedSummary(commit) {
  const added = commit.added || [];
  const modified = commit.modified || [];
  const removed = commit.removed || [];
  
  const parts = [];
  
  // Analyze file patterns
  const allFiles = [...added, ...modified, ...removed];
  
  // Group by directory/type
  const patterns = {
    components: allFiles.filter(f => f.includes('component') || f.includes('Component')),
    pages: allFiles.filter(f => f.includes('page') || f.includes('Page') || f.includes('/pages/')),
    styles: allFiles.filter(f => f.endsWith('.css') || f.endsWith('.scss') || f.includes('style')),
    api: allFiles.filter(f => f.includes('/api/') || f.includes('api.')),
    config: allFiles.filter(f => f.includes('config') || f.includes('.json') || f.includes('.env')),
    images: allFiles.filter(f => /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(f)),
    tests: allFiles.filter(f => f.includes('test') || f.includes('spec'))
  };
  
  if (added.length > 0) {
    if (patterns.components.length > 0) {
      parts.push(`added ${patterns.components.length} component(s)`);
    } else if (patterns.pages.length > 0) {
      parts.push(`added ${patterns.pages.length} page(s)`);
    } else if (patterns.images.length > 0) {
      parts.push(`added ${patterns.images.length} image(s)`);
    } else {
      parts.push(`added ${added.length} file(s)`);
    }
  }
  
  if (modified.length > 0) {
    // Try to identify what was modified
    const modifiedPatterns = Object.entries(patterns)
      .filter(([, files]) => files.some(f => modified.includes(f)))
      .map(([type]) => type);
    
    if (modifiedPatterns.length > 0) {
      parts.push(`updated ${modifiedPatterns.slice(0, 2).join(' and ')}`);
    } else {
      parts.push(`modified ${modified.length} file(s)`);
    }
  }
  
  if (removed.length > 0) {
    if (patterns.images.filter(f => removed.includes(f)).length > 0) {
      parts.push('removed old images');
    } else {
      parts.push(`removed ${removed.length} file(s)`);
    }
  }
  
  return parts.length > 0 ? parts.join(', ') : 'code changes';
}

/**
 * Check if we should skip diff analysis
 * (for very simple commits where file names are sufficient)
 * 
 * @param {object} commit - Commit object
 * @returns {boolean} - True if diff analysis should be skipped
 */
function shouldSkipDiffAnalysis(commit) {
  const totalFiles = (commit.added?.length || 0) + 
                     (commit.modified?.length || 0) + 
                     (commit.removed?.length || 0);
  
  // Skip if only images/assets changed
  const allFiles = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
  const onlyAssets = allFiles.every(f => 
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|mp4|mp3|pdf)$/i.test(f)
  );
  
  if (onlyAssets) {
    console.log('📦 Skipping diff analysis - only assets changed');
    return true;
  }
  
  // Skip if too many files (probably a large refactor/merge)
  if (totalFiles > 50) {
    console.log('📦 Skipping diff analysis - too many files changed');
    return true;
  }
  
  return false;
}

module.exports = {
  fetchCommitDiff,
  buildDiffAnalysisPrompt,
  buildFileBasedSummary,
  shouldSkipDiffAnalysis,
  MAX_DIFF_SIZE,
  MAX_FILES_TO_ANALYZE
};

