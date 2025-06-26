const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');
const { authenticateApiKey, authenticateJWT } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Search/filter schema
const searchSchema = Joi.object({
  q: Joi.string().optional(),
  feedId: Joi.string().optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  categories: Joi.array().items(Joi.string()).optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  sortBy: Joi.string().valid('publishedAt', 'createdAt').default('publishedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Search articles with filters
router.get('/search', authenticateApiKey, async (req, res, next) => {
  try {
    const {
      q, feedId, startDate, endDate, categories,
      page, limit, sortBy, sortOrder
    } = req.query;
    
    // Build where clause
    const where = {};
    
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } }
      ];
    }
    
    if (feedId) {
      where.feedId = feedId;
    }
    
    if (startDate || endDate) {
      where.publishedAt = {};
      if (startDate) where.publishedAt.gte = new Date(startDate);
      if (endDate) where.publishedAt.lte = new Date(endDate);
    }
    
    if (categories && categories.length > 0) {
      where.categories = { hasSome: categories };
    }
    
    // Execute query with pagination
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        include: {
          feed: {
            select: { id: true, name: true }
          },
          matchedKeywords: {
            include: {
              keyword: true
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder }
      }),
      prisma.article.count({ where })
    ]);
    
    res.json({
      articles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all articles (paginated)
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        include: {
          feed: {
            select: { id: true, name: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' }
      }),
      prisma.article.count()
    ]);
    
    res.json({
      articles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single article
router.get('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const article = await prisma.article.findUnique({
      where: { id: req.params.id },
      include: {
        feed: true,
        matchedKeywords: {
          include: {
            keyword: true
          }
        }
      }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(article);
  } catch (error) {
    next(error);
  }
});

// Get articles by matched keyword
router.get('/keyword/:keywordId', authenticateApiKey, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const articles = await prisma.article.findMany({
      where: {
        matchedKeywords: {
          some: {
            keywordId: req.params.keywordId
          }
        }
      },
      include: {
        feed: {
          select: { id: true, name: true }
        },
        matchedKeywords: {
          where: { keywordId: req.params.keywordId },
          include: { keyword: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { publishedAt: 'desc' }
    });
    
    res.json(articles);
  } catch (error) {
    next(error);
  }
});

// Get articles for a specific user based on their subscriptions
router.get('/user/feed', authenticateJWT, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Get user's subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId: req.userId,
        isActive: true
      },
      select: {
        type: true,
        targetId: true
      }
    });
    
    const companyIds = subscriptions
      .filter(s => s.type === 'COMPANY')
      .map(s => s.targetId);
    const keywordIds = subscriptions
      .filter(s => s.type === 'KEYWORD')
      .map(s => s.targetId);
    
    // Find articles matching user's subscriptions
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          {
            matchedKeywords: {
              some: {
                keywordId: { in: keywordIds }
              }
            }
          },
          // Add company matching logic here when implemented
        ]
      },
      include: {
        feed: {
          select: { id: true, name: true }
        },
        matchedKeywords: {
          include: { keyword: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { publishedAt: 'desc' }
    });
    
    res.json(articles);
  } catch (error) {
    next(error);
  }
});

module.exports = router;