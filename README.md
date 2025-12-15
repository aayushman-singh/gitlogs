# Git→Twitter Bot 🚀

Automatically tweet your git commits with AI-generated changelogs using Google Gemini.

## Features

- ✅ Real-time commit detection via GitHub webhooks
- ✅ AI-powered changelog generation with Google Gemini
- ✅ Tweet threading support (optional)
- ✅ Conventional commit format support
- ✅ Repository filtering
- ✅ Secure webhook verification

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required Configuration:**

- **GitHub Webhook Secret**: Generate with `openssl rand -hex 20`
- **Twitter/X API Credentials**: Get from [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
  - Note: Twitter is now X, but the API endpoints and authentication remain the same
  - You'll need: API Key, API Secret, Access Token, and Access Secret
- **Gemini API Key** (Optional but recommended): Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
  - If not provided, the bot will use the original commit message

### 3. Test Locally

```bash
# Test commit formatting and changelog generation
npm run test:local

# Test webhook endpoint (requires server to be running)
npm start  # In one terminal
npm run test:webhook  # In another terminal

# Test Gemini AI (requires GEMINI_API_KEY)
npm run test:gemini
```

### 4. Run the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on port 3000 (or the port specified in your `.env`).

## Configuration

### Repository Filtering

To only accept commits from specific repositories:

```env
ALLOWED_REPOS=username/repo1,username/repo2
```

Leave empty to accept all repositories.

### Threading Support

To enable tweet threading (each commit replies to the previous one):

```env
ENABLE_THREADING=true
```

The database will automatically store tweet IDs for threading.

### Gemini AI Configuration

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-pro  # Optional: gemini-pro, gemini-pro-vision, gemini-1.5-pro
```

**Available Models:**
- `gemini-pro` (default) - Best for text generation tasks
- `gemini-pro-vision` - For multimodal tasks
- `gemini-1.5-pro` - Latest model (if available)

If Gemini API key is not set, the bot will use the original commit message.

## Setting Up GitHub Webhooks

### Step 1: Deploy Your Server

Your bot needs to be accessible from the internet. Options:

**Option A: Local Testing (ngrok)**
```bash
npm start
# In another terminal:
ngrok http 3000
# Use the ngrok HTTPS URL for webhook
```

**Option B: Production Deployment**
- **Railway** - [railway.app](https://railway.app) - Easy deployment, free tier
- **Render** - [render.com](https://render.com) - Free tier
- **AWS EC2** - See deployment section below
- **Heroku** - Popular platform
- **VPS** - DigitalOcean, Linode, etc.

### Step 2: Generate Webhook Secret

```bash
openssl rand -hex 20
```

Add to `.env`:
```env
WEBHOOK_SECRET=your_generated_secret_here
```

### Step 3: Configure GitHub Webhook

For each repository:

1. Go to **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** `https://your-server-url.com/webhook/github`
3. **Content type:** `application/json`
4. **Secret:** Same as `WEBHOOK_SECRET` in `.env`
5. **Events:** Just the push event
6. Click **Add webhook**

### Step 4: Test

```bash
git commit --allow-empty -m "feat: test commit"
git push
```

Check your server logs and Twitter/X - your commit should be tweeted!

## Testing

### Local Component Tests

```bash
npm run test:local
```

Tests commit formatting and different commit types.

### Webhook Tests

```bash
# Start server
npm start

# In another terminal
npm run test:webhook
# Or with custom values:
node test-webhook.js your-secret http://localhost:3000/webhook/github
```

### Twitter API Test

Create `test-twitter.js`:
```javascript
const twitterClient = require('./src/twitterClient');
twitterClient.verifyCredentials().then(valid => {
  console.log(valid ? '✅ Valid' : '❌ Invalid');
});
```

Run: `node test-twitter.js`

### Dry Run Mode

To test without posting tweets, add to `webhookHandler.js`:
```javascript
if (process.env.DRY_RUN === 'true') {
  console.log('🐦 [DRY RUN] Would post:', tweetData.text);
  return;
}
```

Then: `DRY_RUN=true npm start`

## Deployment

### Ubuntu with systemd and Nginx

Complete setup guide for Ubuntu server with systemd service and Nginx reverse proxy.

#### Step 1: Install Node.js and Dependencies

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools (needed for better-sqlite3)
sudo apt-get install -y build-essential python3

# Install Git
sudo apt-get install -y git

# Verify installations
node --version
npm --version
```

#### Step 2: Clone and Setup Bot

```bash
# Clone repository
git clone https://github.com/yourusername/git-twitter-bot.git
cd git-twitter-bot

# Install dependencies
npm install --production

# Copy and configure environment
cp .env.example .env
nano .env  # Add your credentials
```

#### Step 3: Create systemd Service

Create service file:

```bash
sudo nano /etc/systemd/system/git-twitter-bot.service
```

Add the following content:

```ini
[Unit]
Description=Git Twitter Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/git-twitter-bot
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=git-twitter-bot

[Install]
WantedBy=multi-user.target
```

**Important:** Replace `/home/ubuntu/git-twitter-bot` with your actual path.

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable git-twitter-bot

# Start the service
sudo systemctl start git-twitter-bot

# Check status
sudo systemctl status git-twitter-bot

# View logs
sudo journalctl -u git-twitter-bot -f
```

**Useful commands:**
```bash
sudo systemctl start git-twitter-bot      # Start
sudo systemctl stop git-twitter-bot       # Stop
sudo systemctl restart git-twitter-bot    # Restart
sudo systemctl status git-twitter-bot     # Status
sudo journalctl -u git-twitter-bot -n 50  # Last 50 log lines
```

#### Step 4: Install and Configure Nginx

```bash
# Install Nginx
sudo apt-get install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/git-twitter-bot
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeouts for webhook processing
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable the site:

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/git-twitter-bot /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

#### Step 5: Set Up SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certbot will:
# - Obtain certificate
# - Configure Nginx automatically
# - Set up auto-renewal
```

**Auto-renewal is set up automatically.** Test renewal:

```bash
sudo certbot renew --dry-run
```

#### Step 6: Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

#### Step 7: Verify Setup

1. **Check service is running:**
   ```bash
   sudo systemctl status git-twitter-bot
   ```

2. **Check Nginx is running:**
   ```bash
   sudo systemctl status nginx
   ```

3. **Test endpoint:**
   ```bash
   curl http://localhost:3000
   # Should return: {"status":"ok","message":"Git→Twitter Bot is running"}
   
   curl http://your-domain.com
   # Should return the same
   ```

4. **Check logs:**
   ```bash
   # Bot logs
   sudo journalctl -u git-twitter-bot -f
   
   # Nginx logs
   sudo tail -f /var/log/nginx/access.log
   sudo tail -f /var/log/nginx/error.log
   ```

#### Step 8: Configure GitHub Webhook

Use your domain in GitHub webhook settings:
- **Payload URL:** `https://your-domain.com/webhook/github`
- **Content type:** `application/json`
- **Secret:** Your `WEBHOOK_SECRET` from `.env`
- **Events:** Just the push event

#### Troubleshooting

**Service won't start:**
```bash
# Check logs
sudo journalctl -u git-twitter-bot -n 50

# Common issues:
# - Wrong path in service file
# - Missing .env file
# - Port already in use
# - Permission issues
```

**Nginx 502 Bad Gateway:**
```bash
# Check if bot service is running
sudo systemctl status git-twitter-bot

# Check if port 3000 is listening
sudo netstat -tlnp | grep 3000

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

**Permission issues:**
```bash
# Ensure user has access to the directory
sudo chown -R ubuntu:ubuntu /home/ubuntu/git-twitter-bot

# Check file permissions
ls -la /home/ubuntu/git-twitter-bot
```

**Update bot code:**
```bash
cd /home/ubuntu/git-twitter-bot
git pull
npm install --production
sudo systemctl restart git-twitter-bot
```

### AWS EC2 t4g.micro

**Specs:** 2 vCPUs, 1 GB RAM - Perfect for this bot (~$7-8/month or free tier)

**Quick Setup:**

1. **Launch EC2 Instance:**
   - AMI: Amazon Linux 2023 (ARM64) or Ubuntu 22.04 LTS (ARM64)
   - Instance type: `t4g.micro`
   - Security Group: Allow SSH (22), HTTP (80), HTTPS (443)

2. **Connect and Install:**
   ```bash
   ssh -i your-key.pem ec2-user@your-instance-ip
   
   # Install Node.js 20.x
   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
   sudo yum install -y nodejs git
   
   # Clone repo
   git clone https://github.com/yourusername/git-twitter-bot.git
   cd git-twitter-bot
   npm install --production
   ```

3. **Configure:**
   ```bash
   cp .env.example .env
   nano .env  # Add your credentials
   ```

4. **Run with PM2:**
   ```bash
   sudo npm install -g pm2
   pm2 start src/server.js --name git-twitter-bot
   pm2 startup  # Follow instructions
   pm2 save
   ```

5. **Set Up Nginx (Optional):**
   ```bash
   sudo yum install -y nginx
   sudo nano /etc/nginx/conf.d/git-twitter-bot.conf
   ```
   
   Add:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
   
   ```bash
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

6. **SSL (Optional):**
   ```bash
   sudo yum install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

**Optimization for t4g.micro:**

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'git-twitter-bot',
    script: 'src/server.js',
    max_memory_restart: '400M',
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
```

Start: `pm2 start ecosystem.config.js`

**Expected Resource Usage:**
- RAM: ~50-300 MB
- CPU: Mostly idle, spikes during processing
- Disk: <100 MB

### Other Deployment Options

**Railway:**
1. Sign up at [railway.app](https://railway.app)
2. Create project → Deploy from GitHub
3. Add environment variables
4. Railway provides URL automatically

**Render:**
1. Sign up at [render.com](https://render.com)
2. Create Web Service → Connect GitHub repo
3. Add environment variables
4. Deploy

## Troubleshooting

### Webhook Not Receiving Events

- Check server is running: `curl https://your-server-url.com/`
- Verify webhook URL is HTTPS and accessible
- Check webhook secret matches exactly in `.env` and GitHub
- Check GitHub webhook delivery logs for errors

### Commits Not Being Tweeted

- Verify `ALLOWED_REPOS` includes your repository (if set)
- Check server logs for errors
- Verify Twitter API credentials are correct
- Check Gemini API key is valid (if using)

### Twitter API Errors

- Ensure all 4 credentials are set in `.env`
- Verify Twitter app has write permissions
- Check you're using API v2 keys

### Signature Verification Fails

- Ensure `WEBHOOK_SECRET` matches exactly
- No spaces around `=` in `.env`
- Secret should be at least 20 characters

## Project Structure

```
git-twitter-bot/
├── src/
│   ├── server.js              # Main Express server
│   ├── webhookHandler.js      # GitHub webhook processing
│   ├── commitFormatter.js     # Format commit data for tweets
│   ├── geminiClient.js        # Gemini AI for changelog generation
│   ├── twitterClient.js       # Twitter/X API wrapper
│   └── database.js            # Store tweet IDs for threading
├── config/
│   └── config.js              # Configuration loader
├── test-local.js              # Local component tests
├── test-webhook.js            # Webhook endpoint tests
├── test-gemini.js             # Gemini AI tests
├── .env.example               # Environment variables template
└── package.json               # Dependencies
```

## Security Best Practices

- ✅ Use HTTPS for webhook URLs (required by GitHub)
- ✅ Use strong webhook secret (at least 20 characters)
- ✅ Use `ALLOWED_REPOS` to restrict repositories
- ✅ Never commit `.env` file to git
- ✅ Keep system and dependencies updated

## License

MIT
