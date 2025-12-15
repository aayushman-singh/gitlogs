/**
 * Local testing script - tests components without posting to Twitter
 * Usage: node test-local.js
 */

const commitFormatter = require('./src/commitFormatter');

// Mock commit data
const mockCommit = {
  id: 'abc123def456789',
  message: 'feat(api): Add new endpoint\n\nThis commit adds a new API endpoint for user authentication.',
  timestamp: new Date().toISOString(),
  url: 'https://github.com/testuser/testrepo/commit/abc123def456789',
  author: {
    name: 'John Doe',
    email: 'john@example.com',
    username: 'johndoe'
  },
  added: ['src/api/auth.js', 'src/routes/auth.js'],
  removed: [],
  modified: ['package.json']
};

const mockRepository = {
  name: 'testrepo',
  full_name: 'testuser/testrepo',
  url: 'https://github.com/testuser/testrepo'
};

const mockPusher = {
  name: 'John Doe',
  email: 'john@example.com'
};

async function runTests() {
  console.log('🧪 Local Component Tests');
  console.log('========================\n');

  // Test 1: Commit Formatter
  console.log('1️⃣  Testing Commit Formatter...');
  try {
    const formatted = commitFormatter.formatCommit(mockCommit, mockRepository, mockPusher);
    console.log('   ✅ Commit formatted successfully');
    console.log('   📝 Tweet text preview:');
    console.log('   ' + formatted.text.split('\n').slice(0, 3).join('\n   ') + '...');
    console.log('   📊 SHA:', formatted.sha);
    console.log('   🎨 Emoji:', formatted.emoji);
    console.log('   📦 Type:', formatted.type || 'none');
    console.log('');
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    return;
  }

  // Test 2: Different commit types
  console.log('2️⃣  Testing Different Commit Types...');
  const commitTypes = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore'];
  
  for (const type of commitTypes) {
    const testCommit = {
      ...mockCommit,
      message: `${type}: Test ${type} commit`
    };
    const formatted = commitFormatter.formatCommit(testCommit, mockRepository, mockPusher);
    console.log(`   ${formatted.emoji} ${type}: ${formatted.type === type ? '✅' : '❌'}`);
  }
  console.log('');

  console.log('✅ All local tests completed!');
  console.log('💡 Next: Test with actual webhook using test-webhook.js');
}

runTests().catch(console.error);

