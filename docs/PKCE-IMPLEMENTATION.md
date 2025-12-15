# OAuth 2.0 PKCE Implementation

## Overview

This project implements **OAuth 2.0 with PKCE (Proof Key for Code Exchange)** for Twitter/X API authentication. PKCE adds an additional layer of security to the OAuth 2.0 Authorization Code flow, protecting against authorization code interception attacks.

## What is PKCE?

PKCE (RFC 7636) is an extension to OAuth 2.0 that:
- Prevents authorization code interception attacks
- Allows public clients (mobile apps, SPAs) to securely use OAuth 2.0
- Works with or without client_secret (supports both public and confidential clients)
- Uses cryptographic challenge-response mechanism

## Implementation Details

### Files Structure

```
src/
├── pkceHelper.js          # PKCE utility functions
├── twitterClient.js       # Twitter API client with PKCE support
└── config/
    └── config.js          # Configuration management

scripts/
└── get-refresh-token.js   # OAuth 2.0 PKCE authorization flow script

tests/
└── test-pkce.js           # Comprehensive PKCE tests
```

### Core Components

#### 1. PKCE Helper (`src/pkceHelper.js`)

Provides cryptographic functions for PKCE:

- `generateCodeVerifier(length)` - Generates random 43-128 char string
- `generateCodeChallenge(verifier)` - Creates SHA256 hash of verifier
- `generatePKCEPair()` - Generates both verifier and challenge
- `base64UrlEncode(input)` - RFC 4648 Section 5 compliant encoding
- `isValidCodeVerifier(verifier)` - Validates verifier format

**Example:**
```javascript
const { generatePKCEPair } = require('./src/pkceHelper');

const pkcePair = generatePKCEPair();
// {
//   verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk...",
//   challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
//   method: "S256"
// }
```

#### 2. Twitter Client (`src/twitterClient.js`)

Enhanced Twitter API client supporting:
- **Public Client Mode**: PKCE only (no client_secret)
- **Confidential Client Mode**: PKCE + client_secret (more secure)
- Automatic token refresh with PKCE compliance
- Proxy support for token endpoints

**Client Modes:**

| Mode | Requires | Use Case | Security |
|------|----------|----------|----------|
| Public | client_id only | Mobile apps, SPAs | PKCE required |
| Confidential | client_id + client_secret | Server-side apps | PKCE + Basic Auth |

#### 3. Authorization Script (`scripts/get-refresh-token.js`)

Interactive OAuth 2.0 flow implementation:
- Generates PKCE pair for each authorization
- Creates authorization URL with code_challenge
- Handles callback and token exchange
- Validates PKCE parameters
- Supports both localhost and remote callbacks

## PKCE Flow Diagram

```
┌─────────┐                                      ┌─────────┐
│ Client  │                                      │ Twitter │
│  App    │                                      │   API   │
└────┬────┘                                      └────┬────┘
     │                                                │
     │ 1. Generate code_verifier (random 128 chars)  │
     │    code_challenge = SHA256(code_verifier)     │
     │                                                │
     │ 2. Authorization Request                      │
     │    + code_challenge                            │
     │    + code_challenge_method=S256               │
     ├───────────────────────────────────────────────>│
     │                                                │
     │                                         3. Stores
     │                                         code_challenge
     │                                                │
     │ 4. Authorization Code                         │
     │<───────────────────────────────────────────────┤
     │                                                │
     │ 5. Token Request                              │
     │    + authorization_code                       │
     │    + code_verifier                            │
     ├───────────────────────────────────────────────>│
     │                                                │
     │                                      6. Verifies:
     │                                      SHA256(code_verifier)
     │                                      == stored code_challenge
     │                                                │
     │ 7. Access Token + Refresh Token               │
     │<───────────────────────────────────────────────┤
     │                                                │
```

## Usage Guide

### Step 1: Configuration

Add to your `.env` file:

```bash
# Required
OAUTH_CLIENT_ID=your_client_id_here
TWITTER_ACCESS_TOKEN=your_access_token_here

# Optional (for confidential client mode)
OAUTH_CLIENT_SECRET=your_client_secret_here

# Optional (for automatic token refresh)
TWITTER_REFRESH_TOKEN=your_refresh_token_here

# Optional (for proxy support)
PROXY_URL=https://your-proxy.com/
```

### Step 2: Get Refresh Token

Run the authorization flow:

```bash
node scripts/get-refresh-token.js
```

The script will:
1. ✅ Generate PKCE pair (verifier + challenge)
2. ✅ Display authorization URL with PKCE parameters
3. ✅ Open browser for Twitter authorization
4. ✅ Handle OAuth callback
5. ✅ Exchange code + verifier for tokens
6. ✅ Display access_token and refresh_token

**Example Output:**
```
🔐 PKCE Security:
   Code Verifier (length): 128 chars
   Code Challenge: QC6N-R0qot26fsTmVyRladwHUZVxh9...
   Challenge Method: S256

✅ Using confidential client mode (client_secret provided)

📋 Authorization URL Details:
   Code Challenge Method: S256
   Code Challenge: Present (QC6N-R0qot26fsTmVy...)
   
✅ PKCE code_challenge matches our generated challenge

📡 Listening on http://localhost:3000/callback
⏳ Waiting for authorization...
```

### Step 3: Use in Your App

The Twitter client automatically handles token refresh:

```javascript
const { postTweet } = require('./src/twitterClient');

// Post a tweet (automatically refreshes token if needed)
await postTweet('Hello from PKCE! 🔐');
```

## Security Features

### 1. Cryptographic Randomness
- Uses `crypto.randomBytes()` for verifier generation
- Maximum entropy with 128-character verifiers
- Cryptographically secure random number generator

### 2. SHA256 Challenge Method
- Uses S256 method (not plain)
- One-way hash prevents verifier recovery
- Compliant with RFC 7636 recommendations

### 3. Base64URL Encoding
- URL-safe encoding (RFC 4648 Section 5)
- No padding characters (=)
- Safe for query parameters

### 4. Protection Against Attacks

| Attack Type | Protection |
|------------|-----------|
| Authorization Code Interception | Attacker can't use code without verifier |
| Code Replay | Server validates verifier matches challenge |
| Code Injection | Each flow uses unique random verifier |
| MITM Attacks | PKCE adds layer even if TLS compromised |

## Testing

Run comprehensive PKCE tests:

```bash
node tests/test-pkce.js
```

**Tests include:**
- ✅ PKCE pair generation
- ✅ Code verifier validation
- ✅ Code challenge computation (RFC 7636 test vectors)
- ✅ Randomness verification
- ✅ Edge case handling
- ✅ Complete OAuth 2.0 PKCE flow simulation
- ✅ Base64URL encoding validation

## API Reference

### pkceHelper.js

#### `generateCodeVerifier(length = 128)`
Generates a cryptographically random code verifier.

**Parameters:**
- `length` (number): Length between 43-128 characters (default: 128)

**Returns:** String - URL-safe random string

**Example:**
```javascript
const verifier = generateCodeVerifier(128);
// "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk..."
```

#### `generateCodeChallenge(verifier)`
Creates SHA256 hash of code verifier.

**Parameters:**
- `verifier` (string): The code verifier

**Returns:** String - Base64URL encoded SHA256 hash

**Example:**
```javascript
const challenge = generateCodeChallenge(verifier);
// "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
```

#### `generatePKCEPair()`
Generates a complete PKCE pair.

**Returns:** Object
```javascript
{
  verifier: string,    // Random 128-char string
  challenge: string,   // SHA256(verifier)
  method: "S256"       // Challenge method
}
```

#### `isValidCodeVerifier(verifier)`
Validates code verifier format.

**Parameters:**
- `verifier` (string): Code verifier to validate

**Returns:** Boolean - True if valid

**Validation Rules:**
- Length: 43-128 characters
- Characters: A-Z, a-z, 0-9, -, ., _, ~
- Not null or undefined

#### `base64UrlEncode(input)`
Encodes data to Base64URL format.

**Parameters:**
- `input` (Buffer|string): Data to encode

**Returns:** String - Base64URL encoded string

**Transformations:**
- `+` → `-`
- `/` → `_`
- Remove `=` padding

## Troubleshooting

### Error: "PKCE verifier mismatch"

**Cause:** Using authorization code from different script instance

**Solution:** Keep script running during OAuth flow, or use localhost callback

### Error: "invalid_request"

**Causes:**
1. Missing PKCE parameters (code_challenge, code_challenge_method)
2. Redirect URI mismatch
3. OAuth 2.0 not enabled in Twitter Developer Portal

**Solution:**
1. Check authorization URL has PKCE parameters
2. Verify callback URL matches exactly in Twitter settings
3. Enable OAuth 2.0 in app settings

### Error: "Token refresh failed"

**Causes:**
1. No refresh token available
2. Refresh token expired
3. Invalid client credentials

**Solution:**
1. Run `node scripts/get-refresh-token.js` to get new refresh token
2. Add `TWITTER_REFRESH_TOKEN` to `.env`
3. Verify `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`

## References

- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [RFC 4648 - Base64URL](https://tools.ietf.org/html/rfc4648#section-5)
- [Twitter OAuth 2.0 Docs](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
1. PKCE tests pass: `node tests/test-pkce.js`
2. Code follows RFC 7636 standards
3. Security best practices maintained
