/**
 * Queue Service - Manages API request queuing with rate limiting and retry logic
 * Designed for multi-user commercial deployment
 * 
 * Features:
 * - Persistent queue storage in SQLite (survives server restarts)
 * - Task type registry for reconstructing tasks on restart
 * - Rate limiting and exponential backoff
 * - Priority-based processing
 */

const config = require('../config/config');
const database = require('./database');

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

// Task type registry - maps task types to their factory functions
// This allows us to reconstruct tasks from persisted data
const taskRegistry = new Map();

/**
 * Register a task type for persistence support
 * @param {string} taskType - Unique identifier for the task type
 * @param {function} taskFactory - Function that takes (data) and returns the task function
 */
function registerTaskType(taskType, taskFactory) {
  taskRegistry.set(taskType, taskFactory);
  console.log(`📝 Registered task type: ${taskType}`);
}

class QueueService {
  constructor(options = {}) {
    // Queue configuration
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || config.queue?.maxRequestsPerMinute || 15;
    this.maxRetries = options.maxRetries || config.queue?.maxRetries || 3;
    this.baseRetryDelayMs = options.baseRetryDelayMs || config.queue?.baseRetryDelayMs || 2000;
    this.maxRetryDelayMs = options.maxRetryDelayMs || config.queue?.maxRetryDelayMs || 60000;
    this.processingIntervalMs = options.processingIntervalMs || 1000;
    
    // Queue storage (in-memory working queue, backed by database)
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
      avgProcessingTimeMs: 0,
      restoredFromDb: 0
    };
    
    // Processing state
    this.isRunning = false;
    this.processingInterval = null;
    
    // User quotas (userId -> { count, resetTime })
    this.userQuotas = new Map();
    this.userQuotaLimit = options.userQuotaLimit || 100; // Per hour
    
    // Persistence enabled flag
    this.persistenceEnabled = true;
    
    console.log(`📋 Queue service initialized (rate: ${this.maxRequestsPerMinute} req/min, retries: ${this.maxRetries}, persistence: enabled)`);
  }

  /**
   * Start the queue processor
   * Restores pending items from database on startup
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Restore pending items from database
    this.restoreFromDatabase();
    
    // Clean up old items periodically (every hour)
    this.cleanupInterval = setInterval(() => {
      database.cleanupOldQueueItems();
    }, 60 * 60 * 1000);
    
    this.processingInterval = setInterval(() => this.processQueue(), this.processingIntervalMs);
    console.log('🚀 Queue processor started');
  }

  /**
   * Stop the queue processor gracefully
   * Persists current state before stopping
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Items in the queue are already persisted, so we just need to log
    const pendingCount = this.queue.length + this.processing.size;
    if (pendingCount > 0) {
      console.log(`💾 Queue stopped with ${pendingCount} pending items (will resume on restart)`);
    }
    
    console.log('⏹️  Queue processor stopped');
  }

  /**
   * Restore pending queue items from database
   * Called on startup to resume processing
   */
  restoreFromDatabase() {
    try {
      // Reset any items that were "processing" when server stopped
      database.resetProcessingQueueItems();
      
      // Get all pending/retrying items
      const pendingItems = database.getPendingQueueItems();
      
      if (pendingItems.length === 0) {
        console.log('📋 No pending queue items to restore');
        return;
      }
      
      console.log(`🔄 Restoring ${pendingItems.length} pending queue items from database...`);
      
      let restored = 0;
      for (const item of pendingItems) {
        // Check if we have a task factory for this task type
        const taskFactory = taskRegistry.get(item.taskType);
        
        if (!taskFactory) {
          console.warn(`⚠️  Unknown task type: ${item.taskType}, marking as failed`);
          database.updateQueueItemStatus(item.id, QUEUE_STATUS.FAILED, 'Unknown task type after restart');
          continue;
        }
        
        try {
          // Reconstruct the task function
          const task = taskFactory(item.data);
          
          // Add to in-memory queue (don't re-persist, already in DB)
          const queueItem = {
            id: item.id,
            userId: item.userId,
            taskType: item.taskType,
            task,
            data: item.data,
            priority: item.priority,
            status: QUEUE_STATUS.PENDING,
            retryCount: item.retryCount,
            createdAt: item.createdAt,
            // These will be set when promise is created on actual processing
            resolve: null,
            reject: null,
            restored: true // Flag to indicate this was restored
          };
          
          // Insert based on priority
          const insertIndex = this.queue.findIndex(i => i.priority > item.priority);
          if (insertIndex === -1) {
            this.queue.push(queueItem);
          } else {
            this.queue.splice(insertIndex, 0, queueItem);
          }
          
          restored++;
        } catch (err) {
          console.error(`❌ Failed to restore queue item ${item.id}:`, err.message);
          database.updateQueueItemStatus(item.id, QUEUE_STATUS.FAILED, `Restore failed: ${err.message}`);
        }
      }
      
      this.stats.restoredFromDb = restored;
      this.stats.currentQueueLength = this.queue.length;
      console.log(`✅ Restored ${restored} queue items`);
      
    } catch (error) {
      console.error('❌ Failed to restore queue from database:', error.message);
    }
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
      taskType, // Required for persistence - identifies how to reconstruct the task
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
        taskType: taskType || 'unknown',
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

      // Persist to database for durability
      if (this.persistenceEnabled && taskType) {
        database.saveQueueItem({
          id,
          taskType,
          userId,
          data,
          priority,
          status: QUEUE_STATUS.PENDING,
          retryCount: 0
        });
      }

      // Insert based on priority
      const insertIndex = this.queue.findIndex(item => item.priority > priority);
      if (insertIndex === -1) {
        this.queue.push(queueItem);
      } else {
        this.queue.splice(insertIndex, 0, queueItem);
      }

      this.stats.currentQueueLength = this.queue.length;
      console.log(`📥 Queued: ${id} (type: ${taskType}, priority: ${priority}, queue size: ${this.queue.length})`);

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
    
    // Update database status
    if (this.persistenceEnabled) {
      database.updateQueueItemStatus(item.id, QUEUE_STATUS.PROCESSING);
    }

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
      
      // Remove from database (completed successfully)
      if (this.persistenceEnabled) {
        database.deleteQueueItem(item.id);
      }
      
      console.log(`✅ Processed: ${item.id} (${processingTime}ms)`);
      
      // For restored items, resolve may not be set
      if (item.resolve) {
        item.resolve(result);
      }
      
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
        
        // Update database with retry status
        if (this.persistenceEnabled) {
          database.incrementQueueItemRetry(item.id);
        }
        
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
        
        // Update database with failure
        if (this.persistenceEnabled) {
          database.updateQueueItemStatus(item.id, QUEUE_STATUS.FAILED, error.message);
        }
        
        console.log(`❌ Failed after ${this.maxRetries} retries: ${item.id} (${error.message})`);
        
        // For restored items, reject may not be set
        if (item.reject) {
          item.reject(error);
        }
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

/**
 * Graceful shutdown - stop queue and persist state
 */
function shutdownQueueService() {
  if (instance) {
    instance.stop();
    console.log('📋 Queue service shutdown complete');
  }
}

module.exports = {
  QueueService,
  getQueueService,
  shutdownQueueService,
  registerTaskType,
  QUEUE_STATUS,
  PRIORITY
};
