# OAuth 2.0 with PKCE Setup Guide

This guide explains how to set up and use the bot with the new OAuth 2.0 with PKCE authentication method.

## Overview

The bot now uses **OAuth 2.0 with PKCE** (Proof Key for Code Exchange) for secure authentication with X (Twitter) API. This is similar to the Python implementation in `C:\Repo\x_api_auth_example`.

**Key Benefits:**
- ✅ More secure than OAuth 1.0a
- ✅ Tokens stored in database (automatic refresh)
- ✅ No need to manually manage access tokens
- ✅ Supports both public (PKCE only) and confidential (with client_secret) clients

## Step-by-Step Setup

### 1. Get X API Credentials

1. Go to [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create a new app or select an existing one
3. Navigate to **Settings** → **User authentication settings**
4. Enable **OAuth 2.0**
5. Set **App permissions** to **Read and Write**
6. Set **Callback URI / Redirect URL** to:
   - **Local development:** `http://localhost:3000/oauth/callback`
   - **Production:** `https://your-domain.com/oauth/callback`
7. Save the settings
8. Copy your **Client ID** and optionally **Client Secret** (if using confidential client mode)

### 2. Configure Environment Variables

Create or update your `.env` file:

```env
# OAuth 2.0 with PKCE (Required)
OAUTH_CLIENT_ID=your_client_id_here

# Optional: For confidential client mode (more secure)
# Leave empty for public client mode (PKCE only)
OAUTH_CLIENT_SECRET=your_client_secret_here

# Optional: Custom callback URL (defaults to http://localhost:PORT/oauth/callback)
OAUTH_CALLBACK_URL=http://localhost:3000/oauth/callback

# Database (Required for token storage)
ENABLE_THREADING=true
DATABASE_PATH=./tweets.db

# GitHub Webhook (Required)
WEBHOOK_SECRET=your_webhook_secret_here

# Gemini AI (Optional but recommended)
GEMINI_API_KEY=your_gemini_api_key

# Server
PORT=3000
NODE_ENV=production
```

**Important Notes:**
- `OAUTH_CLIENT_ID` is **required**
- `OAUTH_CLIENT_SECRET` is **optional** - if provided, uses confidential client mode (more secure)
- If `OAUTH_CLIENT_SECRET` is not set, uses public client mode (PKCE only, still secure)
- The callback URL in `.env` must match exactly what you set in X Developer Portal

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
npm start
```

You should see output like:
```
✅ Database initialized
🚀 Git→X Bot listening on port 3000
📡 Webhook endpoint: http://localhost:3000/webhook/github
🔐 OAuth endpoint: http://localhost:3000/oauth
   Visit this URL to authenticate with X API (OAuth 2.0 with PKCE)
🔒 Webhook secret is SET
🐦 X API credentials are SET
```

### 5. Authenticate with X API

**Option A: Using Browser (Recommended)**

1. Open your browser and visit:
   ```
   http://localhost:3000/oauth
   ```
   (Or `https://your-domain.com/oauth` in production)

2. You'll be redirected to X (Twitter) to authorize the app

3. Click **Authorize app**

4. You'll be redirected back to your server

5. You should see: **"✅ Authentication Successful! Your tokens have been stored."**

6. **Done!** Tokens are now stored in the database and will be automatically refreshed.

**Option B: Using cURL (for testing)**

```bash
# Start the OAuth flow
curl -L http://localhost:3000/oauth

# Or in production:
curl -L https://your-domain.com/oauth
```

### 6. Verify Authentication

Check your server logs - you should see:
```
✅ Tokens stored successfully
💾 OAuth token stored in database
✅ X API client initialized (confidential mode)  # or (public (PKCE) mode)
   Token source: database
   Refresh token: Available
```

### 7. Test the Bot

Make a test commit:

```bash
git commit --allow-empty -m "feat: test OAuth 2.0 PKCE authentication"
git push
```

The bot should automatically:
1. Receive the webhook from GitHub
2. Generate a changelog (if Gemini API key is set)
3. Post a tweet using the stored OAuth token
4. Save the tweet ID to the database

## How It Works

### Authentication Flow

1. **Initial Setup:**
   - Visit `/oauth` endpoint
   - Server generates PKCE code verifier and challenge
   - Redirects to X authorization page

2. **Authorization:**
   - User authorizes the app on X
   - X redirects back to `/oauth/callback` with authorization code

3. **Token Exchange:**
   - Server exchanges authorization code + PKCE verifier for access token and refresh token
   - Tokens are stored in database (`oauth_tokens` table)

4. **Automatic Refresh:**
   - When access token expires, bot automatically refreshes using refresh token
   - New tokens are stored in database
   - No manual intervention needed

### Token Storage

Tokens are stored in SQLite database:
- **Table:** `oauth_tokens`
- **Fields:** `token` (JSON), `expires_at`, `refresh_token`
- **Location:** `./tweets.db` (or path specified in `DATABASE_PATH`)

### Client Modes

**Confidential Client (with client_secret):**
- More secure
- Uses Basic Auth for token refresh
- Recommended for server-side applications

**Public Client (PKCE only):**
- Still secure (PKCE provides protection)
- No client_secret needed
- Good for apps that can't securely store secrets

## Troubleshooting

### "No OAuth token found"

**Problem:** Bot can't find tokens in database

**Solution:**
1. Visit `/oauth` endpoint to authenticate
2. Make sure database is enabled (`ENABLE_THREADING=true`)
3. Check database file exists and is writable

### "Token refresh failed"

**Problem:** Refresh token expired or invalid

**Solution:**
1. Re-authenticate by visiting `/oauth` endpoint
2. This will generate new tokens

### "PKCE code verifier not found"

**Problem:** OAuth callback can't find the PKCE verifier

**Solution:**
1. Make sure you complete the flow in one session
2. Don't close the browser between `/oauth` and `/oauth/callback`
3. If using multiple servers, ensure PKCE store is shared (or use session storage)

### "Callback URL mismatch"

**Problem:** X API rejects the callback

**Solution:**
1. Check callback URL in X Developer Portal matches exactly:
   - `http://localhost:3000/oauth/callback` (local)
   - `https://your-domain.com/oauth/callback` (production)
2. No trailing slashes
3. Correct protocol (http vs https)

### Database errors

**Problem:** Can't store or retrieve tokens

**Solution:**
1. Make sure `ENABLE_THREADING=true` in `.env`
2. Check database file permissions
3. Verify `DATABASE_PATH` is correct and writable

## Production Deployment

### Update Callback URL

1. In X Developer Portal, update callback URL to your production domain:
   ```
   https://your-domain.com/oauth/callback
   ```

2. Update `.env`:
   ```env
   OAUTH_CALLBACK_URL=https://your-domain.com/oauth/callback
   ```

3. Restart the server

### Security Considerations

- ✅ Use HTTPS in production (required for OAuth callbacks)
- ✅ Keep `OAUTH_CLIENT_SECRET` secure (never commit to git)
- ✅ Use strong webhook secret
- ✅ Enable `ALLOWED_REPOS` to restrict repositories
- ✅ Regularly update dependencies

## Migration from Old OAuth Methods

If you were using the old `get-refresh-token.js` script:

1. **Remove old tokens** from `.env`:
   - Remove `TWITTER_ACCESS_TOKEN`
   - Remove `TWITTER_REFRESH_TOKEN`

2. **Add new credentials**:
   - Add `OAUTH_CLIENT_ID`
   - Optionally add `OAUTH_CLIENT_SECRET`

3. **Authenticate via web interface**:
   - Visit `/oauth` endpoint
   - Complete the flow

4. **Done!** Tokens are now managed automatically.

## API Endpoints

### `GET /oauth`
Starts the OAuth 2.0 authentication flow with PKCE.

**Usage:**
```
Visit: http://localhost:3000/oauth
```

### `GET /oauth/callback`
Handles the OAuth callback from X API.

**Usage:**
Automatically called by X API after authorization.

### `GET /`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Gitlogs bot is running",
  "version": "1.0.0"
}
```

### `POST /webhook/github`
GitHub webhook endpoint for receiving commit events.

## Example Workflow

1. **Setup:**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   npm start
   ```

2. **Authenticate:**
   - Visit `http://localhost:3000/oauth`
   - Authorize on X
   - Tokens stored automatically

3. **Configure GitHub Webhook:**
   - Repository → Settings → Webhooks
   - URL: `https://your-domain.com/webhook/github`
   - Secret: Your `WEBHOOK_SECRET`
   - Events: Just the push event

4. **Test:**
   ```bash
   git commit --allow-empty -m "feat: test commit"
   git push
   ```

5. **Check Twitter/X:**
   - Your commit should be tweeted automatically!

## Need Help?

- Check server logs for detailed error messages
- Verify all environment variables are set correctly
- Ensure callback URL matches in both `.env` and X Developer Portal
- Make sure database is enabled and writable
