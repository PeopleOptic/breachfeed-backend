require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { startCronJobs } = require('./services/cronService');
const { initializeQueue } = require('./services/queueService');

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

const app = express();
const prisma = new PrismaClient();

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize services
    await prisma.$connect();
    logger.info('Database connected');

    try {
      await initializeQueue();
      logger.info('Job queue initialized');
    } catch (queueError) {
      logger.warn('Job queue initialization failed, continuing without queue:', queueError.message);
    }

    await startCronJobs();
    logger.info('Cron jobs started');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();