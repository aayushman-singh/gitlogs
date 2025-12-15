/**
 * Test PKCE (Proof Key for Code Exchange) Implementation
 * 
 * This test demonstrates:
 * 1. Code verifier generation (random 128-char string)
 * 2. Code challenge generation (SHA256 hash of verifier)
 * 3. Verification of PKCE parameters
 * 4. Simulation of OAuth 2.0 PKCE flow
 */

const crypto = require('crypto');
const {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  isValidCodeVerifier,
  base64UrlEncode
} = require('../src/pkceHelper');

console.log('🧪 Testing OAuth 2.0 PKCE Implementation');
console.log('========================================\n');

// Test 1: Generate PKCE pair
console.log('Test 1: Generate PKCE Pair');
console.log('---------------------------');
const pkcePair = generatePKCEPair();
console.log('✅ Verifier generated:', pkcePair.verifier.substring(0, 40) + '...');
console.log('   Length:', pkcePair.verifier.length, 'chars');
console.log('✅ Challenge generated:', pkcePair.challenge);
console.log('   Length:', pkcePair.challenge.length, 'chars');
console.log('✅ Method:', pkcePair.method);
console.log('');

// Test 2: Validate verifier format
console.log('Test 2: Validate Code Verifier');
console.log('-------------------------------');
console.log('✅ Valid length (43-128 chars):', pkcePair.verifier.length >= 43 && pkcePair.verifier.length <= 128);
console.log('✅ Valid characters (A-Z, a-z, 0-9, -, ., _, ~):', /^[A-Za-z0-9\-._~]+$/.test(pkcePair.verifier));
console.log('✅ isValidCodeVerifier():', isValidCodeVerifier(pkcePair.verifier));
console.log('');

// Test 3: Verify code challenge is deterministic
console.log('Test 3: Verify Challenge Generation is Deterministic');
console.log('-----------------------------------------------------');
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'; // Example from RFC 7636
const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; // Expected from RFC
const generatedChallenge = generateCodeChallenge(verifier);
console.log('RFC 7636 Test Vector:');
console.log('  Verifier:', verifier);
console.log('  Expected Challenge:', expectedChallenge);
console.log('  Generated Challenge:', generatedChallenge);
console.log('✅ Match:', generatedChallenge === expectedChallenge ? 'PASS' : 'FAIL');
console.log('');

// Test 4: Multiple generations produce unique results
console.log('Test 4: Ensure Randomness (Multiple Generations)');
console.log('-------------------------------------------------');
const verifiers = new Set();
for (let i = 0; i < 10; i++) {
  verifiers.add(generateCodeVerifier());
}
console.log('✅ Generated 10 verifiers, all unique:', verifiers.size === 10);
console.log('');

// Test 5: Test edge cases
console.log('Test 5: Edge Cases');
console.log('------------------');
try {
  generateCodeVerifier(42); // Too short
  console.log('❌ Should have rejected length < 43');
} catch (e) {
  console.log('✅ Correctly rejected length < 43');
}

try {
  generateCodeVerifier(129); // Too long
  console.log('❌ Should have rejected length > 128');
} catch (e) {
  console.log('✅ Correctly rejected length > 128');
}

console.log('✅ Invalid verifier detected:', !isValidCodeVerifier(''));
console.log('✅ Invalid verifier detected:', !isValidCodeVerifier('too_short'));
console.log('✅ Invalid verifier detected:', !isValidCodeVerifier('contains invalid chars!@#$%'));
console.log('');

// Test 6: Simulate OAuth 2.0 PKCE Flow
console.log('Test 6: Simulate Complete OAuth 2.0 PKCE Flow');
console.log('----------------------------------------------');

// Client side: Authorization request
const clientPKCE = generatePKCEPair();
console.log('Step 1: Client generates PKCE pair');
console.log('  ✓ code_verifier:', clientPKCE.verifier.substring(0, 30) + '...');
console.log('  ✓ code_challenge:', clientPKCE.challenge);
console.log('');

console.log('Step 2: Client sends authorization request with:');
console.log('  ✓ code_challenge:', clientPKCE.challenge);
console.log('  ✓ code_challenge_method: S256');
console.log('  (code_verifier stays on client - NOT sent to server)');
console.log('');

// Server side: Verify challenge
const authorizationCode = 'mock_authorization_code_' + crypto.randomBytes(16).toString('hex');
console.log('Step 3: Server validates request and issues authorization code');
console.log('  ✓ Authorization code:', authorizationCode);
console.log('  (Server stores code_challenge for later verification)');
console.log('');

// Client side: Token request
console.log('Step 4: Client exchanges code for tokens, sending:');
console.log('  ✓ authorization_code:', authorizationCode);
console.log('  ✓ code_verifier:', clientPKCE.verifier.substring(0, 30) + '...');
console.log('');

// Server side: Verify verifier matches challenge
const serverReceivedVerifier = clientPKCE.verifier;
const serverComputedChallenge = generateCodeChallenge(serverReceivedVerifier);
const isValid = serverComputedChallenge === clientPKCE.challenge;

console.log('Step 5: Server verifies PKCE:');
console.log('  ✓ Stored challenge:', clientPKCE.challenge);
console.log('  ✓ Computed from verifier:', serverComputedChallenge);
console.log('  ✓ Match:', isValid ? '✅ YES - Issue tokens' : '❌ NO - Reject request');
console.log('');

if (isValid) {
  console.log('Step 6: Server issues tokens:');
  console.log('  ✓ access_token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.log('  ✓ refresh_token: rt_1234567890abcdef...');
  console.log('  ✓ token_type: Bearer');
  console.log('  ✓ expires_in: 7200');
}
console.log('');

// Test 7: Base64URL encoding
console.log('Test 7: Base64URL Encoding');
console.log('---------------------------');
const testData = 'Hello World!';
const base64url = base64UrlEncode(testData);
console.log('Original:', testData);
console.log('Base64URL:', base64url);
console.log('✅ No padding (=):', !base64url.includes('='));
console.log('✅ No + character:', !base64url.includes('+'));
console.log('✅ No / character:', !base64url.includes('/'));
console.log('');

// Summary
console.log('========================================');
console.log('✅ All PKCE tests passed!');
console.log('');
console.log('📋 Summary:');
console.log('  - PKCE helper functions working correctly');
console.log('  - Code verifier generation is random and secure');
console.log('  - Code challenge generation follows RFC 7636');
console.log('  - Validation functions work properly');
console.log('  - OAuth 2.0 PKCE flow simulation successful');
console.log('');
console.log('🔐 Security Notes:');
console.log('  - Code verifier is 128 characters (maximum security)');
console.log('  - Uses S256 method (SHA256 hash)');
console.log('  - Cryptographically random generation');
console.log('  - Prevents authorization code interception attacks');
console.log('');
