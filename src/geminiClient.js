const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');
const { getQueueService, PRIORITY } = require('./queueService');
const database = require('./database');
const repoIndexer = require('./repoIndexer');

// Default prompt template - the original one
const DEFAULT_PROMPT_TEMPLATE = `You are a developer writing a log entry about your work. Write in a concise, technical style with bullet points.
{{PROJECT_CONTEXT}}
Commit Information:
- Repository: {{REPOSITORY}}
- Commit Type: {{COMMIT_TYPE}}
- Commit Message: {{COMMIT_MESSAGE}}
- Files Changed: {{FILES_CHANGED}}
{{ADDED_FILES}}
{{MODIFIED_FILES}}
{{REMOVED_FILES}}

CRITICAL RULES - MUST FOLLOW:
1. ABSOLUTELY NO EMOJIS - Do not use any emojis, symbols, or special characters. Only use plain text letters, numbers, commas, periods, colons, dashes, and spaces.
2. NO HASHTAGS - Do not include any hashtags in your output.
3. Starts with "update:" (lowercase, with colon)
4. Uses bullet points (dash format: "- ") to list what was changed
5. All sentences must be lowercase
6. Only punctuation allowed is comma "," and period "."
7. Abbreviate most things (e.g., "implementation" -> "impl", "configuration" -> "config", "authentication" -> "auth")
8. Talk about general changes and purpose rather than exact component or variable name changes
9. Focus on what was done and why, not specific code details
10. Keep it concise but informative (aim for 2-3 bullet points, maximum 150 characters total)
11. CRITICAL: The entire output must be 150 characters or less (including "update:" and all bullet points). This is for a tweet, so brevity is essential.
12. Use the PROJECT CONTEXT above to understand what this project is about and tailor the log entry accordingly.

Example Output:
update:
- migrated from firebase auth to custom github oauth.
- updated client & server for new auth service.

WRONG Example (DO NOT DO THIS):
update:
- ✨ refactored auth flow
- 🚀 added new features
- #coding #github (NO HASHTAGS!)

Format: Write only the log entry text, starting with "update:" followed by bullet points. No additional explanations, formatting, hashtags, or emojis. Keep it under 150 characters total. ABSOLUTELY NO EMOJIS OR HASHTAGS.`;

// Available template variables for user reference
const TEMPLATE_VARIABLES = {
  '{{PROJECT_CONTEXT}}': 'Project context including tech stack, frameworks, and description',
  '{{REPOSITORY}}': 'Repository name (e.g., owner/repo-name)',
  '{{COMMIT_TYPE}}': 'Type of commit (feat, fix, refactor, etc.)',
  '{{COMMIT_MESSAGE}}': 'Original commit message from Git',
  '{{FILES_CHANGED}}': 'Number of files changed',
  '{{ADDED_FILES}}': 'List of added files (if any)',
  '{{MODIFIED_FILES}}': 'List of modified files (if any)',
  '{{REMOVED_FILES}}': 'List of removed files (if any)',
  '{{AUTHOR}}': 'Commit author username',
  '{{BRANCH}}': 'Branch name where commit was pushed'
};

// Pre-built template variations
const TEMPLATE_PRESETS = {
  default: {
    id: 'default',
    name: 'Classic DevLog',
    description: 'Concise, technical bullet points. No emojis. Under 150 chars.',
    template: DEFAULT_PROMPT_TEMPLATE
  },
  casual: {
    id: 'casual',
    name: 'Casual Update',
    description: 'Friendly, conversational tone with some personality.',
    template: `You are a developer sharing what you worked on today. Be friendly and conversational.
{{PROJECT_CONTEXT}}
Commit Info:
- Repo: {{REPOSITORY}}
- Message: {{COMMIT_MESSAGE}}
- Files Changed: {{FILES_CHANGED}}

Write a brief, casual update about this commit. Be human and relatable.
- Keep it under 200 characters total
- Start with a casual opener like "just shipped", "working on", "pushed"
- NO emojis or hashtags
- Use lowercase, be informal but clear
- Focus on the "what" and "why" in simple terms

Example: just pushed some auth improvements. migrated to github oauth, much cleaner now.`
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Ultra-short, single line updates.',
    template: `Summarize this commit in one short sentence (max 100 characters).
{{PROJECT_CONTEXT}}
Repo: {{REPOSITORY}}
Message: {{COMMIT_MESSAGE}}
Files: {{FILES_CHANGED}}

Rules:
- One sentence only, no bullet points
- Under 100 characters
- No emojis, no hashtags
- Start with a verb (added, fixed, updated, refactored)
- Be specific but brief

Example: updated auth flow to use github oauth instead of firebase`
  },
  detailed: {
    id: 'detailed',
    name: 'Detailed Changelog',
    description: 'More comprehensive update with context.',
    template: `Write a changelog entry for this commit. Be informative but concise.
{{PROJECT_CONTEXT}}
Commit Details:
- Repository: {{REPOSITORY}}
- Type: {{COMMIT_TYPE}}
- Message: {{COMMIT_MESSAGE}}
- Files Changed: {{FILES_CHANGED}}
{{ADDED_FILES}}
{{MODIFIED_FILES}}
{{REMOVED_FILES}}

Format:
- Start with a summary line
- Use 2-4 bullet points for key changes
- Keep total under 250 characters
- NO emojis or hashtags
- Use technical but readable language
- Explain the impact or benefit briefly

Example:
auth system overhaul
- migrated from firebase to direct github oauth
- added refresh token support for persistent sessions
- simplified client-side auth flow`
  }
};

/**
 * Parse template content (handles both old and new formats)
 */
function parseTemplateContent(templateContent) {
  if (!templateContent) return { template: '', prompt: '', isNewFormat: false };
  
  // Try to parse as JSON (new format)
  try {
    const parsed = JSON.parse(templateContent);
    if (parsed.template !== undefined && parsed.prompt !== undefined) {
      return { 
        template: parsed.template || '', 
        prompt: parsed.prompt || '', 
        isNewFormat: true 
      };
    }
  } catch (e) {
    // Not JSON, treat as old format
  }
  
  // Old format: entire content is the prompt, template is empty
  return { template: '', prompt: templateContent, isNewFormat: false };
}

/**
 * Build prompt from template with variable substitution
 */
function buildPromptFromTemplate(templateContent, context, projectContext) {
  const parsed = parseTemplateContent(templateContent);
  
  // If new format: combine template (with variables replaced) + prompt instructions
  if (parsed.isNewFormat) {
    let templateWithVars = parsed.template;
    
    // Replace all template variables in the template
    templateWithVars = templateWithVars.replace(/\{\{PROJECT_CONTEXT\}\}/g, projectContext || '');
    templateWithVars = templateWithVars.replace(/\{\{REPOSITORY\}\}/g, context.repository || '');
    templateWithVars = templateWithVars.replace(/\{\{COMMIT_TYPE\}\}/g, context.commitType || 'change');
    templateWithVars = templateWithVars.replace(/\{\{COMMIT_MESSAGE\}\}/g, context.commitMessage || '');
    templateWithVars = templateWithVars.replace(/\{\{FILES_CHANGED\}\}/g, context.filesChanged?.toString() || '0');
    templateWithVars = templateWithVars.replace(/\{\{AUTHOR\}\}/g, context.author || '');
    templateWithVars = templateWithVars.replace(/\{\{BRANCH\}\}/g, context.branch || 'main');
    
    // Handle file lists
    const addedFiles = context.addedFiles?.length > 0 
      ? `- Added Files: ${context.addedFiles.join(', ')}` 
      : '';
    const modifiedFiles = context.modifiedFiles?.length > 0 
      ? `- Modified Files: ${context.modifiedFiles.join(', ')}` 
      : '';
    const removedFiles = context.removedFiles?.length > 0 
      ? `- Removed Files: ${context.removedFiles.join(', ')}` 
      : '';
    
    templateWithVars = templateWithVars.replace(/\{\{ADDED_FILES\}\}/g, addedFiles);
    templateWithVars = templateWithVars.replace(/\{\{MODIFIED_FILES\}\}/g, modifiedFiles);
    templateWithVars = templateWithVars.replace(/\{\{REMOVED_FILES\}\}/g, removedFiles);
    
    // Combine: prompt instructions + template with variables
    if (parsed.prompt) {
      return `${parsed.prompt}\n\nTemplate to use:\n${templateWithVars}`;
    } else {
      return templateWithVars;
    }
  }
  
  // Old format: treat entire content as prompt and replace variables
  let prompt = parsed.prompt;
  
  // Replace all template variables
  prompt = prompt.replace(/\{\{PROJECT_CONTEXT\}\}/g, projectContext || '');
  prompt = prompt.replace(/\{\{REPOSITORY\}\}/g, context.repository || '');
  prompt = prompt.replace(/\{\{COMMIT_TYPE\}\}/g, context.commitType || 'change');
  prompt = prompt.replace(/\{\{COMMIT_MESSAGE\}\}/g, context.commitMessage || '');
  prompt = prompt.replace(/\{\{FILES_CHANGED\}\}/g, context.filesChanged?.toString() || '0');
  prompt = prompt.replace(/\{\{AUTHOR\}\}/g, context.author || '');
  prompt = prompt.replace(/\{\{BRANCH\}\}/g, context.branch || 'main');
  
  // Handle file lists
  const addedFiles = context.addedFiles?.length > 0 
    ? `- Added Files: ${context.addedFiles.join(', ')}` 
    : '';
  const modifiedFiles = context.modifiedFiles?.length > 0 
    ? `- Modified Files: ${context.modifiedFiles.join(', ')}` 
    : '';
  const removedFiles = context.removedFiles?.length > 0 
    ? `- Removed Files: ${context.removedFiles.join(', ')}` 
    : '';
  
  prompt = prompt.replace(/\{\{ADDED_FILES\}\}/g, addedFiles);
  prompt = prompt.replace(/\{\{MODIFIED_FILES\}\}/g, modifiedFiles);
  prompt = prompt.replace(/\{\{REMOVED_FILES\}\}/g, removedFiles);
  
  return prompt;
}

/**
 * Get the active prompt template for a user
 */
function getPromptTemplateForUser(userId) {
  const activeTemplate = database.getActivePromptTemplate(userId);
  
  if (activeTemplate) {
    return activeTemplate.template_content;
  }
  
  // Return default template
  return DEFAULT_PROMPT_TEMPLATE;
}

let genAI = null;
let model = null;
let queueService = null;

function initGemini() {
  if (!config.gemini.apiKey) {
    console.warn('⚠️  Gemini API key not set - changelog generation disabled');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    const modelName = config.gemini.model || 'gemini-pro';
    model = genAI.getGenerativeModel({ model: modelName });
    
    // Initialize queue service for rate limiting
    queueService = getQueueService({
      maxRequestsPerMinute: config.queue?.maxRequestsPerMinute || 15,
      maxRetries: config.queue?.maxRetries || 3
    });
    
    console.log(`✅ Gemini AI initialized with model: ${modelName}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error.message);
    return false;
  }
}

/**
 * Build enhanced prompt with repository context
 */
function buildEnhancedPrompt(commitData, repository, repoContext = null) {
  let contextSection = '';
  
  if (repoContext) {
    const parts = [];
    
    parts.push(`\n=== PROJECT CONTEXT ===`);
    parts.push(`Project: ${repoContext.repo_name || repository.name}`);
    
    if (repoContext.languages && repoContext.languages.length > 0) {
      parts.push(`Tech Stack: ${repoContext.languages.join(', ')}`);
    }
    
    if (repoContext.frameworks && repoContext.frameworks.length > 0) {
      parts.push(`Frameworks: ${repoContext.frameworks.join(', ')}`);
    }
    
    if (repoContext.key_directories && repoContext.key_directories.length > 0) {
      parts.push(`Key Directories: ${repoContext.key_directories.slice(0, 5).join(', ')}`);
    }
    
    // Include README summary for project understanding
    if (repoContext.readme?.summary) {
      parts.push(`\nProject Description: ${repoContext.readme.summary}`);
    } else if (repoContext.description) {
      parts.push(`\nProject Description: ${repoContext.description}`);
    }
    
    parts.push(`======================\n`);
    contextSection = parts.join('\n');
  }
  
  return contextSection;
}

/**
 * Generate changelog with queue support and enhanced context
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {object} options - Additional options (userId, repoContext, priority)
 */
async function generateChangelog(commitData, repository, options = {}) {
  if (!model) {
    return commitData.message;
  }

  const { userId = 'default', repoContext = null, priority = PRIORITY.NORMAL } = options;

  // Check user quota before queuing
  if (userId !== 'default' && database.isUserOverQuota(userId, 'gemini')) {
    console.warn(`⚠️  User ${userId} has exceeded API quota`);
    return commitData.message;
  }

  // Create the task function
  const generateTask = async () => {
    const context = {
      commitMessage: commitData.message,
      commitType: commitData.type || 'change',
      repository: repository.name,
      filesChanged: commitData.filesChanged,
      addedFiles: commitData.added || [],
      modifiedFiles: commitData.modified || [],
      removedFiles: commitData.removed || [],
      author: commitData.author || '',
      branch: commitData.branch || 'main'
    };

    // Build enhanced prompt with repo context
    const projectContext = buildEnhancedPrompt(commitData, repository, repoContext);

    // Get user's custom template or use default
    const promptTemplate = getPromptTemplateForUser(userId);
    const prompt = buildPromptFromTemplate(promptTemplate, context, projectContext);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let changelog = response.text();
    
    // Safety check for empty or invalid response
    if (!changelog || typeof changelog !== 'string') {
      console.warn('⚠️  Gemini returned invalid response, using commit message');
      return commitData.message;
    }
    
    changelog = changelog.trim();

    // Track API usage
    database.trackApiUsage(userId, 'gemini');

    console.log('🤖 Gemini generated changelog:', changelog.length > 0 ? changelog.substring(0, 100) + '...' : '(empty)');
    return changelog;
  };

  // Use queue service if available, otherwise direct call
  if (queueService) {
    try {
      const result = await queueService.enqueue({
        id: `changelog-${commitData.sha || Date.now()}`,
        userId,
        task: generateTask,
        data: { commitData, repository },
        priority
      });
      return result;
    } catch (error) {
      console.error('❌ Queue error, falling back to direct call:', error.message);
      // Fall through to direct call
    }
  }

  // Direct call fallback
  try {
    return await generateTask();
  } catch (error) {
    console.error('❌ Error generating changelog with Gemini:', error.message);
    return commitData.message;
  }
}

/**
 * Generate detailed changelog with queue support and enhanced context
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {object} options - Additional options (userId, repoContext, priority)
 */
async function generateDetailedChangelog(commitData, repository, options = {}) {
  if (!model) {
    return commitData.message;
  }

  const { userId = 'default', repoContext = null, priority = PRIORITY.LOW } = options;

  // Check user quota
  if (userId !== 'default' && database.isUserOverQuota(userId, 'gemini')) {
    console.warn(`⚠️  User ${userId} has exceeded API quota`);
    return commitData.message;
  }

  const generateTask = async () => {
    const context = {
      commitMessage: commitData.message,
      commitType: commitData.type || 'change',
      repository: repository.name,
      filesChanged: commitData.filesChanged
    };

    const projectContext = buildEnhancedPrompt(commitData, repository, repoContext);

    const prompt = `Create a detailed changelog entry for this commit:
${projectContext}
Repository: ${context.repository}
Type: ${context.commitType}
Message: ${context.commitMessage}
Files Changed: ${context.filesChanged}

Generate a well-formatted changelog entry (2-3 sentences) that explains:
- What was changed
- Why it matters
- Any notable improvements

Use the PROJECT CONTEXT above to provide more insightful commentary about the changes.
Format as markdown if appropriate.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Track API usage
    database.trackApiUsage(userId, 'gemini');
    
    return response.text().trim();
  };

  // Use queue service if available
  if (queueService) {
    try {
      return await queueService.enqueue({
        id: `detailed-${commitData.sha || Date.now()}`,
        userId,
        task: generateTask,
        data: { commitData, repository },
        priority
      });
    } catch (error) {
      console.error('❌ Queue error, falling back to direct call:', error.message);
    }
  }

  // Direct call fallback
  try {
    return await generateTask();
  } catch (error) {
    console.error('❌ Error generating detailed changelog:', error.message);
    return commitData.message;
  }
}

/**
 * Get queue statistics (for monitoring)
 */
function getQueueStats() {
  if (!queueService) return null;
  return queueService.getStats();
}

/**
 * Get user's remaining quota
 */
function getUserQuotaRemaining(userId) {
  if (!queueService) return -1;
  return queueService.getUserQuotaRemaining(userId);
}

const isInitialized = initGemini();

module.exports = {
  generateChangelog,
  generateDetailedChangelog,
  buildEnhancedPrompt,
  getQueueStats,
  getUserQuotaRemaining,
  isInitialized: () => isInitialized,
  PRIORITY,
  // Template exports
  DEFAULT_PROMPT_TEMPLATE,
  TEMPLATE_VARIABLES,
  TEMPLATE_PRESETS,
  getPromptTemplateForUser,
  buildPromptFromTemplate
};

