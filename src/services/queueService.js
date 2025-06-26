const Queue = require('bull');
const logger = require('../utils/logger');

let notificationQueue;

async function initializeQueue() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  notificationQueue = new Queue('notifications', redisUrl);
  
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
  
  return notificationQueue;
}

module.exports = {
  initializeQueue,
  notificationQueue
};