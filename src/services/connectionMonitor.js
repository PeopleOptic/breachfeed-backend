const logger = require('../utils/logger');
const { getPoolStats } = require('../utils/database');

let monitoringInterval;
let connectionAlerts = {
  highUsage: false,
  lastAlertTime: null
};

/**
 * Monitor database connections and alert on issues
 */
async function monitorConnections() {
  try {
    const stats = await getPoolStats();
    
    if (!stats) {
      logger.error('Unable to get database connection stats');
      return;
    }

    const { 
      total_connections, 
      active_connections, 
      idle_connections, 
      idle_in_transaction,
      longest_idle_minutes 
    } = stats;

    // Log current stats
    logger.info('Database connection stats:', {
      total: parseInt(total_connections),
      active: parseInt(active_connections),
      idle: parseInt(idle_connections),
      idleInTransaction: parseInt(idle_in_transaction),
      longestIdleMinutes: parseFloat(longest_idle_minutes) || 0
    });

    const connectionLimit = parseInt(process.env.DATABASE_CONNECTION_LIMIT) || 20;
    const usagePercent = (parseInt(total_connections) / connectionLimit) * 100;

    // Alert if connection usage is high
    if (usagePercent > 80 && !connectionAlerts.highUsage) {
      logger.warn(`High database connection usage: ${usagePercent.toFixed(1)}% (${total_connections}/${connectionLimit})`);
      connectionAlerts.highUsage = true;
      connectionAlerts.lastAlertTime = new Date();
    } else if (usagePercent < 70 && connectionAlerts.highUsage) {
      logger.info('Database connection usage returned to normal');
      connectionAlerts.highUsage = false;
    }

    // Alert on idle in transaction connections
    if (parseInt(idle_in_transaction) > 0) {
      logger.warn(`Found ${idle_in_transaction} connections idle in transaction - these should be closed`);
    }

    // Alert on very long idle connections
    if (parseFloat(longest_idle_minutes) > 5) {
      logger.warn(`Found connections idle for ${parseFloat(longest_idle_minutes).toFixed(1)} minutes`);
    }

  } catch (error) {
    logger.error('Connection monitoring error:', error);
  }
}

/**
 * Start connection monitoring
 */
function startConnectionMonitoring(intervalMinutes = 1) {
  if (monitoringInterval) {
    logger.warn('Connection monitoring already started');
    return;
  }

  // Run immediately
  monitorConnections();

  // Then run periodically
  monitoringInterval = setInterval(monitorConnections, intervalMinutes * 60 * 1000);
  
  logger.info(`Connection monitoring started (every ${intervalMinutes} minutes)`);
}

/**
 * Stop connection monitoring
 */
function stopConnectionMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('Connection monitoring stopped');
  }
}

module.exports = {
  startConnectionMonitoring,
  stopConnectionMonitoring,
  monitorConnections
};