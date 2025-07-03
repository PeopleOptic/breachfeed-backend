const express = require('express');
const { getPrismaClient } = require('../utils/database');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateJWT } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = getPrismaClient();

// Check JWT configuration on startup
if (!process.env.JWT_EXPIRES_IN) {
  logger.warn('JWT_EXPIRES_IN not set in environment, defaulting to 7d');
}

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().optional(),
  phoneNumber: Joi.string().optional(),
  apnsDeviceToken: Joi.string().optional()
});

const updateUserSchema = Joi.object({
  name: Joi.string().optional(),
  phoneNumber: Joi.string().optional(),
  apnsDeviceToken: Joi.string().optional(),
  isActive: Joi.boolean().optional()
});

// Register new user (called from WordPress)
router.post('/register', validateRequest(registerSchema), async (req, res, next) => {
  try {
    const { email, name, phoneNumber, apnsDeviceToken } = req.body;
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      // Update existing user if needed
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          name: name || existingUser.name,
          phoneNumber: phoneNumber || existingUser.phoneNumber,
          apnsDeviceToken: apnsDeviceToken || existingUser.apnsDeviceToken
        }
      });
      
      const token = jwt.sign(
        { userId: updatedUser.id, email: updatedUser.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      return res.json({ user: updatedUser, token });
    }
    
    // Create new user
    const user = await prisma.user.create({
      data: { email, name, phoneNumber, apnsDeviceToken }
    });
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.status(201).json({ user, token });
  } catch (error) {
    next(error);
  }
});

// Get user profile
router.get('/profile', authenticateJWT, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        subscriptions: {
          include: {
            company: true,
            keyword: true
          }
        },
        _count: {
          select: {
            notifications: true
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch('/profile', authenticateJWT, validateRequest(updateUserSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: req.body
    });
    
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

// Delete user account
router.delete('/profile', authenticateJWT, async (req, res, next) => {
  try {
    // Delete all user data (cascade delete should handle related records)
    await prisma.user.delete({
      where: { id: req.userId }
    });
    
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

// Update device token for push notifications
router.post('/device-token', authenticateJWT, async (req, res, next) => {
  try {
    const { apnsDeviceToken } = req.body;
    
    if (!apnsDeviceToken) {
      return res.status(400).json({ error: 'Device token required' });
    }
    
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { apnsDeviceToken }
    });
    
    res.json({ message: 'Device token updated' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;