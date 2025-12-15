/**
 * OAuth 2.0 PKCE (Proof Key for Code Exchange) Helper Functions
 * 
 * PKCE Flow Overview:
 * 1. Generate a random code_verifier (43-128 chars)
 * 2. Create code_challenge = BASE64URL(SHA256(code_verifier))
 * 3. Send code_challenge in authorization request
 * 4. Send code_verifier in token exchange (proves you're the same client)
 * 
 * Reference: RFC 7636 - https://tools.ietf.org/html/rfc7636
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically random code verifier
 * @param {number} length - Length between 43-128 characters (default: 128)
 * @returns {string} URL-safe random string
 */
function generateCodeVerifier(length = 128) {
  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128 characters');
  }
  
  // Generate random bytes and convert to base64url
  // We need more bytes than the target length because base64 encoding expands the size
  const randomBytes = crypto.randomBytes(Math.ceil(length * 0.75));
  return base64UrlEncode(randomBytes).substring(0, length);
}

/**
 * Generate code challenge from code verifier using S256 method
 * @param {string} verifier - The code verifier
 * @returns {string} Base64URL encoded SHA256 hash of the verifier
 */
function generateCodeChallenge(verifier) {
  // SHA256 hash the verifier
  const hash = crypto.createHash('sha256').update(verifier).digest();
  // Base64URL encode the hash
  return base64UrlEncode(hash);
}

/**
 * Base64URL encode (RFC 4648 Section 5)
 * Converts standard base64 to URL-safe base64:
 * - Replace + with -
 * - Replace / with _
 * - Remove = padding
 * 
 * @param {Buffer|string} input - Data to encode
 * @returns {string} Base64URL encoded string
 */
function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a PKCE pair (verifier and challenge)
 * @returns {{verifier: string, challenge: string, method: string}}
 */
function generatePKCEPair() {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  
  return {
    verifier,
    challenge,
    method: 'S256' // SHA256 method
  };
}

/**
 * Validate a code verifier format
 * Must be 43-128 characters, only [A-Z, a-z, 0-9, -, ., _, ~]
 * @param {string} verifier - Code verifier to validate
 * @returns {boolean} True if valid
 */
function isValidCodeVerifier(verifier) {
  if (!verifier || typeof verifier !== 'string') {
    return false;
  }
  
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }
  
  // Check only allowed characters (unreserved characters per RFC 3986)
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  return validPattern.test(verifier);
}

module.exports = {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  base64UrlEncode,
  isValidCodeVerifier
};
