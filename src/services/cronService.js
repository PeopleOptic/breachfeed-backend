const cron = require('node-cron');
const logger = require('../utils/logger');
const { fetchAllActiveFeeds, fetchRegulationFeeds } = require('./rssService');
const { cleanupOldNotifications } = require('./cleanupService');

async function startCronJobs() {
  // Fetch RSS feeds every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    logger.info('Starting scheduled RSS feed fetch');
    await fetchAllActiveFeeds();
  });
  
  // Fetch regulation-specific RSS feeds every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Starting scheduled regulation RSS feed fetch');
    await fetchRegulationFeeds();
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