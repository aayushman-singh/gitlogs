/**
 * Test Gemini AI changelog generation
 * Usage: node test-gemini.js
 */

require('dotenv').config();
const geminiClient = require('./src/geminiClient');

// Mock commit data
const mockCommitContext = {
  message: 'feat(api): Add user authentication endpoint\n\nThis commit adds a new REST API endpoint for user authentication with JWT tokens.',
  type: 'feat',
  filesChanged: 3,
  added: ['src/api/auth.js', 'src/middleware/jwt.js'],
  modified: ['package.json'],
  removed: []
};

const mockRepository = {
  name: 'testrepo',
  full_name: 'testuser/testrepo',
  url: 'https://github.com/testuser/testrepo'
};

async function testGemini() {
  console.log('🤖 Testing Gemini AI Changelog Generation');
  console.log('==========================================\n');

  if (!geminiClient.isInitialized()) {
    console.error('❌ Gemini AI not initialized!');
    console.error('💡 Make sure GEMINI_API_KEY is set in your .env file');
    console.error('💡 Get your API key from: https://makersuite.google.com/app/apikey');
    return;
  }

  console.log('✅ Gemini AI initialized\n');

  // Test 1: Generate changelog
  console.log('1️⃣  Generating changelog...');
  console.log('📝 Original commit message:');
  console.log(`   ${mockCommitContext.message}\n`);

  try {
    const changelog = await geminiClient.generateChangelog(mockCommitContext, mockRepository);
    console.log('✅ Changelog generated:');
    console.log(`   ${changelog}\n`);
    console.log(`📏 Length: ${changelog.length} characters\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  // Test 2: Different commit types
  console.log('2️⃣  Testing different commit types...\n');
  
  const commitTypes = [
    { type: 'feat', message: 'feat: Add dark mode support' },
    { type: 'fix', message: 'fix: Resolve memory leak in data processing' },
    { type: 'docs', message: 'docs: Update API documentation' },
    { type: 'refactor', message: 'refactor: Optimize database queries' }
  ];

  for (const commit of commitTypes) {
    const context = {
      ...mockCommitContext,
      type: commit.type,
      message: commit.message
    };
    
    try {
      const changelog = await geminiClient.generateChangelog(context, mockRepository);
      console.log(`   ${commit.type}: ${changelog.substring(0, 60)}...`);
    } catch (error) {
      console.error(`   ❌ Error with ${commit.type}:`, error.message);
    }
  }

  console.log('\n✅ Gemini AI tests completed!');
}

testGemini().catch(console.error);

