const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

/**
 * Middleware to identify user from various sources with fallback
 * Priority: X-User-Id > X-User-Email > JWT Token
 */
async function identifyUser(req, res, next) {
  try {
    let userId = null;
    
    // First priority: Direct user ID from header
    if (req.headers['x-user-id']) {
      userId = req.headers['x-user-id'];
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (user) {
        req.userId = userId;
        req.user = user;
        return next();
      }
    }
    
    // Second priority: Email-based identification
    const userEmail = req.headers['x-user-email'];
    if (userEmail) {
      // Try to find or create user by email
      let user = await prisma.user.findUnique({
        where: { email: userEmail }
      });
      
      if (!user) {
        // Create user if doesn't exist (sync fallback)
        const userName = req.headers['x-user-name'] || userEmail.split('@')[0];
        user = await prisma.user.create({
          data: {
            email: userEmail,
            name: userName,
            password: '', // No password for WordPress users
            isActive: true
          }
        });
        logger.info(`Created fallback user for email: ${userEmail}`);
      }
      
      req.userId = user.id;
      req.user = user;
      return next();
    }
    
    // Third priority: JWT token
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          req.userId = decoded.userId;
          
          // Verify user exists
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
          });
          
          if (user) {
            req.user = user;
            return next();
          }
        } catch (error) {
          // JWT verification failed, continue to error
        }
      }
    }
    
    // No valid user identification found
    return res.status(401).json({ 
      error: 'User identification required. Please provide X-User-Id, X-User-Email, or Authorization header.' 
    });
    
  } catch (error) {
    logger.error('User identification error:', error);
    return res.status(500).json({ 
      error: 'Failed to identify user',
      details: error.message 
    });
  }
}

module.exports = { identifyUser };