import { useState, useEffect } from 'react';
import { HiTemplate, HiPencil, HiTrash, HiCheck, HiX, HiInformationCircle, HiCode } from 'react-icons/hi';
import { getMyTemplates, saveTemplate, setActiveTemplate, deleteTemplate, getCurrentUser } from '../utils/api';

// Template variables - constants that don't change
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

// Template card component
function TemplateCard({ template, isActive, isPreset, onSelect, onEdit, onDelete }) {
  return (
    <div 
      className={`template-card ${isActive ? 'template-card-active' : ''}`}
      onClick={() => onSelect(template.id)}
    >
      <div className="template-card-header">
        <div className="template-card-title">
          <HiTemplate size={16} />
          <span>{template.name}</span>
        </div>
        {isActive && (
          <span className="badge badge-green">Active</span>
        )}
        {isPreset && (
          <span className="badge badge-blue" style={{ marginLeft: 4 }}>Preset</span>
        )}
      </div>
      
      {template.description && (
        <p className="template-card-description">{template.description}</p>
      )}
      
      <div className="template-card-actions">
        {!isPreset && (
          <>
            <button 
              className="btn btn-sm btn-secondary" 
              onClick={(e) => { e.stopPropagation(); onEdit(template); }}
            >
              <HiPencil size={14} />
              Edit
            </button>
            <button 
              className="btn btn-sm btn-danger" 
              onClick={(e) => { e.stopPropagation(); onDelete(template.id); }}
            >
              <HiTrash size={14} />
            </button>
          </>
        )}
        {!isActive && (
          <button 
            className="btn btn-sm btn-primary"
            onClick={(e) => { e.stopPropagation(); onSelect(template.id); }}
          >
            <HiCheck size={14} />
            Use This
          </button>
        )}
      </div>
    </div>
  );
}

// Template editor modal
function TemplateEditorModal({ isOpen, onClose, onSave, template, variables, user, xUserInfo }) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showVariables, setShowVariables] = useState(false);
  const MAX_TEMPLATE_LENGTH = 280; // Twitter/X character limit
  
  // Use actual user data for preview
  const previewData = {
    COMMIT_MESSAGE: 'Add realtime tweet preview to template editor',
    REPO_NAME: 'gitlogs',
    REPO_FULL_NAME: 'aayushman-singh/gitlogs',
    AUTHOR_NAME: xUserInfo?.name || user?.name || user?.login || 'Developer',
    AUTHOR_USERNAME: xUserInfo?.username || user?.login || 'developer',
    AUTHOR_AVATAR: xUserInfo?.profileImageUrl || user?.avatar_url || null,
    COMMIT_URL: 'https://github.com/aayushman-singh/gitlogs/commit/abc1234',
    COMMIT_SHA: 'abc1234',
    BRANCH: 'main',
    FILES_CHANGED: '3 files',
    ADDITIONS: '+128',
    DELETIONS: '-12',
    DATE: 'Mar 28, 2024',
    COMMIT_COUNT: '1',
    PR_TITLE: 'Polish dashboard tabs',
    PR_URL: 'https://github.com/aayushman-singh/gitlogs/pull/42',
    TIME_AGO: '4m',
    VIEWS: '34',
    REPLIES: '2',
  };

  useEffect(() => {
    if (template) {
      setName(template.name || '');
      setContent(template.template || '');
    } else {
      setName('');
      setContent('');
    }
    setError('');
  }, [template, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    if (!content.trim()) {
      setError('Template content is required');
      return;
    }
    if (content.length > MAX_TEMPLATE_LENGTH) {
      setError(`Template content must be ${MAX_TEMPLATE_LENGTH} characters or less`);
      return;
    }

    setSaving(true);
    setError('');
    
    try {
      const templateId = template?.id || `custom-${Date.now()}`;
      await onSave(templateId, name.trim(), content.trim());
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variable) => {
    setContent(prev => prev + variable);
  };

  const renderPreview = (templateContent) => {
    if (!templateContent?.trim()) {
      return 'Start typing your template to see a live preview here.';
    }

    return templateContent.replace(/{{\s*[\w.-]+\s*}}/g, (match) => {
      const key = match.replace(/[{}]/g, '').trim();
      return previewData[key] || `[${key}]`;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template?.id ? 'Edit Template' : 'Create Custom Template'}</h2>
          <button className="modal-close" onClick={onClose}>
            <HiX size={20} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-error mb-4">{error}</div>
          )}

          <div className="form-group">
            <label className="form-label">Template Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Custom Style"
            />
          </div>

          <div className="template-editor-grid">
            <div className="template-editor-main">
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Template Content</label>
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => setShowVariables(!showVariables)}
                  >
                    <HiCode size={14} />
                    {showVariables ? 'Hide Variables' : 'Show Variables'}
                  </button>
                </div>
                
                {showVariables && (
                  <div className="variables-panel">
                    <div className="variables-header">
                      <HiInformationCircle size={16} />
                      <span>Available Variables - Click to insert</span>
                    </div>
                    <div className="variables-grid">
                      {Object.entries(variables || {}).map(([key, desc]) => (
                        <button 
                          key={key} 
                          className="variable-chip"
                          onClick={() => insertVariable(key)}
                          title={desc}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                    <div className="variables-legend">
                      <p className="text-small text-muted">
                        <strong>Legend:</strong>
                      </p>
                      <ul className="variables-list">
                        {Object.entries(variables || {}).map(([key, desc]) => (
                          <li key={key}>
                            <code>{key}</code> - {desc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <textarea
                  className="form-input form-textarea"
                  value={content}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_TEMPLATE_LENGTH) {
                      setContent(e.target.value);
                    }
                  }}
                  placeholder="Write your prompt template here. Use variables like {{COMMIT_MESSAGE}} to include dynamic data."
                  rows={16}
                  maxLength={MAX_TEMPLATE_LENGTH}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <p className="text-small text-muted" style={{ margin: 0 }}>
                    This is the prompt sent to the AI. Use the variables above to include commit details dynamically.
                  </p>
                  <span className={`text-small ${content.length > MAX_TEMPLATE_LENGTH * 0.9 ? 'text-warning' : 'text-muted'}`} style={{ marginLeft: 12 }}>
                    {content.length} / {MAX_TEMPLATE_LENGTH}
                  </span>
                </div>
              </div>
            </div>

            <div className="template-editor-preview">
              <div className="template-preview-header">
                <span>Live Tweet Preview</span>
                <span className="template-preview-note">Sample data</span>
              </div>
              <div className="tweet-preview-card">
                <div className="tweet-preview-header">
                  {previewData.AUTHOR_AVATAR ? (
                    <img 
                      src={previewData.AUTHOR_AVATAR} 
                      alt={previewData.AUTHOR_NAME}
                      className="tweet-preview-avatar-img"
                    />
                  ) : (
                    <div className="tweet-preview-avatar">
                      {previewData.AUTHOR_NAME.split(' ').map((part) => part[0]).join('')}
                    </div>
                  )}
                  <div className="tweet-preview-user">
                    <div className="tweet-preview-userline">
                      <span className="tweet-preview-name">{previewData.AUTHOR_NAME}</span>
                      <svg className="tweet-preview-verified" viewBox="0 0 22 22" aria-hidden="true">
                        <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                      </svg>
                    </div>
                    <div className="tweet-preview-handle">
                      @{previewData.AUTHOR_USERNAME} · {previewData.TIME_AGO}
                    </div>
                  </div>
                  <button className="tweet-preview-more" type="button" aria-label="More options">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                    </svg>
                  </button>
                </div>
                <p className="tweet-preview-body">
                  {renderPreview(content)}
                </p>
                <div className="tweet-preview-actions">
                  <button className="tweet-preview-action" type="button" aria-label="Reply">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z" />
                    </svg>
                    <span>{previewData.REPLIES}</span>
                  </button>
                  <button className="tweet-preview-action" type="button" aria-label="Repost">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
                    </svg>
                  </button>
                  <button className="tweet-preview-action" type="button" aria-label="Like">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
                    </svg>
                  </button>
                  <button className="tweet-preview-action" type="button" aria-label="Views">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
                    </svg>
                    <span>{previewData.VIEWS}</span>
                  </button>
                  <button className="tweet-preview-action" type="button" aria-label="Bookmark">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z" />
                    </svg>
                  </button>
                  <button className="tweet-preview-action" type="button" aria-label="Share">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-small text-muted template-preview-caption">
                Updates as you type so you can keep it tight and readable.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Customisation({ user, xConnected }) {
  const [loading, setLoading] = useState(true);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState('default');
  const [result, setResult] = useState({ type: '', message: '' });
  const [xUserInfo, setXUserInfo] = useState(null);
  
  // Presets are constants, no need to fetch from API
  const presets = Object.values(TEMPLATE_PRESETS);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    loadTemplates();
    loadXUserInfo();
  }, [xConnected]);

  const loadXUserInfo = async () => {
    if (xConnected) {
      try {
        const userData = await getCurrentUser();
        if (userData?.xUserInfo) {
          setXUserInfo(userData.xUserInfo);
        }
      } catch (err) {
        console.error('Failed to load X user info:', err);
      }
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const templatesData = await getMyTemplates().catch(err => {
        console.error('Failed to load user templates:', err);
        // Return empty object if templates endpoint fails
        return { templates: [], activeTemplateId: 'default' };
      });
      
      setCustomTemplates(templatesData.templates || []);
      setActiveTemplateId(templatesData.activeTemplateId || 'default');
    } catch (err) {
      console.error('Failed to load templates:', err);
      setResult({ type: 'error', message: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (templateId) => {
    try {
      await setActiveTemplate(templateId);
      setActiveTemplateId(templateId);
      setResult({ type: 'success', message: `Template "${templateId}" activated` });
      
      // Clear message after 3 seconds
      setTimeout(() => setResult({ type: '', message: '' }), 3000);
    } catch (err) {
      setResult({ type: 'error', message: err.message || 'Failed to activate template' });
    }
  };

  const handleSaveTemplate = async (templateId, templateName, templateContent) => {
    await saveTemplate(templateId, templateName, templateContent);
    await loadTemplates();
    setResult({ type: 'success', message: `Template "${templateName}" saved` });
    setTimeout(() => setResult({ type: '', message: '' }), 3000);
  };

  const handleEditTemplate = (template) => {
    // Find the full template with content
    const fullTemplate = customTemplates.find(t => t.id === template.id) || template;
    
    // If it's a preset, get the preset template content
    const preset = presets.find(p => p.id === template.id);
    if (preset) {
      setEditingTemplate({
        id: null, // Force new template creation
        name: `${preset.name} (Custom)`,
        template: preset.template
      });
    } else {
      setEditingTemplate(fullTemplate);
    }
    setModalOpen(true);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    
    try {
      await deleteTemplate(templateId);
      await loadTemplates();
      setResult({ type: 'success', message: 'Template deleted' });
      setTimeout(() => setResult({ type: '', message: '' }), 3000);
    } catch (err) {
      setResult({ type: 'error', message: err.message || 'Failed to delete template' });
    }
  };

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="text-center" style={{ padding: '40px 20px' }}>
        <div className="loading loading-lg"></div>
        <p className="text-muted mt-4">Loading templates...</p>
      </div>
    );
  }

  return (
    <div className="customisation-container">
      {result.message && (
        <div className={`alert alert-${result.type === 'error' ? 'error' : 'success'} mb-4`}>
          {result.type === 'error' ? '❌' : '✅'} {result.message}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header">
          <h2 className="card-title">
            <HiTemplate size={18} style={{ marginRight: 8 }} />
            Post Style Templates
          </h2>
          <button className="btn btn-primary btn-sm" onClick={handleCreateNew}>
            + Create Custom
          </button>
        </div>
        
        <p className="text-muted mb-4">
          Choose how your commit updates are formatted when posted to X. Select a preset or create your own custom style.
        </p>

        {/* Preset Templates */}
        <h3 className="section-subtitle">Preset Templates</h3>
        <div className="templates-grid">
          {presets.map(preset => (
            <TemplateCard
              key={preset.id}
              template={preset}
              isActive={activeTemplateId === preset.id}
              isPreset={true}
              onSelect={handleSelectTemplate}
              onEdit={handleEditTemplate}
              onDelete={handleDeleteTemplate}
            />
          ))}
        </div>

        {/* Custom Templates */}
        {customTemplates.length > 0 && (
          <>
            <h3 className="section-subtitle" style={{ marginTop: 24 }}>Your Custom Templates</h3>
            <div className="templates-grid">
              {customTemplates.filter(t => !presets.find(p => p.id === t.id)).map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isActive={activeTemplateId === template.id}
                  isPreset={false}
                  onSelect={handleSelectTemplate}
                  onEdit={handleEditTemplate}
                  onDelete={handleDeleteTemplate}
                />
              ))}
            </div>
          </>
        )}

        {customTemplates.filter(t => !presets.find(p => p.id === t.id)).length === 0 && (
          <div className="empty-state" style={{ padding: '24px', marginTop: 16 }}>
            <p className="text-muted">
              No custom templates yet. Click "Create Custom" to make your own!
            </p>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <HiInformationCircle size={18} style={{ marginRight: 8 }} />
            How Templates Work
          </h2>
        </div>
        <div className="how-it-works">
          <p>
            Templates define how your commit messages are transformed into social posts. 
            When you push a commit, GitLogs sends your selected template (with commit details filled in) 
            to an AI which generates the final post text.
          </p>
          <h4>Available Variables</h4>
          <div className="variables-reference">
            {Object.entries(TEMPLATE_VARIABLES).map(([key, desc]) => (
              <div key={key} className="variable-item">
                <code>{key}</code>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Template Editor Modal */}
      <TemplateEditorModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTemplate(null); }}
        onSave={handleSaveTemplate}
        template={editingTemplate}
        variables={TEMPLATE_VARIABLES}
        user={user}
        xUserInfo={xUserInfo}
      />
    </div>
  );
}

