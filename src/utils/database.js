const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

let prisma;

/**
 * Database connection configuration with connection pooling
 */
const connectionLimit = parseInt(process.env.DATABASE_CONNECTION_LIMIT) || 10;

// Add connection pool parameters to the connection URL
function getPooledConnectionUrl() {
  const baseUrl = process.env.DATABASE_URL;
  const url = new URL(baseUrl);
  
  // Add connection pooling parameters
  url.searchParams.set('connection_limit', connectionLimit.toString());
  url.searchParams.set('pool_timeout', '30');
  
  return url.toString();
}

const databaseConfig = {
  datasources: {
    db: {
      url: getPooledConnectionUrl()
    }
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
};

/**
 * Create a singleton PrismaClient instance with connection pooling
 */
function createPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient(databaseConfig);

    // Log connection pool events
    prisma.$on('query', (e) => {
      if (e.duration > 1000) {
        logger.warn(`Slow query detected (${e.duration}ms): ${e.query}`);
      }
    });

    prisma.$on('error', (e) => {
      logger.error('Database error:', e);
    });

    prisma.$on('warn', (e) => {
      logger.warn('Database warning:', e);
    });

    // Middleware to log connection usage
    prisma.$use(async (params, next) => {
      const before = Date.now();
      const result = await next(params);
      const after = Date.now();
      
      if (after - before > 1000) {
        logger.warn(`Slow database operation: ${params.model}.${params.action} took ${after - before}ms`);
      }
      
      return result;
    });

    logger.info('Database connection pool initialized with limit:', connectionLimit);
  }

  return prisma;
}

/**
 * Get the PrismaClient instance
 */
function getPrismaClient() {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

/**
 * Disconnect from the database
 */
async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Check database connection health
 */
async function checkDatabaseHealth() {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return { healthy: true };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return { healthy: false, error: error.message };
  }
}

/**
 * Get connection pool statistics
 */
async function getPoolStats() {
  try {
    const client = getPrismaClient();
    
    // Get connection stats from PostgreSQL
    const stats = await client.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
        EXTRACT(EPOCH FROM max(now() - state_change))/60 as longest_idle_minutes
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    return stats[0];
  } catch (error) {
    logger.error('Failed to get pool stats:', error);
    return null;
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

module.exports = {
  getPrismaClient,
  disconnectDatabase,
  checkDatabaseHealth,
  getPoolStats
};