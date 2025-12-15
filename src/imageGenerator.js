const { createCanvas, registerFont } = require('canvas');

/**
 * Generate commit preview images
 * Creates a nice-looking card with commit details
 */

// Image dimensions (optimized for Twitter)
const WIDTH = 1200;
const HEIGHT = 630;

// Color palette (GitHub dark theme inspired)
const COLORS = {
  background: '#0d1117',
  cardBg: '#161b22',
  border: '#30363d',
  primary: '#58a6ff',
  success: '#3fb950',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  accent: '#f78166'
};

/**
 * Wrap text to fit within width
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to wrap
 * @param {number} maxWidth - Maximum width in pixels
 * @returns {string[]} - Array of lines
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine !== '') {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Draw rounded rectangle
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {number} radius - Border radius
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generate commit preview image
 * 
 * @param {object} commitData - Formatted commit data
 * @returns {Promise<Buffer>} - PNG image buffer
 */
async function generateImage(commitData) {
  // Create canvas
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Main card background
  ctx.fillStyle = COLORS.cardBg;
  roundRect(ctx, 40, 40, WIDTH - 80, HEIGHT - 80, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 40, 40, WIDTH - 80, HEIGHT - 80, 16);
  ctx.stroke();

  // Commit SHA badge
  ctx.fillStyle = COLORS.success;
  roundRect(ctx, 60, 60, 160, 50, 8);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(commitData.sha, 80, 93);

  // Repository name
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '20px sans-serif';
  ctx.fillText(commitData.repoFullName, 240, 88);

  // Commit emoji and type
  let yPos = 150;
  if (commitData.type) {
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${commitData.emoji} ${commitData.type.toUpperCase()}`, 60, yPos);
    yPos += 40;
  } else {
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${commitData.emoji} COMMIT`, 60, yPos);
    yPos += 40;
  }

  // Commit message (wrapped)
  ctx.fillStyle = COLORS.text;
  ctx.font = '32px sans-serif';
  const messageLines = wrapText(ctx, commitData.subject, WIDTH - 140);
  
  for (let i = 0; i < Math.min(messageLines.length, 4); i++) {
    ctx.fillText(messageLines[i], 60, yPos);
    yPos += 45;
  }

  // Author info at bottom
  yPos = HEIGHT - 120;
  
  // Author name
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '24px sans-serif';
  ctx.fillText(`👤 ${commitData.author}`, 60, yPos);

  // Files changed (if available)
  if (commitData.filesChanged > 0) {
    ctx.fillText(`📁 ${commitData.filesChanged} files changed`, 60, yPos + 40);
  }

  // Timestamp
  const date = new Date(commitData.timestamp);
  const dateStr = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
  ctx.fillText(`📅 ${dateStr}`, WIDTH - 300, yPos + 40);

  // Convert canvas to buffer
  return canvas.toBuffer('image/png');
}

module.exports = {
  generateImage
};

