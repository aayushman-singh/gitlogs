/**
 * Repository Indexer - Generates context about a repository
 * Used to provide additional context to Gemini for better commit summaries
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LANGUAGE_MAP = {
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby',
  '.php': 'PHP', '.c': 'C', '.cpp': 'C++', '.cs': 'C#', '.swift': 'Swift',
  '.kt': 'Kotlin', '.dart': 'Dart', '.vue': 'Vue', '.svelte': 'Svelte'
};

const IGNORE_DIRS = ['node_modules', 'dist', 'build', 'vendor', '__pycache__', '.git', 'coverage', '.next', 'out'];

/**
 * Detect programming languages used in the repository
 * @param {string} rootDir - Repository root directory
 * @returns {string[]} - Array of detected languages sorted by file count
 */
function detectLanguages(rootDir) {
  const extensions = new Map();
  
  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.') || IGNORE_DIRS.includes(entry.name)) {
          continue;
        }
        
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) extensions.set(ext, (extensions.get(ext) || 0) + 1);
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
    }
  }
  
  scanDir(rootDir);
  
  const languages = new Map();
  for (const [ext, count] of extensions.entries()) {
    const lang = LANGUAGE_MAP[ext];
    if (lang) languages.set(lang, (languages.get(lang) || 0) + count);
  }
  
  return Array.from(languages.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
    .slice(0, 5);
}

/**
 * Detect frameworks and major dependencies
 * @param {string} rootDir - Repository root directory
 * @returns {string[]} - Array of detected frameworks
 */
function detectFrameworks(rootDir) {
  const frameworks = [];
  
  // Check package.json for Node.js projects
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Frontend frameworks
      if (deps.next) frameworks.push('Next.js');
      else if (deps.nuxt) frameworks.push('Nuxt.js');
      else if (deps.react) frameworks.push('React');
      else if (deps.vue) frameworks.push('Vue.js');
      else if (deps.svelte) frameworks.push('Svelte');
      else if (deps.angular) frameworks.push('Angular');
      
      // Backend frameworks
      if (deps.express) frameworks.push('Express');
      if (deps.fastify) frameworks.push('Fastify');
      if (deps['@nestjs/core']) frameworks.push('NestJS');
      if (deps.hono) frameworks.push('Hono');
      if (deps.koa) frameworks.push('Koa');
      
      // Styling
      if (deps.tailwindcss) frameworks.push('Tailwind CSS');
      
      // Databases
      if (deps.prisma || deps['@prisma/client']) frameworks.push('Prisma');
      if (deps.mongoose) frameworks.push('MongoDB');
      if (deps.pg) frameworks.push('PostgreSQL');
      
      // Testing
      if (deps.jest) frameworks.push('Jest');
      if (deps.vitest) frameworks.push('Vitest');
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  // Check requirements.txt for Python projects
  const requirementsPath = path.join(rootDir, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    try {
      const reqs = fs.readFileSync(requirementsPath, 'utf8').toLowerCase();
      if (reqs.includes('django')) frameworks.push('Django');
      if (reqs.includes('flask')) frameworks.push('Flask');
      if (reqs.includes('fastapi')) frameworks.push('FastAPI');
      if (reqs.includes('pytorch') || reqs.includes('torch')) frameworks.push('PyTorch');
      if (reqs.includes('tensorflow')) frameworks.push('TensorFlow');
      if (reqs.includes('pandas')) frameworks.push('Pandas');
    } catch (e) {
      // Ignore
    }
  }
  
  // Check go.mod for Go projects
  const goModPath = path.join(rootDir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    try {
      const gomod = fs.readFileSync(goModPath, 'utf8');
      if (gomod.includes('gin-gonic/gin')) frameworks.push('Gin');
      if (gomod.includes('gofiber/fiber')) frameworks.push('Fiber');
      if (gomod.includes('echo')) frameworks.push('Echo');
    } catch (e) {
      // Ignore
    }
  }
  
  // Check Cargo.toml for Rust projects
  const cargoPath = path.join(rootDir, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    try {
      const cargo = fs.readFileSync(cargoPath, 'utf8');
      if (cargo.includes('actix-web')) frameworks.push('Actix-web');
      if (cargo.includes('axum')) frameworks.push('Axum');
      if (cargo.includes('tokio')) frameworks.push('Tokio');
    } catch (e) {
      // Ignore
    }
  }
  
  return frameworks.slice(0, 8);
}

/**
 * Get key directories in the repository
 * @param {string} rootDir - Repository root directory
 * @returns {string[]} - Array of directory names
 */
function getKeyDirectories(rootDir) {
  try {
    return fs.readdirSync(rootDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && 
                   !e.name.startsWith('.') && 
                   !IGNORE_DIRS.includes(e.name))
      .map(e => e.name + '/')
      .slice(0, 10);
  } catch (error) {
    return [];
  }
}

/**
 * Read and extract description from README
 * @param {string} rootDir - Repository root directory
 * @returns {object} - Object with summary and full content (truncated)
 */
function readReadme(rootDir) {
  const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README.txt', 'README'];
  
  for (const readmeName of readmeNames) {
    const readmePath = path.join(rootDir, readmeName);
    if (fs.existsSync(readmePath)) {
      try {
        const content = fs.readFileSync(readmePath, 'utf8');
        
        // Extract first paragraph as summary
        const paragraphs = content.split('\n\n');
        let summary = '';
        for (const para of paragraphs) {
          const cleaned = para.replace(/^#+ /, '').trim();
          if (cleaned.length > 20 && !cleaned.startsWith('![') && !cleaned.startsWith('[')) {
            summary = cleaned.slice(0, 300);
            break;
          }
        }
        
        // Return truncated full content for context
        return {
          summary: summary || 'No description available',
          fullContent: content.slice(0, 3000) // Keep reasonable size for context
        };
      } catch (e) {
        // Ignore read errors
      }
    }
  }
  
  return { summary: 'No README available', fullContent: '' };
}

/**
 * Get repository name from git remote or directory name
 * @param {string} rootDir - Repository root directory
 * @returns {string} - Repository name
 */
function getRepoName(rootDir) {
  try {
    const remote = execSync('git config --get remote.origin.url', { 
      cwd: rootDir, 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    const match = remote.match(/\/([^\/]+?)(\.git)?$/);
    return match ? match[1] : path.basename(rootDir);
  } catch (e) {
    return path.basename(rootDir);
  }
}

/**
 * Generate complete repository context for AI consumption
 * @param {string} rootDir - Repository root directory
 * @returns {object} - Repository context object
 */
function generateRepoContext(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return {
      repo_name: 'unknown',
      languages: [],
      frameworks: [],
      key_directories: [],
      readme: { summary: '', fullContent: '' },
      generated_at: new Date().toISOString(),
      error: 'Repository directory not found'
    };
  }

  const readme = readReadme(rootDir);
  
  return {
    repo_name: getRepoName(rootDir),
    languages: detectLanguages(rootDir),
    frameworks: detectFrameworks(rootDir),
    key_directories: getKeyDirectories(rootDir),
    readme: readme,
    generated_at: new Date().toISOString()
  };
}

/**
 * Generate a concise context string for embedding in prompts
 * @param {object} context - Repository context object
 * @returns {string} - Formatted context string
 */
function formatContextForPrompt(context) {
  const parts = [];
  
  parts.push(`Project: ${context.repo_name}`);
  
  if (context.languages.length > 0) {
    parts.push(`Tech Stack: ${context.languages.join(', ')}`);
  }
  
  if (context.frameworks.length > 0) {
    parts.push(`Frameworks: ${context.frameworks.join(', ')}`);
  }
  
  if (context.key_directories.length > 0) {
    parts.push(`Structure: ${context.key_directories.slice(0, 5).join(', ')}`);
  }
  
  if (context.readme.summary) {
    parts.push(`Description: ${context.readme.summary}`);
  }
  
  return parts.join('\n');
}

/**
 * Generate context from GitHub webhook repository data (when local clone is not available)
 * @param {object} repository - GitHub webhook repository object
 * @param {object} commits - Commits from the push event
 * @returns {object} - Lightweight repository context
 */
function generateContextFromWebhook(repository, commits = []) {
  // Infer technologies from file extensions in commits
  const extensions = new Set();
  for (const commit of commits) {
    const allFiles = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
    for (const file of allFiles) {
      const ext = path.extname(file).toLowerCase();
      if (ext) extensions.add(ext);
    }
  }
  
  const languages = [];
  for (const ext of extensions) {
    if (LANGUAGE_MAP[ext] && !languages.includes(LANGUAGE_MAP[ext])) {
      languages.push(LANGUAGE_MAP[ext]);
    }
  }
  
  return {
    repo_name: repository.name,
    full_name: repository.full_name,
    description: repository.description || 'No description',
    languages: languages.slice(0, 5),
    frameworks: [], // Cannot detect from webhook data alone
    default_branch: repository.default_branch,
    is_private: repository.private,
    html_url: repository.html_url,
    generated_at: new Date().toISOString(),
    source: 'webhook'
  };
}

module.exports = {
  generateRepoContext,
  generateContextFromWebhook,
  formatContextForPrompt,
  detectLanguages,
  detectFrameworks,
  readReadme
};
