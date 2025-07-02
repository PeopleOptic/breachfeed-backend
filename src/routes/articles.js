const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');
const { authenticateApiKey, authenticateJWT } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Utility function to generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

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

// Update article schema
const updateArticleSchema = Joi.object({
  alertType: Joi.string().valid('CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION').optional(),
  severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  classificationConfidence: Joi.number().min(0).max(1).optional(),
  categories: Joi.array().items(Joi.string()).optional()
});

// Test endpoint to debug database issues
router.get('/test', authenticateApiKey, async (req, res, next) => {
  try {
    // First, try to count articles
    const count = await prisma.article.count();
    
    // Then try to get one article with minimal fields
    const article = await prisma.article.findFirst({
      select: {
        id: true,
        title: true,
        publishedAt: true
      }
    });
    
    res.json({
      count,
      sample: article,
      status: 'ok'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: error.code,
      meta: error.meta
    });
  }
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

// Get popular articles (must be before /:id route)
router.get('/popular', authenticateApiKey, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const days = parseInt(req.query.days) || 7;
    
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: {
          publishedAt: {
            gte: startDate
          },
          voteCount: {
            gt: 0
          }
        },
        select: {
          id: true,
          title: true,
          description: true,
          link: true,
          publishedAt: true,
          severity: true,
          imageUrl: true,
          categories: true,
          summary: true,
          alertType: true,
          voteCount: true,
          feed: {
            select: { id: true, name: true }
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
        orderBy: [
          { voteCount: 'desc' },
          { publishedAt: 'desc' }
        ]
      }),
      prisma.article.count({
        where: {
          publishedAt: {
            gte: startDate
          },
          voteCount: {
            gt: 0
          }
        }
      })
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
    
    // First try a simple query
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
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' }
      }),
      prisma.article.count({ where })
    ]);
    
    // Then add the matched entities if the basic query works
    const articlesWithMatches = await Promise.all(
      articles.map(async (article) => {
        try {
          const [matchedKeywords, matchedCompanies, matchedAgencies, matchedLocations] = await Promise.all([
            prisma.matchedKeyword.findMany({
              where: { articleId: article.id },
              include: { keyword: true }
            }),
            prisma.matchedCompany.findMany({
              where: { articleId: article.id },
              include: { company: true }
            }),
            prisma.matchedAgency.findMany({
              where: { articleId: article.id },
              include: { agency: true }
            }),
            prisma.matchedLocation.findMany({
              where: { articleId: article.id },
              include: { location: true }
            })
          ]);
          
          return {
            ...article,
            matchedKeywords,
            matchedCompanies,
            matchedAgencies,
            matchedLocations
          };
        } catch (error) {
          // If matches fail, return article without them
          console.error('Error fetching matches for article:', article.id, error);
          return article;
        }
      })
    );
    
    res.json({
      articles: articlesWithMatches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in GET /articles:', error);
    res.status(500).json({
      error: 'Failed to fetch articles',
      message: error.message,
      code: error.code
    });
  }
});

// Vote on an article
router.post('/:id/vote', authenticateApiKey, async (req, res, next) => {
  try {
    const { id: articleId } = req.params;
    const { voteType } = req.body;
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required for voting' });
    }
    
    if (!['UP', 'DOWN'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid vote type. Must be UP or DOWN' });
    }
    
    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Check for existing vote
    const existingVote = await prisma.articleVote.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId
        }
      }
    });
    
    let voteChange = 0;
    
    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // Same vote type, no change needed
        return res.json({ message: 'Vote unchanged', voteType });
      }
      
      // Update vote type
      await prisma.articleVote.update({
        where: { id: existingVote.id },
        data: { voteType }
      });
      
      // Calculate vote change
      voteChange = voteType === 'UP' ? 2 : -2; // Changing from DOWN to UP or vice versa
    } else {
      // Create new vote
      await prisma.articleVote.create({
        data: {
          userId,
          articleId,
          voteType
        }
      });
      
      voteChange = voteType === 'UP' ? 1 : -1;
    }
    
    // Update article vote count
    await prisma.article.update({
      where: { id: articleId },
      data: {
        voteCount: {
          increment: voteChange
        }
      }
    });
    
    res.json({ message: 'Vote recorded', voteType });
  } catch (error) {
    next(error);
  }
});

// Remove vote from an article
router.delete('/:id/vote', authenticateApiKey, async (req, res, next) => {
  try {
    const { id: articleId } = req.params;
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    // Find and delete vote
    const existingVote = await prisma.articleVote.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId
        }
      }
    });
    
    if (!existingVote) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    
    await prisma.articleVote.delete({
      where: { id: existingVote.id }
    });
    
    // Update article vote count
    const voteChange = existingVote.voteType === 'UP' ? -1 : 1;
    await prisma.article.update({
      where: { id: articleId },
      data: {
        voteCount: {
          increment: voteChange
        }
      }
    });
    
    res.json({ message: 'Vote removed' });
  } catch (error) {
    next(error);
  }
});

// Delete an article (admin functionality) - MUST BE BEFORE /:identifier route
router.delete('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if article exists
    const existingArticle = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true }
    });
    
    if (!existingArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Delete the article (this will cascade delete related records)
    await prisma.article.delete({
      where: { id }
    });
    
    // Log the deletion for audit purposes
    console.log(`Article ${id} deleted:`, {
      title: existingArticle.title,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      message: 'Article deleted successfully',
      deletedArticle: existingArticle
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Article not found' });
    }
    next(error);
  }
});

// Update article (admin functionality) - MUST BE BEFORE /:identifier route  
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

// Get single article with full details
router.get('/:identifier', authenticateApiKey, async (req, res, next) => {
  try {
    const { includeFullContent } = req.query;
    const userId = req.headers['x-user-id']; // Optional user ID for vote status
    const { identifier } = req.params;
    
    // Use ID for now since slug doesn't exist in production
    const whereClause = { id: identifier };
    
    const article = await prisma.article.findFirst({
      where: whereClause,
      include: {
        feed: true,
        matchedKeywords: {
          include: {
            keyword: true
          }
        },
        matchedCompanies: {
          include: {
            company: true
          }
        },
        matchedAgencies: {
          include: {
            agency: true
          }
        },
        matchedLocations: {
          include: {
            location: true
          }
        },
        votes: userId ? {
          where: { userId }
        } : false
      }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Skip slug generation for now
    
    // Calculate vote summary
    const voteStats = await prisma.articleVote.groupBy({
      by: ['voteType'],
      where: { articleId: article.id },
      _count: true
    });
    
    const upvotes = voteStats.find(v => v.voteType === 'UP')?._count || 0;
    const downvotes = voteStats.find(v => v.voteType === 'DOWN')?._count || 0;
    
    // Prepare response
    const response = {
      ...article,
      voteStats: {
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        userVote: article.votes && article.votes[0] ? article.votes[0].voteType : null
      }
    };
    
    // Remove full content if not requested
    if (!includeFullContent) {
      delete response.content;
    }
    
    // Remove votes array from response
    delete response.votes;
    
    res.json(response);
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

// Get articles by tag
router.get('/by-tag/:tag', authenticateApiKey, async (req, res, next) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Decode the tag from URL
    const decodedTag = decodeURIComponent(tag);
    
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: {
          categories: {
            has: decodedTag
          }
        },
        select: {
          id: true,
          title: true,
          description: true,
          link: true,
          publishedAt: true,
          severity: true,
          imageUrl: true,
          categories: true,
          alertType: true,
          feed: {
            select: { id: true, name: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { publishedAt: 'desc' }
      }),
      prisma.article.count({
        where: {
          categories: {
            has: decodedTag
          }
        }
      })
    ]);
    
    res.json({
      articles,
      tag: decodedTag,
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


module.exports = router;