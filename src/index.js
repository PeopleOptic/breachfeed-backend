require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getPrismaClient, checkDatabaseHealth, disconnectDatabase } = require('./utils/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { startCronJobs } = require('./services/cronService');
const { initializeQueue } = require('./services/queueService');
const { startConnectionMonitoring } = require('./services/connectionMonitor');

// Route imports
const feedRoutes = require('./routes/feeds');
const articleRoutes = require('./routes/articles');
const subscriptionRoutes = require('./routes/subscriptions');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const webhookRoutes = require('./routes/webhooks');
const companyRoutes = require('./routes/companies');
const dashboardRoutes = require('./routes/dashboard');
const testRoutes = require('./routes/test');
const exclusionKeywordRoutes = require('./routes/exclusionKeywords');
const adminRoutes = require('./routes/admin');

const app = express();
const prisma = getPrismaClient();

// Trust proxy for accurate client IP detection (required for Railway)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.WORDPRESS_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check with database status
app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  res.json({ 
    status: dbHealth.healthy ? 'ok' : 'degraded',
    database: dbHealth,
    timestamp: new Date().toISOString() 
  });
});

// Routes
app.use('/api/test', testRoutes);
app.use('/api/feeds', feedRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/exclusion-keywords', exclusionKeywordRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    const dbHealth = await checkDatabaseHealth();
    if (!dbHealth.healthy) {
      throw new Error(`Database connection failed: ${dbHealth.error}`);
    }
    logger.info('Database connected');

    // Start connection monitoring
    startConnectionMonitoring(1); // Monitor every 1 minute
    logger.info('Connection monitoring started');

    // Initialize job queue
    try {
      await initializeQueue();
      logger.info('Job queue initialized');
    } catch (queueError) {
      logger.warn('Job queue initialization failed, continuing without queue:', queueError.message);
    }

    // Start cron jobs
    await startCronJobs();
    logger.info('Cron jobs started');

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} signal received: starting graceful shutdown`);
      
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close database connections
      await disconnectDatabase();
      
      // Exit
      process.exit(0);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();