const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const { authenticateJWT, authenticateApiKey } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const createSubscriptionSchema = Joi.object({
  type: Joi.string().valid('COMPANY', 'KEYWORD', 'AGENCY', 'LOCATION').required(),
  targetId: Joi.string().required(),
  emailEnabled: Joi.boolean().default(true),
  smsEnabled: Joi.boolean().default(false),
  pushEnabled: Joi.boolean().default(false),
  severityFilter: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  locationFilter: Joi.string().optional(),
  keywordFilters: Joi.array().items(Joi.string()).optional(),
  alertTypeFilter: Joi.array().items(
    Joi.string().valid('CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION')
  ).optional()
});

const quickSubscribeSchema = Joi.object({
  entityType: Joi.string().valid('COMPANY', 'KEYWORD', 'AGENCY', 'LOCATION').required(),
  entityId: Joi.string().required(),
  entityName: Joi.string().required()
});

const updateSubscriptionSchema = Joi.object({
  emailEnabled: Joi.boolean().optional(),
  smsEnabled: Joi.boolean().optional(),
  pushEnabled: Joi.boolean().optional(),
  isActive: Joi.boolean().optional()
});

// Get user's subscriptions
router.get('/', authenticateJWT, async (req, res, next) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: req.userId },
      include: {
        company: true,
        keyword: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(subscriptions);
  } catch (error) {
    next(error);
  }
});

// Create subscription
router.post('/', authenticateJWT, validateRequest(createSubscriptionSchema), async (req, res, next) => {
  try {
    const { type, targetId, emailEnabled, smsEnabled, pushEnabled } = req.body;
    
    // Verify target exists
    if (type === 'COMPANY') {
      const company = await prisma.company.findUnique({
        where: { id: targetId }
      });
      if (!company) {
        return res.status(400).json({ error: 'Company not found' });
      }
    } else if (type === 'KEYWORD') {
      const keyword = await prisma.keyword.findUnique({
        where: { id: targetId }
      });
      if (!keyword) {
        return res.status(400).json({ error: 'Keyword not found' });
      }
    }
    
    // Create or update subscription
    const subscription = await prisma.subscription.upsert({
      where: {
        userId_type_targetId: {
          userId: req.userId,
          type,
          targetId
        }
      },
      update: {
        emailEnabled,
        smsEnabled,
        pushEnabled,
        isActive: true
      },
      create: {
        userId: req.userId,
        type,
        targetId,
        emailEnabled,
        smsEnabled,
        pushEnabled
      },
      include: {
        company: true,
        keyword: true
      }
    });
    
    res.status(201).json(subscription);
  } catch (error) {
    next(error);
  }
});

// Quick subscribe endpoint for article detail pages
router.post('/quick', authenticateApiKey, validateRequest(quickSubscribeSchema), async (req, res, next) => {
  try {
    const { entityType, entityId, entityName } = req.body;
    const userIdHeader = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    
    // Try to find user by WordPress user ID first (for backward compatibility)
    let user = null;
    let userId = null;
    
    if (userIdHeader) {
      // First try as a backend user ID
      user = await prisma.user.findUnique({
        where: { id: userIdHeader }
      });
      
      if (user) {
        userId = user.id;
      }
    }
    
    // If not found by ID, try by email
    if (!user && userEmail) {
      user = await prisma.user.findUnique({
        where: { email: userEmail }
      });
      
      if (user) {
        userId = user.id;
      } else {
        // Auto-create user if they don't exist
        const newUser = await prisma.user.create({
          data: {
            email: userEmail,
            name: req.headers['x-user-name'] || userEmail.split('@')[0]
          }
        });
        user = newUser;
        userId = newUser.id;
      }
    }
    
    if (!user || !userId) {
      return res.status(401).json({ error: 'User authentication required. Please provide user email.' });
    }
    
    // Check if subscription already exists
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        userId_type_targetId: {
          userId,
          type: entityType,
          targetId: entityId
        }
      }
    });
    
    if (existingSubscription) {
      if (!existingSubscription.isActive) {
        // Reactivate existing subscription
        const updated = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: { isActive: true }
        });
        return res.json({ message: 'Subscription reactivated', subscription: updated });
      }
      return res.status(409).json({ 
        error: 'Subscription already exists',
        subscriptionId: existingSubscription.id 
      });
    }
    
    // Create subscription with smart defaults
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        type: entityType,
        targetId: entityId,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: false,
        isActive: true,
        alertTypeFilter: ['CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION']
      },
      include: {
        company: entityType === 'COMPANY',
        keyword: entityType === 'KEYWORD',
        agency: entityType === 'AGENCY',
        location: entityType === 'LOCATION'
      }
    });
    
    res.status(201).json({
      message: `Subscribed to ${entityName}`,
      subscription
    });
  } catch (error) {
    console.error('Quick subscribe error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Subscription already exists',
        subscriptionId: existingSubscription?.id 
      });
    }
    next(error);
  }
});

// Update subscription
router.patch('/:id', authenticateJWT, validateRequest(updateSubscriptionSchema), async (req, res, next) => {
  try {
    // Verify ownership
    const existing = await prisma.subscription.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    const subscription = await prisma.subscription.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        company: true,
        keyword: true
      }
    });
    
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

// Delete subscription - supports both JWT and API key authentication
router.delete('/:id', async (req, res, next) => {
  try {
    let userId = null;
    
    // Check if JWT authentication is present
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (err) {
        // JWT invalid, try API key method
      }
    }
    
    // If no JWT, check for API key + email authentication
    if (!userId && req.headers['x-api-key'] && req.headers['x-user-email']) {
      // Verify API key
      if (req.headers['x-api-key'] === process.env.WORDPRESS_API_KEY) {
        const user = await prisma.user.findUnique({
          where: { email: req.headers['x-user-email'] }
        });
        
        if (user) {
          userId = user.id;
        }
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify ownership
    const existing = await prisma.subscription.findFirst({
      where: {
        id: req.params.id,
        userId: userId
      }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    
    await prisma.subscription.delete({
      where: { id: req.params.id }
    });
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Manage companies
router.get('/companies', authenticateApiKey, async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    
    res.json(companies);
  } catch (error) {
    next(error);
  }
});

router.post('/companies', authenticateApiKey, async (req, res, next) => {
  try {
    const { name, aliases = [], domain } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Company name required' });
    }
    
    const company = await prisma.company.create({
      data: { name, aliases, domain }
    });
    
    res.status(201).json(company);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Company already exists' });
    }
    next(error);
  }
});

router.patch('/companies/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { name, aliases, domain } = req.body;
    
    const company = await prisma.company.findUnique({
      where: { id: req.params.id }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const updatedCompany = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(aliases !== undefined && { aliases }),
        ...(domain !== undefined && { domain })
      }
    });
    
    res.json(updatedCompany);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Company name already exists' });
    }
    next(error);
  }
});

router.delete('/companies/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    await prisma.company.delete({
      where: { id: req.params.id }
    });
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Manage keywords
router.get('/keywords', authenticateApiKey, async (req, res, next) => {
  try {
    const keywords = await prisma.keyword.findMany({
      where: { isActive: true },
      orderBy: { term: 'asc' }
    });
    
    res.json(keywords);
  } catch (error) {
    next(error);
  }
});

router.post('/keywords', authenticateApiKey, async (req, res, next) => {
  try {
    const { term, category } = req.body;
    
    if (!term) {
      return res.status(400).json({ error: 'Keyword term required' });
    }
    
    const keyword = await prisma.keyword.create({
      data: { term, category }
    });
    
    res.status(201).json(keyword);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Keyword already exists' });
    }
    next(error);
  }
});

router.patch('/keywords/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { term, category } = req.body;
    
    const keyword = await prisma.keyword.findUnique({
      where: { id: req.params.id }
    });
    
    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    
    const updatedKeyword = await prisma.keyword.update({
      where: { id: req.params.id },
      data: {
        ...(term !== undefined && { term }),
        ...(category !== undefined && { category })
      }
    });
    
    res.json(updatedKeyword);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Keyword term already exists' });
    }
    next(error);
  }
});

router.delete('/keywords/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const keyword = await prisma.keyword.findUnique({
      where: { id: req.params.id }
    });
    
    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    
    await prisma.keyword.delete({
      where: { id: req.params.id }
    });
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;