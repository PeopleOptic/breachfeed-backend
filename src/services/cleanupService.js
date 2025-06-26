const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

async function cleanupOldNotifications() {
  try {
    // Delete notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });
    
    logger.info(`Cleaned up ${result.count} old notifications`);
  } catch (error) {
    logger.error('Error cleaning up notifications:', error);
  }
}

async function cleanupOldArticles() {
  try {
    // Delete articles older than 90 days with no matches
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const articlesToDelete = await prisma.article.findMany({
      where: {
        createdAt: {
          lt: ninetyDaysAgo
        },
        matchedKeywords: {
          none: {}
        }
      },
      select: { id: true }
    });
    
    if (articlesToDelete.length > 0) {
      const result = await prisma.article.deleteMany({
        where: {
          id: {
            in: articlesToDelete.map(a => a.id)
          }
        }
      });
      
      logger.info(`Cleaned up ${result.count} old articles without matches`);
    }
  } catch (error) {
    logger.error('Error cleaning up articles:', error);
  }
}

module.exports = {
  cleanupOldNotifications,
  cleanupOldArticles
};