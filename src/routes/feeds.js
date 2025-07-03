const express = require('express');
const { getPrismaClient } = require('../utils/database');
const Joi = require('joi');
const { authenticateApiKey } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { fetchAndProcessFeed } = require('../services/rssService');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = getPrismaClient();

// Validation schemas
const createFeedSchema = Joi.object({
  name: Joi.string().required(),
  url: Joi.string().uri().required(),
  category: Joi.string().optional(),
  fetchInterval: Joi.number().min(60).max(3600).default(300)
});

const updateFeedSchema = Joi.object({
  name: Joi.string().optional(),
  category: Joi.string().optional(),
  fetchInterval: Joi.number().min(60).max(3600).optional(),
  isActive: Joi.boolean().optional()
});

// Get all feeds
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const feeds = await prisma.rssFeed.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(feeds);
  } catch (error) {
    next(error);
  }
});

// Get single feed
router.get('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const feed = await prisma.rssFeed.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { articles: true }
        },
        articles: {
          take: 10,
          orderBy: { publishedAt: 'desc' }
        }
      }
    });
    
    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }
    
    res.json(feed);
  } catch (error) {
    next(error);
  }
});

// Create new feed
router.post('/', authenticateApiKey, validateRequest(createFeedSchema), async (req, res, next) => {
  try {
    const feed = await prisma.rssFeed.create({
      data: req.body
    });
    
    // Fetch feed immediately
    fetchAndProcessFeed(feed).catch(err => {
      logger.error('Error fetching new feed:', err);
    });
    
    res.status(201).json(feed);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Feed URL already exists' });
    }
    next(error);
  }
});

// Update feed
router.patch('/:id', authenticateApiKey, validateRequest(updateFeedSchema), async (req, res, next) => {
  try {
    const feed = await prisma.rssFeed.update({
      where: { id: req.params.id },
      data: req.body
    });
    
    res.json(feed);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Feed not found' });
    }
    next(error);
  }
});

// Delete feed
router.delete('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    await prisma.rssFeed.delete({
      where: { id: req.params.id }
    });
    
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Feed not found' });
    }
    next(error);
  }
});

// Manually trigger feed fetch
router.post('/:id/fetch', authenticateApiKey, async (req, res, next) => {
  try {
    const feed = await prisma.rssFeed.findUnique({
      where: { id: req.params.id }
    });
    
    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }
    
    // Trigger fetch in background
    fetchAndProcessFeed(feed).catch(err => {
      logger.error('Error fetching feed:', err);
    });
    
    res.json({ message: 'Feed fetch initiated' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;