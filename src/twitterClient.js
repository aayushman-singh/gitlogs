const { TwitterApi } = require('twitter-api-v2');
const config = require('../config/config');

/**
 * Twitter API client wrapper
 * Handles authentication and tweet posting
 * Note: Twitter is now X, but the API endpoints and library remain the same
 */

/**
 * Initialize Twitter client with credentials
 * Uses OAuth 1.0a User Context for posting tweets
 */
const client = new TwitterApi({
  appKey: config.twitter.apiKey,
  appSecret: config.twitter.apiSecret,
  accessToken: config.twitter.accessToken,
  accessSecret: config.twitter.accessSecret,
});

// Use v2 API for tweet posting
const twitterClient = client.readWrite;

/**
 * Upload media (image) to Twitter
 * 
 * @param {Buffer} imageBuffer - Image data as buffer
 * @returns {Promise<string>} - Media ID
 */
async function uploadMedia(imageBuffer) {
  try {
    // Upload using v1 API (v2 doesn't support media upload yet)
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
    });
    
    console.log(`📸 Media uploaded: ${mediaId}`);
    return mediaId;
  } catch (error) {
    console.error('❌ Error uploading media:', error);
    throw new Error(`Failed to upload media: ${error.message}`);
  }
}

/**
 * Post tweet with optional image and threading
 * 
 * @param {string} text - Tweet text
 * @param {Buffer|null} imageBuffer - Optional image buffer
 * @param {string|null} replyToId - Optional tweet ID to reply to (for threading)
 * @returns {Promise<string>} - Posted tweet ID
 */
async function postTweet(text, imageBuffer = null, replyToId = null) {
  try {
    // Build tweet payload
    const tweetPayload = {
      text: text
    };

    // Add media if provided
    if (imageBuffer) {
      const mediaId = await uploadMedia(imageBuffer);
      tweetPayload.media = {
        media_ids: [mediaId]
      };
    }

    // Add reply reference if threading
    if (replyToId) {
      tweetPayload.reply = {
        in_reply_to_tweet_id: replyToId
      };
      console.log(`🧵 Threading to tweet: ${replyToId}`);
    }

    // Post tweet using v2 API
    const tweet = await twitterClient.v2.tweet(tweetPayload);
    
    console.log(`✅ Tweet posted: ${tweet.data.id}`);
    return tweet.data.id;

  } catch (error) {
    console.error('❌ Error posting tweet:', error);
    
    // Handle specific Twitter API errors
    if (error.code === 403) {
      throw new Error('Twitter API authentication failed. Check your credentials.');
    }
    if (error.code === 429) {
      throw new Error('Twitter rate limit exceeded. Please wait before posting again.');
    }
    
    throw new Error(`Failed to post tweet: ${error.message}`);
  }
}

/**
 * Verify Twitter credentials are valid
 * Call this on startup to ensure credentials work
 * 
 * @returns {Promise<boolean>} - True if credentials are valid
 */
async function verifyCredentials() {
  try {
    const user = await twitterClient.v2.me();
    console.log(`✅ Twitter authenticated as: @${user.data.username}`);
    return true;
  } catch (error) {
    console.error('❌ Twitter authentication failed:', error.message);
    return false;
  }
}

module.exports = {
  postTweet,
  uploadMedia,
  verifyCredentials
};

