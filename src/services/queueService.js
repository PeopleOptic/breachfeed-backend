const Queue = require('bull');
const logger = require('../utils/logger');

let notificationQueue;

// Create a dummy queue that doesn't require Redis
function createDummyQueue() {
  return {
    process: () => {},
    on: () => {},
    add: async (name, data, options) => {
      logger.info(`Dummy queue: Would add ${name} job`, { data, options });
      return { id: 'dummy-' + Date.now() };
    },
    close: async () => {},
    isPaused: async () => false,
    pause: async () => {},
    resume: async () => {},
    count: async () => 0,
    empty: async () => {},
    clean: async () => {},
    obliterate: async () => {}
  };
}

async function initializeQueue() {
  // Check if Redis is configured
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl || redisUrl.trim() === '' || redisUrl === 'redis://localhost:6379') {
    logger.warn('Redis not configured, using dummy queue');
    notificationQueue = createDummyQueue();
    return notificationQueue;
  }
  
  try {
    const redisOptions = {
      redis: {}
    };
    
    // Parse Redis URL to extract password if present
    if (redisUrl.includes('@')) {
      try {
        const url = new URL(redisUrl);
        if (url.password) {
          redisOptions.redis.password = url.password;
        }
      } catch (e) {
        logger.warn('Failed to parse Redis URL:', e.message);
      }
    }
    
    // Add password from environment if available
    if (process.env.REDIS_PASSWORD) {
      redisOptions.redis.password = process.env.REDIS_PASSWORD;
    }
    
    notificationQueue = new Queue('notifications', redisUrl, redisOptions);
    
    // Test the connection
    await notificationQueue.isReady();
    
    // Import notification handlers
    const {
      sendEmailNotification,
      sendSmsNotification,
      sendPushNotification
    } = require('./notificationService');
    
    // Process email notifications
    notificationQueue.process('email', 5, async (job) => {
      logger.info(`Processing email notification job ${job.id}`);
      await sendEmailNotification(job);
    });
    
    // Process SMS notifications
    notificationQueue.process('sms', 3, async (job) => {
      logger.info(`Processing SMS notification job ${job.id}`);
      await sendSmsNotification(job);
    });
    
    // Process push notifications
    notificationQueue.process('push', 5, async (job) => {
      logger.info(`Processing push notification job ${job.id}`);
      await sendPushNotification(job);
    });
    
    // Queue event handlers
    notificationQueue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed`);
    });
    
    notificationQueue.on('failed', (job, err) => {
      logger.error(`Job ${job.id} failed:`, err);
    });
    
    notificationQueue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled`);
    });
    
    notificationQueue.on('error', (error) => {
      logger.error('Queue error:', error);
    });
    
    logger.info('Redis notification queue initialized successfully');
    
  } catch (error) {
    logger.error('Failed to initialize Redis queue, falling back to dummy queue:', error.message);
    notificationQueue = createDummyQueue();
  }
  
  return notificationQueue;
}

module.exports = {
  initializeQueue,
  get notificationQueue() {
    return notificationQueue;
  }
};