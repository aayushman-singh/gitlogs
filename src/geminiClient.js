/**
 * Gemini AI Client
 * Handles AI text generation using Google's Gemini API
 * 
 * Separation of concerns:
 * - This module handles ONLY AI generation
 * - Template logic is handled by templateEngine
 * - Tweet formatting is handled by commitFormatter
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');
const { getQueueService, registerTaskType, PRIORITY } = require('./queueService');
const database = require('./database');
const templateEngine = require('./templateEngine');
const diffAnalyzer = require('./diffAnalyzer');

// Task types for queue persistence
const TASK_TYPES = {
  CHANGELOG: 'gemini_changelog',
  DETAILED_CHANGELOG: 'gemini_detailed_changelog',
  DIFF_ANALYSIS: 'gemini_diff_analysis'
};

// Module state
let genAI = null;
let model = null;
let queueService = null;

// ============================================
// AI Text Generation
// ============================================

/**
 * Generate AI text from a prompt
 * This is the core AI function - takes a prompt, returns generated text
 * 
 * @param {string} prompt - The prompt to send to AI
 * @returns {Promise<string>} - Generated text
 */
async function generateAIText(prompt) {
  if (!model) {
    throw new Error('Gemini model not initialized');
  }
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid response from Gemini');
  }
  
  return text.trim();
}

// ============================================
// Project Context Builder
// ============================================

/**
 * Build enhanced project context string from repository data
 * 
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {object} repoContext - Cached repository context (languages, frameworks, etc.)
 * @returns {string} - Formatted project context
 */
function buildProjectContext(commitData, repository, repoContext = null) {
  if (!repoContext) return '';
  
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
  
  return parts.join('\n');
}

// ============================================
// Two-Stage Diff Analysis
// ============================================

/**
 * Stage 1: Analyze git diff to extract meaningful change summary
 * This prevents AI hallucination by grounding it in actual code changes
 * 
 * @param {object} diffData - Diff data from diffAnalyzer.fetchCommitDiff
 * @param {string} commitMessage - Original commit message
 * @param {string} repoName - Repository name
 * @param {string} userId - User ID for quota tracking
 * @returns {Promise<string|null>} - Summary of changes or null if analysis failed
 */
async function analyzeDiff(diffData, commitMessage, repoName, userId = 'default') {
  if (!model) {
    console.warn('⚠️  Gemini model not available for diff analysis');
    return null;
  }
  
  // Build the analysis prompt
  const prompt = diffAnalyzer.buildDiffAnalysisPrompt(diffData, commitMessage, repoName);
  
  if (!prompt) {
    console.log('📝 No diff content to analyze, using file-based summary');
    return null;
  }
  
  console.log('🔬 Stage 1: Analyzing diff with AI...');
  
  try {
    const summary = await generateAIText(prompt);
    
    // Track API usage (counts toward quota)
    database.trackApiUsage(userId, 'gemini');
    
    console.log('🔬 Diff analysis complete:', summary.substring(0, 100) + (summary.length > 100 ? '...' : ''));
    
    return summary;
  } catch (error) {
    console.error('❌ Diff analysis failed:', error.message);
    return null;
  }
}

// ============================================
// Changelog Generation Tasks
// ============================================

/**
 * Create a changelog generation task
 * Uses templateEngine for template processing, only calls AI when needed
 * Now supports two-stage generation with diff analysis
 * 
 * @param {object} data - Task data (commitData, repository, userId, repoContext, diffSummary)
 * @returns {Function} - Async task function
 */
function createChangelogTask(data) {
  return async () => {
    const { commitData, repository, userId, repoContext, diffSummary } = data;
    
    // Build project context for AI prompts
    const projectContext = buildProjectContext(commitData, repository, repoContext);
    
    // If we have a diff summary from Stage 1, inject it into commit data
    const enhancedCommitData = diffSummary 
      ? { ...commitData, diffAnalysis: diffSummary }
      : commitData;
    
    // Process template through templateEngine
    const processed = templateEngine.processTemplate(
      userId,
      enhancedCommitData,
      repository,
      projectContext
    );
    
    // If template doesn't need AI, return the processed template directly
    if (!processed.needsAI) {
      console.log('📝 Using template directly (no {{AI_TEXT}} variable)');
      return templateEngine.finalizeTemplate(processed, null);
    }
    
    // Need AI processing
    if (!model) {
      console.warn('⚠️  Gemini model not available, using commit message');
      return commitData.message || 'No model available';
    }
    
    console.log('🤖 Stage 2: Generating changelog with Gemini...');
    
    try {
      // If we have diff summary, enhance the prompt
      let finalPrompt = processed.prompt;
      if (diffSummary) {
        finalPrompt = `${processed.prompt}

=== DIFF ANALYSIS (from actual code changes) ===
The following summary was extracted from the actual git diff. Use ONLY this information to describe what changed:
${diffSummary}
=== END DIFF ANALYSIS ===

CRITICAL: Base your response ONLY on the diff analysis above. Do not invent or assume any changes not mentioned in the diff analysis.`;
      }
      
      // Generate AI text using the prompt
      const aiText = await generateAIText(finalPrompt);
      
      // Track API usage
      database.trackApiUsage(userId, 'gemini');
      
      console.log('🤖 Gemini generated:', aiText.length > 0 ? aiText.substring(0, 100) + '...' : '(empty)');
      
      // Finalize template with AI text inserted
      return templateEngine.finalizeTemplate(processed, aiText);
      
    } catch (error) {
      console.error('❌ AI generation failed:', error.message);
      // Fallback: return template without AI text, or commit message
      return processed.isDefault 
        ? commitData.message 
        : templateEngine.finalizeTemplate(processed, commitData.message);
    }
  };
}

/**
 * Create a detailed changelog generation task
 * Always uses AI, doesn't support custom templates
 * 
 * @param {object} data - Task data
 * @returns {Function} - Async task function
 */
function createDetailedChangelogTask(data) {
  return async () => {
    if (!model) {
      return data.commitData?.message || 'No model available';
    }
    
    const { commitData, repository, userId, repoContext } = data;
    const projectContext = buildProjectContext(commitData, repository, repoContext);

    const prompt = `Create a detailed changelog entry for this commit:
${projectContext}
Repository: ${repository.name}
Type: ${commitData.type || 'change'}
Message: ${commitData.message}
Files Changed: ${commitData.filesChanged}

Generate a well-formatted changelog entry (2-3 sentences) that explains:
- What was changed
- Why it matters
- Any notable improvements

Use the PROJECT CONTEXT above to provide more insightful commentary about the changes.
Format as markdown if appropriate.`;

    const aiText = await generateAIText(prompt);
    
    // Track API usage
    database.trackApiUsage(userId, 'gemini');
    
    return aiText;
  };
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize Gemini AI client
 */
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
    
    // Register task factories for queue persistence
    registerTaskType(TASK_TYPES.CHANGELOG, createChangelogTask);
    registerTaskType(TASK_TYPES.DETAILED_CHANGELOG, createDetailedChangelogTask);
    
    console.log(`✅ Gemini AI initialized with model: ${modelName}`);
    console.log(`📝 Registered ${Object.keys(TASK_TYPES).length} task types for queue persistence`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error.message);
    return false;
  }
}

// ============================================
// Public API - Changelog Generation
// ============================================

/**
 * Generate changelog with queue support and enhanced context
 * Now supports two-stage generation with diff analysis
 * 
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {object} options - Additional options (userId, repoContext, priority, diffSummary)
 * @returns {Promise<string>} - Generated changelog text
 */
async function generateChangelog(commitData, repository, options = {}) {
  const { 
    userId = 'default', 
    repoContext = null, 
    priority = PRIORITY.NORMAL,
    diffSummary = null  // Pre-computed diff summary from Stage 1
  } = options;

  // Check user quota before queuing
  if (userId !== 'default' && database.isUserOverQuota(userId, 'gemini')) {
    console.warn(`⚠️  User ${userId} has exceeded API quota`);
    return commitData.message;
  }

  // Prepare task data (must be serializable for persistence)
  const taskData = {
    commitData: {
      message: commitData.message,
      type: commitData.type,
      filesChanged: commitData.filesChanged,
      added: commitData.added || [],
      modified: commitData.modified || [],
      removed: commitData.removed || [],
      author: commitData.author || '',
      branch: commitData.branch || 'main',
      sha: commitData.sha
    },
    repository: {
      name: repository.name,
      full_name: repository.full_name,
      html_url: repository.html_url,
      description: repository.description
    },
    userId,
    repoContext,
    diffSummary  // Include diff summary in task data
  };

  // Create the task function
  const generateTask = createChangelogTask(taskData);

  // Use queue service if available
  if (queueService) {
    try {
      const result = await queueService.enqueue({
        id: `changelog-${commitData.sha || Date.now()}`,
        userId,
        taskType: TASK_TYPES.CHANGELOG,
        task: generateTask,
        data: taskData,
        priority
      });
      return result;
    } catch (error) {
      console.error('❌ Queue error, falling back to direct call:', error.message);
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
 * Generate detailed changelog with queue support
 * 
 * @param {object} commitData - Commit information
 * @param {object} repository - Repository information
 * @param {object} options - Additional options (userId, repoContext, priority)
 * @returns {Promise<string>} - Generated detailed changelog
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

  // Prepare task data
  const taskData = {
    commitData: {
      message: commitData.message,
      type: commitData.type,
      filesChanged: commitData.filesChanged,
      sha: commitData.sha
    },
    repository: {
      name: repository.name,
      full_name: repository.full_name,
      description: repository.description
    },
    userId,
    repoContext
  };

  // Create the task function
  const generateTask = createDetailedChangelogTask(taskData);

  // Use queue service if available
  if (queueService) {
    try {
      return await queueService.enqueue({
        id: `detailed-${commitData.sha || Date.now()}`,
        userId,
        taskType: TASK_TYPES.DETAILED_CHANGELOG,
        task: generateTask,
        data: taskData,
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

// ============================================
// Monitoring & Stats
// ============================================

/**
 * Get queue statistics for monitoring
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

// Initialize on module load
const isInitialized = initGemini();

// ============================================
// Exports
// ============================================

module.exports = {
  // Core AI functions
  generateChangelog,
  generateDetailedChangelog,
  generateAIText,
  
  // Two-stage diff analysis
  analyzeDiff,
  
  // Context building
  buildProjectContext,
  
  // Monitoring
  getQueueStats,
  getUserQuotaRemaining,
  isInitialized: () => isInitialized,
  
  // Queue priority constants
  PRIORITY,
  
  // Re-export diff analyzer for convenience
  diffAnalyzer,
  
  // Re-export template engine for convenience
  // (other modules can import directly from templateEngine)
  templateEngine: {
    ...templateEngine
  }
};
