const cron = require('node-cron');
const logger = require('../utils/logger');
const { fetchAllActiveFeeds } = require('./rssService');
const { cleanupOldNotifications } = require('./cleanupService');

async function startCronJobs() {
  // Fetch RSS feeds every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.info('Starting scheduled RSS feed fetch');
    await fetchAllActiveFeeds();
  });
  
  // Cleanup old notifications daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Starting scheduled cleanup');
    await cleanupOldNotifications();
  });
  
  logger.info('Cron jobs scheduled successfully');
}

module.exports = {
  startCronJobs
};