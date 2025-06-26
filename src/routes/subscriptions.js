const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');
const { authenticateJWT, authenticateApiKey } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const createSubscriptionSchema = Joi.object({
  type: Joi.string().valid('COMPANY', 'KEYWORD').required(),
  targetId: Joi.string().required(),
  emailEnabled: Joi.boolean().default(true),
  smsEnabled: Joi.boolean().default(false),
  pushEnabled: Joi.boolean().default(false)
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

// Delete subscription
router.delete('/:id', authenticateJWT, async (req, res, next) => {
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