/**
 * OAuth 2.0 with PKCE Handler
 * 
 * Similar to Python xauth.py implementation:
 * - Handles OAuth 2.0 flow with PKCE
 * - Stores tokens in database
 * - Automatically refreshes expired tokens
 * - Provides seamless authentication flow
 * 
 * Reference: C:\Repo\x_api_auth_example\src\xauth\xauth.py
 */

const { Client, auth } = require('twitter-api-sdk');
const config = require('../config/config');
const db = require('./database');
const { generatePKCEPair } = require('./pkceHelper');
const https = require('https');
const http = require('http');

// Constants matching Python implementation
const OAUTH_PORT = process.env.OAUTH_PORT || 5001;
const REDIRECT_URI = process.env.OAUTH_CALLBACK_URL || `http://localhost:${OAUTH_PORT}/callback`;
const AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const SCOPES = ['tweet.read', 'users.read', 'tweet.write', 'offline.access'];

class OAuthHandler {
  constructor() {
    this.clientId = config.twitter.clientId;
    this.clientSecret = config.twitter.clientSecret;
    this.redirectUri = REDIRECT_URI;
    this.authUrl = AUTH_URL;
    this.tokenUrl = TOKEN_URL;
    this.scopes = SCOPES;
    
    if (!this.clientId) {
      throw new Error('OAUTH_CLIENT_ID is required');
    }
  }

  /**
   * Create OAuth2User session
   */
  _makeOAuthSession() {
    const authConfig = {
      client_id: this.clientId,
      callback: this.redirectUri,
      scopes: this.scopes,
    };
    
    if (this.clientSecret) {
      authConfig.client_secret = this.clientSecret;
    }
    
    return new auth.OAuth2User(authConfig);
  }

  /**
   * Refresh access token using refresh token
   * Similar to Python _refresh_token method
   */
  async _refreshToken() {
    const refreshToken = db.getRefreshToken();
    if (!refreshToken) {
      console.log('No refresh token found. User needs to re-authenticate.');
      return null;
    }

    const oauth = this._makeOAuthSession();
    oauth.token = {
      refresh_token: refreshToken,
      access_token: 'dummy', // Placeholder
    };

    // Build token refresh request
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: this.clientId,
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Use Basic Auth for confidential clients
    if (this.clientSecret) {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.tokenUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: headers,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`Token refresh failed (${res.statusCode}): ${data}`));
              return;
            }

            const response = JSON.parse(data);
            const token = {
              access_token: response.access_token,
              token_type: response.token_type || 'Bearer',
              refresh_token: response.refresh_token || refreshToken,
              expires_in: response.expires_in,
              scope: response.scope,
              expires_at: Date.now() / 1000 + (response.expires_in || 7200),
            };

            db.storeOAuthToken(token);
            console.log('✅ Token refreshed successfully');
            resolve(token);
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Token refresh request failed: ${error.message}`));
      });

      req.write(params.toString());
      req.end();
    });
  }

  /**
   * Get a valid access token
   * Similar to Python get_access_token method
   * - Checks database for existing token
   * - Refreshes if expired
   * - Returns access token string
   */
  async getAccessToken() {
    let token = db.getOAuthToken();
    
    if (!token) {
      console.log('No token found. Starting authentication...');
      throw new Error(
        'No OAuth token found. Please authenticate first by visiting:\n' +
        `http://localhost:${OAUTH_PORT}`
      );
    }

    // Check if token is expired
    const expiresAt = token.expires_at || 0;
    if (Date.now() / 1000 >= expiresAt) {
      console.log('Token expired. Refreshing...');
      token = await this._refreshToken();
    }

    return token ? token.access_token : null;
  }

  /**
   * Check if token is valid
   */
  isTokenValid() {
    return db.isOAuthTokenValid();
  }

  /**
   * Exchange authorization code for tokens with PKCE
   * Similar to Python auth_callback route
   */
  async exchangeCodeForTokens(code, codeVerifier) {
    const oauth = this._makeOAuthSession();
    
    // Build token request with PKCE
    const params = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Use Basic Auth for confidential clients
    if (this.clientSecret) {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.tokenUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: headers,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`Token exchange failed (${res.statusCode}): ${data}`));
              return;
            }

            const response = JSON.parse(data);
            const token = {
              access_token: response.access_token,
              token_type: response.token_type || 'Bearer',
              refresh_token: response.refresh_token,
              expires_in: response.expires_in,
              scope: response.scope,
              expires_at: Date.now() / 1000 + (response.expires_in || 7200),
            };

            const stored = db.storeOAuthToken(token);
            if (stored) {
              console.log('✅ Tokens stored successfully');
            } else {
              console.error('❌ Failed to store tokens in database. Make sure ENABLE_THREADING=true in your .env file.');
            }
            resolve(token);
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Token exchange request failed: ${error.message}`));
      });

      req.write(params.toString());
      req.end();
    });
  }

  /**
   * Generate authorization URL with PKCE
   * Similar to Python auth_start route
   */
  generateAuthUrl() {
    const pkcePair = generatePKCEPair();
    const oauth = this._makeOAuthSession();
    
    const authUrl = oauth.generateAuthURL({
      state: 'state',
      code_challenge: pkcePair.challenge,
      code_challenge_method: pkcePair.method,
    });

    return {
      authUrl,
      codeVerifier: pkcePair.verifier,
      codeChallenge: pkcePair.challenge,
    };
  }
}

module.exports = OAuthHandler;
