const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');

let genAI = null;
let model = null;

function initGemini() {
  if (!config.gemini.apiKey) {
    console.warn('⚠️  Gemini API key not set - changelog generation disabled');
    return false;
  }

  try {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    const modelName = config.gemini.model || 'gemini-pro';
    model = genAI.getGenerativeModel({ model: modelName });
    console.log(`✅ Gemini AI initialized with model: ${modelName}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini:', error.message);
    return false;
  }
}

async function generateChangelog(commitData, repository) {
  if (!model) {
    return commitData.message;
  }

  try {
    const context = {
      commitMessage: commitData.message,
      commitType: commitData.type || 'change',
      repository: repository.name,
      filesChanged: commitData.filesChanged,
      addedFiles: commitData.added || [],
      modifiedFiles: commitData.modified || [],
      removedFiles: commitData.removed || []
    };

    const prompt = `You are a developer writing a daily log entry about your work. Write in a casual, technical style with bullet points.

Commit Information:
- Repository: ${context.repository}
- Commit Type: ${context.commitType || 'change'}
- Commit Message: ${context.commitMessage}
- Files Changed: ${context.filesChanged}
${context.addedFiles.length > 0 ? `- Added Files: ${context.addedFiles.join(', ')}` : ''}
${context.modifiedFiles.length > 0 ? `- Modified Files: ${context.modifiedFiles.join(', ')}` : ''}
${context.removedFiles.length > 0 ? `- Removed Files: ${context.removedFiles.join(', ')}` : ''}

Task: Generate a "today's log" style entry that:
1. Starts with "today's log :" (lowercase, with colon)
2. Uses bullet points (dash format: "- ") to list what was implemented
3. Explains technical details in a casual, conversational way
4. Mentions implementation patterns, design decisions, and how things work
5. Uses technical jargon naturally (e.g., "factory pattern", "OTP style", "autowatches", "sliding window")
6. Explains the "why" and "how" behind the implementation
7. Keep it concise but informative (aim for 2-5 bullet points)
8. Write in first person
9. Be specific about technical concepts and patterns used without making it lengthy

Style Example:
today's log : 
- implemented hierarchical relationships (parent-child) between actors. parent owns child's lifecycle, so a parent on dying, terminates child as well. the parent autowatches the child to implement this.
- wrote supervision strategies. there are three : on panic, either the actor stops, restarts or escalates the panic to parent.
- the restart uses a tracker for a sliding window approach (max n restarts in m seconds)

Format: Write only the log entry text, starting with "today's log :" followed by bullet points. No additional explanations or formatting.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const changelog = response.text().trim();

    console.log('🤖 Gemini generated changelog:', changelog.substring(0, 100) + '...');
    return changelog;

  } catch (error) {
    console.error('❌ Error generating changelog with Gemini:', error.message);
    return commitData.message;
  }
}

async function generateDetailedChangelog(commitData, repository) {
  if (!model) {
    return commitData.message;
  }

  try {
    const context = {
      commitMessage: commitData.message,
      commitType: commitData.type || 'change',
      repository: repository.name,
      filesChanged: commitData.filesChanged
    };

    const prompt = `Create a detailed changelog entry for this commit:

Repository: ${context.repository}
Type: ${context.commitType}
Message: ${context.commitMessage}
Files Changed: ${context.filesChanged}

Generate a well-formatted changelog entry (2-3 sentences) that explains:
- What was changed
- Why it matters
- Any notable improvements

Format as markdown if appropriate.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();

  } catch (error) {
    console.error('❌ Error generating detailed changelog:', error.message);
    return commitData.message;
  }
}

const isInitialized = initGemini();

module.exports = {
  generateChangelog,
  generateDetailedChangelog,
  isInitialized: () => isInitialized
};

