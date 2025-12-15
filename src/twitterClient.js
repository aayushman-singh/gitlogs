const { TwitterApi } = require('twitter-api-v2');
const config = require('../config/config');

const client = new TwitterApi({
  appKey: config.twitter.apiKey,
  appSecret: config.twitter.apiSecret,
  accessToken: config.twitter.accessToken,
  accessSecret: config.twitter.accessSecret,
});

const twitterClient = client.readWrite;

async function postTweet(text, imageBuffer = null, replyToId = null) {
  try {
    const tweetPayload = { text: text };

    if (replyToId) {
      tweetPayload.reply = {
        in_reply_to_tweet_id: replyToId
      };
      console.log(`🧵 Threading to tweet: ${replyToId}`);
    }

    const tweet = await twitterClient.v2.tweet(tweetPayload);
    console.log(`✅ Tweet posted: ${tweet.data.id}`);
    return tweet.data.id;

  } catch (error) {
    console.error('❌ Error posting tweet:', error);
    
    if (error.code === 403) {
      const errorDetail = error.data?.detail || error.message;
      if (errorDetail && errorDetail.includes('oauth1 app permissions')) {
        throw new Error(
          'Twitter API permissions error: Your app needs "Read and Write" permissions.\n' +
          '1. Go to https://developer.twitter.com/en/portal/dashboard\n' +
          '2. Select your app → Settings → User authentication settings\n' +
          '3. Change App permissions to "Read and Write"\n' +
          '4. Regenerate your Access Token and Access Secret\n' +
          '5. Update your environment variables with the new tokens'
        );
      }
      throw new Error('Twitter API authentication failed. Check your credentials.');
    }
    if (error.code === 429) {
      throw new Error('Twitter rate limit exceeded. Please wait before posting again.');
    }
    
    throw new Error(`Failed to post tweet: ${error.message}`);
  }
}

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
  verifyCredentials
};

