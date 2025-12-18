/**
 * Queue Service - Manages API request queuing with rate limiting and retry logic
 * Designed for multi-user commercial deployment
 */

const config = require('../config/config');

// Queue states
const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying'
};

// Priority levels for queue items
const PRIORITY = {
  HIGH: 1,
  NORMAL: 2,
  LOW: 3
};

class QueueService {
  constructor(options = {}) {
    // Queue configuration
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || config.queue?.maxRequestsPerMinute || 15;
    this.maxRetries = options.maxRetries || config.queue?.maxRetries || 3;
    this.baseRetryDelayMs = options.baseRetryDelayMs || config.queue?.baseRetryDelayMs || 2000;
    this.maxRetryDelayMs = options.maxRetryDelayMs || config.queue?.maxRetryDelayMs || 60000;
    this.processingIntervalMs = options.processingIntervalMs || 1000;
    
    // Queue storage (in-memory - use Redis for production scaling)
    this.queue = [];
    this.processing = new Map(); // Currently processing items
    this.completed = new Map(); // Recently completed (for deduplication)
    this.requestTimestamps = []; // Track request times for rate limiting
    
    // Statistics
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      totalRetries: 0,
      currentQueueLength: 0,
      avgProcessingTimeMs: 0
    };
    
    // Processing state
    this.isRunning = false;
    this.processingInterval = null;
    
    // User quotas (userId -> { count, resetTime })
    this.userQuotas = new Map();
    this.userQuotaLimit = options.userQuotaLimit || 100; // Per hour
    
    console.log(`📋 Queue service initialized (rate: ${this.maxRequestsPerMinute} req/min, retries: ${this.maxRetries})`);
  }

  /**
   * Start the queue processor
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.processingInterval = setInterval(() => this.processQueue(), this.processingIntervalMs);
    console.log('🚀 Queue processor started');
  }

  /**
   * Stop the queue processor
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log('⏹️  Queue processor stopped');
  }

  /**
   * Add an item to the queue
   * @param {object} options - Queue item options
   * @returns {Promise} - Resolves when the item is processed
   */
  enqueue(options) {
    const {
      id = this.generateId(),
      userId,
      task,
      data,
      priority = PRIORITY.NORMAL,
      onComplete,
      onError
    } = options;

    // Check user quota
    if (userId && !this.checkUserQuota(userId)) {
      const error = new Error('User rate limit exceeded. Please try again later.');
      error.code = 'USER_RATE_LIMIT';
      if (onError) onError(error);
      return Promise.reject(error);
    }

    // Check for duplicate (same id already in queue or processing)
    if (this.queue.some(item => item.id === id) || this.processing.has(id)) {
      console.log(`⚠️  Duplicate queue item ignored: ${id}`);
      return Promise.resolve({ duplicate: true, id });
    }

    return new Promise((resolve, reject) => {
      const queueItem = {
        id,
        userId,
        task,
        data,
        priority,
        status: QUEUE_STATUS.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        resolve: (result) => {
          if (onComplete) onComplete(result);
          resolve(result);
        },
        reject: (error) => {
          if (onError) onError(error);
          reject(error);
        }
      };

      // Insert based on priority
      const insertIndex = this.queue.findIndex(item => item.priority > priority);
      if (insertIndex === -1) {
        this.queue.push(queueItem);
      } else {
        this.queue.splice(insertIndex, 0, queueItem);
      }

      this.stats.currentQueueLength = this.queue.length;
      console.log(`📥 Queued: ${id} (priority: ${priority}, queue size: ${this.queue.length})`);

      // Increment user quota
      if (userId) {
        this.incrementUserQuota(userId);
      }
    });
  }

  /**
   * Process items in the queue
   */
  async processQueue() {
    if (!this.isRunning || this.queue.length === 0) return;
    
    // Clean old request timestamps (older than 1 minute)
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    
    // Check rate limit
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      return; // Rate limited, wait for next cycle
    }

    // Get next item to process
    const item = this.queue.shift();
    if (!item) return;

    this.processing.set(item.id, item);
    item.status = QUEUE_STATUS.PROCESSING;
    this.stats.currentQueueLength = this.queue.length;

    const startTime = Date.now();

    try {
      // Record request timestamp
      this.requestTimestamps.push(Date.now());
      
      // Execute the task
      const result = await item.task(item.data);
      
      // Success
      const processingTime = Date.now() - startTime;
      this.updateAvgProcessingTime(processingTime);
      
      item.status = QUEUE_STATUS.COMPLETED;
      this.completed.set(item.id, { completedAt: Date.now(), result });
      this.processing.delete(item.id);
      this.stats.totalProcessed++;
      
      console.log(`✅ Processed: ${item.id} (${processingTime}ms)`);
      item.resolve(result);
      
      // Cleanup old completed items (keep last 1000)
      if (this.completed.size > 1000) {
        const oldestKey = this.completed.keys().next().value;
        this.completed.delete(oldestKey);
      }
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Check if error is rate limit related
      const isRateLimitError = this.isRateLimitError(error);
      
      if (item.retryCount < this.maxRetries) {
        // Retry with exponential backoff
        item.retryCount++;
        item.status = QUEUE_STATUS.RETRYING;
        this.stats.totalRetries++;
        
        const delay = this.calculateRetryDelay(item.retryCount, isRateLimitError);
        console.log(`🔄 Retry ${item.retryCount}/${this.maxRetries} for ${item.id} in ${delay}ms (${error.message})`);
        
        this.processing.delete(item.id);
        
        // Re-queue after delay
        setTimeout(() => {
          if (this.isRunning) {
            // Add to front of queue for retry
            this.queue.unshift(item);
            this.stats.currentQueueLength = this.queue.length;
          }
        }, delay);
        
      } else {
        // Max retries exceeded
        item.status = QUEUE_STATUS.FAILED;
        this.processing.delete(item.id);
        this.stats.totalFailed++;
        
        console.log(`❌ Failed after ${this.maxRetries} retries: ${item.id} (${error.message})`);
        item.reject(error);
      }
    }
  }

  /**
   * Check if error is a rate limit error
   */
  isRateLimitError(error) {
    const message = error.message?.toLowerCase() || '';
    const rateLimitIndicators = [
      'rate limit',
      'too many requests',
      '429',
      'quota exceeded',
      'resource exhausted'
    ];
    return rateLimitIndicators.some(indicator => message.includes(indicator));
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(retryCount, isRateLimitError) {
    // Base delay with exponential backoff
    let delay = this.baseRetryDelayMs * Math.pow(2, retryCount - 1);
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    delay += jitter;
    
    // For rate limit errors, use longer delays
    if (isRateLimitError) {
      delay = Math.max(delay, 30000); // Minimum 30s for rate limits
    }
    
    // Cap at max delay
    return Math.min(delay, this.maxRetryDelayMs);
  }

  /**
   * Check if user is within quota
   */
  checkUserQuota(userId) {
    const quota = this.userQuotas.get(userId);
    if (!quota) return true;
    
    // Reset if hour has passed
    if (Date.now() > quota.resetTime) {
      this.userQuotas.delete(userId);
      return true;
    }
    
    return quota.count < this.userQuotaLimit;
  }

  /**
   * Increment user's quota count
   */
  incrementUserQuota(userId) {
    const now = Date.now();
    const quota = this.userQuotas.get(userId);
    
    if (!quota || now > quota.resetTime) {
      this.userQuotas.set(userId, {
        count: 1,
        resetTime: now + 3600000 // 1 hour
      });
    } else {
      quota.count++;
    }
  }

  /**
   * Update average processing time
   */
  updateAvgProcessingTime(newTime) {
    const total = this.stats.avgProcessingTimeMs * (this.stats.totalProcessed - 1) + newTime;
    this.stats.avgProcessingTimeMs = total / this.stats.totalProcessed;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueLength: this.queue.length,
      processingCount: this.processing.size,
      requestsInLastMinute: this.requestTimestamps.length,
      rateLimitRemaining: Math.max(0, this.maxRequestsPerMinute - this.requestTimestamps.length)
    };
  }

  /**
   * Get user's remaining quota
   */
  getUserQuotaRemaining(userId) {
    const quota = this.userQuotas.get(userId);
    if (!quota || Date.now() > quota.resetTime) {
      return this.userQuotaLimit;
    }
    return Math.max(0, this.userQuotaLimit - quota.count);
  }

  /**
   * Clear completed items
   */
  clearCompleted() {
    this.completed.clear();
  }

  /**
   * Get queue position for an item
   */
  getQueuePosition(id) {
    const index = this.queue.findIndex(item => item.id === id);
    if (index !== -1) return index + 1;
    if (this.processing.has(id)) return 0; // Currently processing
    return -1; // Not found
  }
}

// Singleton instance
let instance = null;

function getQueueService(options = {}) {
  if (!instance) {
    instance = new QueueService(options);
    instance.start();
  }
  return instance;
}

module.exports = {
  QueueService,
  getQueueService,
  QUEUE_STATUS,
  PRIORITY
};
