/**
 * Template Engine
 * Handles all template parsing, validation, and variable substitution
 * 
 * Separation of concerns:
 * - This module handles ONLY template logic
 * - AI generation is handled by geminiClient
 * - Tweet formatting is handled by commitFormatter
 */

const database = require('./database');

// ============================================
// Template Variables Definition
// ============================================

/**
 * Available template variables
 * These can be used in templates with {{VARIABLE_NAME}} syntax
 */
const TEMPLATE_VARIABLES = {
  // Special AI variable - if present, AI generates text for this spot
  '{{AI_TEXT}}': 'AI-generated changelog text (if used, AI will generate content for this spot)',
  
  // Commit information
  '{{COMMIT_MESSAGE}}': 'Original commit message from Git',
  '{{COMMIT_TYPE}}': 'Type of commit (feat, fix, refactor, etc.)',
  '{{COMMIT_SHA}}': 'Short commit SHA (7 characters)',
  
  // Repository information
  '{{REPOSITORY}}': 'Repository name (e.g., repo-name)',
  '{{REPOSITORY_FULL}}': 'Full repository name (e.g., owner/repo-name)',
  '{{REPOSITORY_URL}}': 'GitHub URL to the repository',
  
  // File changes
  '{{FILES_CHANGED}}': 'Number of files changed',
  '{{ADDED_FILES}}': 'List of added files (if any)',
  '{{MODIFIED_FILES}}': 'List of modified files (if any)',
  '{{REMOVED_FILES}}': 'List of removed files (if any)',
  
  // Author information
  '{{AUTHOR}}': 'Commit author username',
  '{{BRANCH}}': 'Branch name where commit was pushed',
  
  // Context
  '{{PROJECT_CONTEXT}}': 'Project context including tech stack and description',
  
  // Diff analysis (from two-stage AI processing)
  '{{DIFF_ANALYSIS}}': 'AI-analyzed summary of actual code changes from git diff (prevents hallucination)'
};

// List of all variable names (for validation)
const VARIABLE_NAMES = Object.keys(TEMPLATE_VARIABLES);

// The special AI variable
const AI_TEXT_VARIABLE = '{{AI_TEXT}}';

// ============================================
// Default Templates
// ============================================

/**
 * Default AI prompt template (used when no custom template is set)
 */
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
8. ONLY describe changes that are DIRECTLY evident from the commit message and file names provided above. DO NOT invent, assume, or hallucinate features or changes that are not explicitly mentioned.
9. If the commit message is vague (like "update", "fix", "changes"), describe ONLY what can be inferred from the file names. Example: if files are "OpenGraph.tsx" and "share/[id].tsx", say "updated opengraph and share page components".
10. Keep it concise but informative (aim for 2-3 bullet points, maximum 150 characters total)
11. CRITICAL: The entire output must be 150 characters or less (including "update:" and all bullet points). This is for a tweet, so brevity is essential.
12. Use the PROJECT CONTEXT above to understand what this project is about, but DO NOT invent changes not in this specific commit.

Example Output:
update:
- migrated from firebase auth to custom github oauth.
- updated client & server for new auth service.

WRONG Example (DO NOT DO THIS):
update:
- ✨ refactored auth flow
- 🚀 added new features
- #coding #github (NO HASHTAGS!)
- added cli debug flag (WRONG - not mentioned in commit!)

Format: Write only the log entry text, starting with "update:" followed by bullet points. No additional explanations, formatting, hashtags, or emojis. Keep it under 150 characters total. ABSOLUTELY NO EMOJIS OR HASHTAGS. ONLY describe what is in the commit data above.`;

/**
 * Pre-built template presets
 */
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

// ============================================
// Template Parsing
// ============================================

/**
 * Parse template content from storage format
 * Handles both old format (just prompt) and new format (JSON with template + prompt)
 * 
 * @param {string} templateContent - Raw template content from database
 * @returns {object} - { template, prompt, isNewFormat }
 */
function parseTemplateContent(templateContent) {
  if (!templateContent) {
    return { template: '', prompt: '', isNewFormat: false };
  }
  
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
 * Combine template and prompt into storage format
 * 
 * @param {string} template - The tweet template
 * @param {string} prompt - The AI prompt/instructions
 * @returns {string} - JSON string for storage
 */
function combineTemplateContent(template, prompt) {
  return JSON.stringify({ template: template || '', prompt: prompt || '' });
}

// ============================================
// Template Validation
// ============================================

/**
 * Check if template uses the AI_TEXT variable
 * 
 * @param {string} template - Template string to check
 * @returns {boolean}
 */
function templateUsesAI(template) {
  if (!template) return false;
  return template.includes(AI_TEXT_VARIABLE);
}

/**
 * Validate template configuration
 * Returns validation result with any warnings/errors
 * 
 * @param {string} template - The tweet template
 * @param {string} prompt - The AI prompt
 * @returns {object} - { valid, warnings, errors }
 */
function validateTemplate(template, prompt) {
  const result = {
    valid: true,
    warnings: [],
    errors: []
  };
  
  const hasTemplate = template && template.trim().length > 0;
  const hasPrompt = prompt && prompt.trim().length > 0;
  const usesAIVariable = templateUsesAI(template);
  
  // Error: No template and no prompt
  if (!hasTemplate && !hasPrompt) {
    result.errors.push('Template or AI prompt is required');
    result.valid = false;
  }
  
  // Warning: Has prompt but template doesn't use {{AI_TEXT}}
  if (hasPrompt && hasTemplate && !usesAIVariable) {
    result.warnings.push(
      'You have an AI prompt defined but your template doesn\'t use {{AI_TEXT}}. ' +
      'The AI prompt will be ignored. Either add {{AI_TEXT}} to your template or remove the AI prompt.'
    );
  }
  
  // Warning: Uses {{AI_TEXT}} but no prompt
  if (usesAIVariable && !hasPrompt) {
    result.warnings.push(
      'Your template uses {{AI_TEXT}} but no AI prompt is defined. ' +
      'The AI will use default instructions. Add a custom prompt for better control.'
    );
  }
  
  return result;
}

/**
 * Get user's active template from database
 * 
 * @param {string} userId - User ID
 * @returns {object|null} - Template object or null if using default
 */
function getUserActiveTemplate(userId) {
  return database.getActivePromptTemplate(userId);
}

/**
 * Check if user is using the default template
 * 
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function isUsingDefaultTemplate(userId) {
  return !getUserActiveTemplate(userId);
}

// ============================================
// Variable Substitution
// ============================================

/**
 * Build context object for variable substitution
 * 
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {string} projectContext - Project context string
 * @returns {object} - Context object with all variable values
 */
function buildVariableContext(commitData, repository, projectContext = '') {
  // Handle file lists
  const addedFiles = commitData.added?.length > 0 
    ? `Added: ${commitData.added.join(', ')}` 
    : '';
  const modifiedFiles = commitData.modified?.length > 0 
    ? `Modified: ${commitData.modified.join(', ')}` 
    : '';
  const removedFiles = commitData.removed?.length > 0 
    ? `Removed: ${commitData.removed.join(', ')}` 
    : '';
  
  // Build repository URL
  const repoUrl = repository.html_url || 
    (repository.full_name ? `https://github.com/${repository.full_name}` : '');
  
  return {
    // Commit info
    COMMIT_MESSAGE: commitData.message || '',
    COMMIT_TYPE: commitData.type || 'change',
    COMMIT_SHA: commitData.sha || '',
    
    // Repository info
    REPOSITORY: repository.name || '',
    REPOSITORY_FULL: repository.full_name || '',
    REPOSITORY_URL: repoUrl,
    
    // File changes
    FILES_CHANGED: (commitData.filesChanged || 0).toString(),
    ADDED_FILES: addedFiles,
    MODIFIED_FILES: modifiedFiles,
    REMOVED_FILES: removedFiles,
    
    // Author info
    AUTHOR: commitData.author || '',
    BRANCH: commitData.branch || 'main',
    
    // Context
    PROJECT_CONTEXT: projectContext,
    
    // Diff analysis (from two-stage processing, may be empty if analysis not run)
    DIFF_ANALYSIS: commitData.diffAnalysis || ''
  };
}

/**
 * Replace all variables in a template string (except AI_TEXT)
 * 
 * @param {string} template - Template string with {{VARIABLE}} placeholders
 * @param {object} context - Variable context from buildVariableContext
 * @returns {string} - Template with variables replaced
 */
function applyVariables(template, context) {
  if (!template) return '';
  
  let result = template;
  
  // Replace each variable (except AI_TEXT which is handled separately)
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value || '');
  }
  
  return result;
}

/**
 * Insert AI-generated text into template
 * 
 * @param {string} template - Template with {{AI_TEXT}} placeholder
 * @param {string} aiText - AI-generated text
 * @returns {string} - Final text with AI content inserted
 */
function insertAIText(template, aiText) {
  if (!template) return aiText || '';
  return template.replace(new RegExp(AI_TEXT_VARIABLE.replace(/[{}]/g, '\\$&'), 'g'), aiText || '');
}

// ============================================
// Template Processing Pipeline
// ============================================

/**
 * Process a template for a user
 * Determines if AI is needed and prepares the template
 * 
 * @param {string} userId - User ID
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {string} projectContext - Project context string
 * @returns {object} - { needsAI, template, prompt, context, isDefault }
 */
function processTemplate(userId, commitData, repository, projectContext = '') {
  const activeTemplate = getUserActiveTemplate(userId);
  const isDefault = !activeTemplate;
  const context = buildVariableContext(commitData, repository, projectContext);
  
  // Using default template
  if (isDefault) {
    return {
      needsAI: true,
      template: null, // Default uses AI directly, no template wrapper
      prompt: DEFAULT_PROMPT_TEMPLATE,
      context,
      isDefault: true
    };
  }
  
  // Parse custom template
  const parsed = parseTemplateContent(activeTemplate.template_content);
  const usesAI = templateUsesAI(parsed.template);
  
  // Apply variables to template (except AI_TEXT)
  const templateWithVars = applyVariables(parsed.template, context);
  
  // Apply variables to prompt as well
  const promptWithVars = applyVariables(parsed.prompt, context);
  
  return {
    needsAI: usesAI,
    template: templateWithVars,
    prompt: promptWithVars || DEFAULT_PROMPT_TEMPLATE, // Fall back to default prompt if none provided
    context,
    isDefault: false
  };
}

/**
 * Finalize the tweet text after AI processing (if any)
 * 
 * @param {object} processedTemplate - Result from processTemplate
 * @param {string} aiText - AI-generated text (null if AI not used)
 * @returns {string} - Final tweet text
 */
function finalizeTemplate(processedTemplate, aiText = null) {
  const { needsAI, template, isDefault } = processedTemplate;
  
  // Default template: AI text is the entire content
  if (isDefault) {
    return aiText || '';
  }
  
  // Custom template with AI: Insert AI text into template
  if (needsAI && template) {
    return insertAIText(template, aiText || '');
  }
  
  // Custom template without AI: Template is the final content
  return template || '';
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Constants
  TEMPLATE_VARIABLES,
  VARIABLE_NAMES,
  AI_TEXT_VARIABLE,
  DEFAULT_PROMPT_TEMPLATE,
  TEMPLATE_PRESETS,
  
  // Parsing
  parseTemplateContent,
  combineTemplateContent,
  
  // Validation
  templateUsesAI,
  validateTemplate,
  
  // User template access
  getUserActiveTemplate,
  isUsingDefaultTemplate,
  
  // Variable handling
  buildVariableContext,
  applyVariables,
  insertAIText,
  
  // Processing pipeline
  processTemplate,
  finalizeTemplate
};

