const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// API Key authentication for WordPress plugin
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  if (apiKey !== process.env.WORDPRESS_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// JWT authentication for user-specific endpoints
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    logger.error('JWT verification failed:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  authenticateApiKey,
  authenticateJWT
};