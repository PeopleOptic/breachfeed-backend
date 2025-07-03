const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error('Error:', err);
  logger.error('Error details:', {
    message: err.message,
    code: err.code,
    meta: err.meta,
    path: req.path,
    method: req.method
  });
  
  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(400).json({ error: 'Duplicate entry' });
  }
  
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  
  // Foreign key constraint error
  if (err.code === 'P2003') {
    logger.error('Foreign key error:', err.meta);
    return res.status(400).json({ 
      error: 'Invalid reference: The entity you are trying to subscribe to does not exist',
      details: err.meta?.field_name || 'Unknown field'
    });
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }
  
  // Default error
  const errorResponse = {
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  };
  
  // Add more details in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.details = {
      message: err.message,
      code: err.code,
      stack: err.stack
    };
  }
  
  res.status(500).json(errorResponse);
}

module.exports = errorHandler;