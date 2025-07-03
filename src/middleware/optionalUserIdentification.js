const { getPrismaClient } = require('../utils/database');
const prisma = getPrismaClient();
const logger = require('../utils/logger');

/**
 * Optional middleware to identify user from various sources
 * Does NOT require user identification - continues without user if not found
 * Priority: X-User-Id > X-User-Email > JWT Token
 */
async function optionalIdentifyUser(req, res, next) {
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
          // JWT verification failed, continue without user
          logger.debug('JWT verification failed in optional user identification:', error.message);
        }
      }
    }
    
    // No user found - continue without user identification
    // This is the key difference from the required version
    req.userId = null;
    req.user = null;
    next();
    
  } catch (error) {
    logger.error('Optional user identification error:', error);
    // Continue without user identification
    req.userId = null;
    req.user = null;
    next();
  }
}

module.exports = { optionalIdentifyUser };