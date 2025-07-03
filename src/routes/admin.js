const express = require('express');
const { authenticateApiKey } = require('../middleware/auth');
const { getPoolStats } = require('../utils/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get database pool statistics
router.get('/pool-stats', authenticateApiKey, async (req, res, next) => {
  try {
    const stats = await getPoolStats();
    
    if (!stats) {
      return res.status(500).json({ error: 'Unable to get pool statistics' });
    }

    const connectionLimit = parseInt(process.env.DATABASE_CONNECTION_LIMIT) || 20;
    const usagePercent = (parseInt(stats.total_connections) / connectionLimit) * 100;

    res.json({
      pool: {
        limit: connectionLimit,
        total: parseInt(stats.total_connections),
        active: parseInt(stats.active_connections),
        idle: parseInt(stats.idle_connections),
        idleInTransaction: parseInt(stats.idle_in_transaction),
        usagePercent: usagePercent.toFixed(1),
        longestIdleMinutes: stats.longest_idle_time?.minutes || 0
      },
      status: usagePercent > 80 ? 'warning' : 'healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting pool stats:', error);
    next(error);
  }
});

module.exports = router;