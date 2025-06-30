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
        select: {
          id: true,
          title: true,
          description: true,
          link: true,
          publishedAt: true,
          severity: true,
          imageUrl: true,
          content: true,
          categories: true,
          summary: true,
          recommendations: true,
          alertType: true,
          classificationConfidence: true,
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

// Get all articles (paginated with filtering)
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { alertType, severity, search } = req.query;
    
    // Build where clause for filtering
    const where = {};
    
    if (alertType) {
      where.alertType = alertType;
    }
    
    if (severity) {
      where.severity = severity;
    }
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          link: true,
          publishedAt: true,
          severity: true,
          imageUrl: true,
          content: true,
          categories: true,
          summary: true,
          recommendations: true,
          alertType: true,
          classificationConfidence: true,
          feed: {
            select: { id: true, name: true }
          },
          matchedKeywords: {
            include: { keyword: true }
          },
          matchedCompanies: {
            include: { company: true }
          },
          matchedAgencies: {
            include: { agency: true }
          },
          matchedLocations: {
            include: { location: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' }
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
// Updated to use API key authentication for WordPress integration
router.get('/user-feed', authenticateApiKey, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { user_email, severity, days } = req.query;
    
    let articles = [];
    
    if (user_email) {
      // Get user by email
      const user = await prisma.user.findUnique({
        where: { email: user_email },
        include: {
          subscriptions: {
            where: { isActive: true },
            select: {
              type: true,
              targetId: true,
              severityFilter: true
            }
          }
        }
      });
      
      if (user && user.subscriptions.length > 0) {
        const companyIds = user.subscriptions
          .filter(s => s.type === 'COMPANY')
          .map(s => s.targetId);
        const keywordIds = user.subscriptions
          .filter(s => s.type === 'KEYWORD')
          .map(s => s.targetId);
        const agencyIds = user.subscriptions
          .filter(s => s.type === 'AGENCY')
          .map(s => s.targetId);
        const locationIds = user.subscriptions
          .filter(s => s.type === 'LOCATION')
          .map(s => s.targetId);
        
        // Build where conditions
        const whereConditions = [];
        
        if (keywordIds.length > 0) {
          whereConditions.push({
            matchedKeywords: {
              some: {
                keywordId: { in: keywordIds }
              }
            }
          });
        }
        
        if (companyIds.length > 0) {
          whereConditions.push({
            matchedCompanies: {
              some: {
                companyId: { in: companyIds }
              }
            }
          });
        }
        
        if (agencyIds.length > 0) {
          whereConditions.push({
            matchedAgencies: {
              some: {
                agencyId: { in: agencyIds }
              }
            }
          });
        }
        
        if (locationIds.length > 0) {
          whereConditions.push({
            matchedLocations: {
              some: {
                locationId: { in: locationIds }
              }
            }
          });
        }
        
        if (whereConditions.length > 0) {
          const where = { OR: whereConditions };
          
          // Add time filter
          if (days) {
            const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
            where.publishedAt = { gte: daysAgo };
          }
          
          // Add severity filter
          if (severity) {
            where.severity = severity;
          }
          
          articles = await prisma.article.findMany({
            where,
            include: {
              feed: {
                select: { id: true, name: true }
              },
              matchedKeywords: {
                include: { keyword: true }
              },
              matchedCompanies: {
                include: { company: true }
              },
              matchedAgencies: {
                include: { agency: true }
              },
              matchedLocations: {
                include: { location: true }
              }
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { publishedAt: 'desc' }
          });
        }
      }
    }
    
    // Fallback: return recent high-priority articles if no user-specific feed
    if (articles.length === 0) {
      const where = { severity: { in: ['MEDIUM', 'HIGH', 'CRITICAL'] } };
      
      if (days) {
        const daysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
        where.publishedAt = { gte: daysAgo };
      }
      
      if (severity) {
        where.severity = severity;
      }
      
      articles = await prisma.article.findMany({
        where,
        include: {
          feed: {
            select: { id: true, name: true }
          },
          matchedKeywords: {
            include: { keyword: true }
          },
          matchedCompanies: {
            include: { company: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' }
      });
    }
    
    res.json(articles);
  } catch (error) {
    next(error);
  }
});

// Keep the old JWT endpoint for backward compatibility
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
    const whereConditions = [];
    
    if (keywordIds.length > 0) {
      whereConditions.push({
        matchedKeywords: {
          some: {
            keywordId: { in: keywordIds }
          }
        }
      });
    }
    
    if (companyIds.length > 0) {
      whereConditions.push({
        matchedCompanies: {
          some: {
            companyId: { in: companyIds }
          }
        }
      });
    }
    
    const articles = await prisma.article.findMany({
      where: whereConditions.length > 0 ? { OR: whereConditions } : {},
      include: {
        feed: {
          select: { id: true, name: true }
        },
        matchedKeywords: {
          include: { keyword: true }
        },
        matchedCompanies: {
          include: { company: true }
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

// Update article schema
const updateArticleSchema = Joi.object({
  alertType: Joi.string().valid('CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION').optional(),
  severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  classificationConfidence: Joi.number().min(0).max(1).optional(),
  categories: Joi.array().items(Joi.string()).optional()
});

// Update article classification (admin functionality)
router.patch('/:id', authenticateApiKey, validateRequest(updateArticleSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Check if article exists
    const existingArticle = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true }
    });
    
    if (!existingArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Update article with new classification data
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: updateData,
      include: {
        feed: {
          select: {
            id: true,
            name: true,
            url: true
          }
        },
        matchedKeywords: {
          include: { keyword: true }
        },
        matchedCompanies: {
          include: { company: true }
        },
        matchedAgencies: {
          include: { agency: true }
        },
        matchedLocations: {
          include: { location: true }
        }
      }
    });
    
    // Log the update for audit purposes
    console.log(`Article ${id} updated:`, {
      title: existingArticle.title,
      changes: updateData,
      timestamp: new Date().toISOString()
    });
    
    res.json(updatedArticle);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Article not found' });
    }
    next(error);
  }
});

module.exports = router;