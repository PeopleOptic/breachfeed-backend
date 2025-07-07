const express = require('express');
const { getPrismaClient } = require('../utils/database');
const Joi = require('joi');
const { authenticateApiKey, authenticateJWT } = require('../middleware/auth');
const { identifyUser } = require('../middleware/userIdentification');
const { optionalIdentifyUser } = require('../middleware/optionalUserIdentification');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');
const AIService = require('../services/aiService');
const contentFetchService = require('../services/contentFetchService');
const { matchArticleKeywords } = require('../services/matchingService');
const { createEntitiesFromAI, matchArticleWithAIEntities } = require('../services/enhancedMatchingService');

const router = express.Router();
const prisma = getPrismaClient();

// Helper function to calculate vote stats for articles
async function calculateVoteStats(articles, userId = null) {
  try {
    if (!Array.isArray(articles)) {
      articles = [articles];
    }
    
    const articleIds = articles.map(a => a.id);
    
    // Get all votes for these articles
    const votes = await prisma.articleVote.findMany({
      where: { articleId: { in: articleIds } }
    });
    
    // Get user's votes if userId provided
    let userVotes = {};
    if (userId) {
      const userVoteRecords = await prisma.articleVote.findMany({
        where: {
          articleId: { in: articleIds },
          userId: userId
        }
      });
      userVotes = userVoteRecords.reduce((acc, vote) => {
        acc[vote.articleId] = vote.voteType;
        return acc;
      }, {});
    }
    
    // Calculate stats for each article
    const statsMap = {};
    articles.forEach(article => {
      const articleVotes = votes.filter(v => v.articleId === article.id);
      const upvotes = articleVotes.filter(v => v.voteType === 'UP').length;
      const downvotes = articleVotes.filter(v => v.voteType === 'DOWN').length;
      
      statsMap[article.id] = {
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        userVote: userVotes[article.id] || null
      };
    });
    
    // Return single article or array
    if (articles.length === 1) {
      return { ...articles[0], voteStats: statsMap[articles[0].id] };
    }
    
    return articles.map(article => ({
      ...article,
      voteStats: statsMap[article.id]
    }));
  } catch (error) {
    console.error('Error calculating vote stats:', error);
    // Return articles without vote stats if table doesn't exist
    if (error.code === 'P2021') {
      console.log('ArticleVote table does not exist, returning articles without vote stats');
      if (!Array.isArray(articles)) {
        return { ...articles, voteStats: { upvotes: 0, downvotes: 0, score: 0, userVote: null } };
      }
      return articles.map(article => ({
        ...article,
        voteStats: { upvotes: 0, downvotes: 0, score: 0, userVote: null }
      }));
    }
    throw error;
  }
}

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
router.get('/search', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const {
      q, feedId, startDate, endDate, categories,
      page, limit, sortBy, sortOrder
    } = req.query;
    const userId = req.userId; // From identifyUser middleware
    
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
          slug: true,
          voteCount: true,
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
    
    // Add vote stats to articles
    const articlesWithVotes = await calculateVoteStats(articles, userId);
    
    res.json({
      articles: articlesWithVotes,
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
router.get('/popular', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const days = parseInt(req.query.days) || 7;
    const userId = req.userId; // From identifyUser middleware
    
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // For now, just get recent high-severity articles as "popular"
    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: {
          publishedAt: {
            gte: startDate
          },
          severity: {
            in: ['HIGH', 'CRITICAL']
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
          slug: true,
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
          { publishedAt: 'desc' }
        ]
      }),
      prisma.article.count({
        where: {
          publishedAt: {
            gte: startDate
          },
          // Skip voteCount filter for now
        }
      })
    ]);
    
    // Add vote stats to articles
    const articlesWithVotes = await calculateVoteStats(articles, userId);
    
    res.json({
      articles: articlesWithVotes,
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
router.get('/', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { alertType, severity, search } = req.query;
    const userId = req.userId; // From identifyUser middleware
    
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
          slug: true,
          voteCount: true,
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
    
    // Add vote stats to articles
    const articlesWithVotes = await calculateVoteStats(articlesWithMatches, userId);
    
    res.json({
      articles: articlesWithVotes,
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
router.post('/:id/vote', authenticateApiKey, identifyUser, async (req, res, next) => {
  try {
    const { id: articleId } = req.params;
    const { voteType } = req.body;
    const userId = req.userId; // Now set by identifyUser middleware
    
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
router.delete('/:id/vote', authenticateApiKey, identifyUser, async (req, res, next) => {
  try {
    const { id: articleId } = req.params;
    const userId = req.userId; // Now set by identifyUser middleware
    
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
    
    // Add vote stats to the updated article
    const userId = req.userId; // May be undefined if not using identifyUser
    const articleWithVotes = await calculateVoteStats(updatedArticle, userId);
    
    res.json(articleWithVotes);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Article not found' });
    }
    next(error);
  }
});

// Summarize article on demand
router.post('/:id/summarize', authenticateApiKey, identifyUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get the article
    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        feed: true
      }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Check if article already has AI summary from full content
    if (article.summary && article.hasFullContent) {
      return res.json({
        message: 'Article already has AI summary from full content',
        summary: article.summary,
        recommendations: article.recommendations,
        hasFullContent: article.hasFullContent,
        severity: article.severity,
        alertType: article.alertType
      });
    }
    
    logger.info(`On-demand summarization requested for article: ${article.title}`);
    
    // Fetch full content from source URL
    let fullContent = null;
    let hasFullContent = false;
    
    try {
      fullContent = await contentFetchService.fetchArticleContent(article.link);
      if (fullContent && fullContent.textContent && fullContent.textContent.length > 500) {
        hasFullContent = true;
        logger.info(`Fetched ${fullContent.textContent.length} characters for on-demand summary`);
      }
    } catch (fetchError) {
      logger.error(`Failed to fetch content for on-demand summary: ${fetchError.message}`);
      return res.status(400).json({ 
        error: 'Failed to fetch article content',
        message: 'Could not retrieve the full article from the source URL'
      });
    }
    
    // Generate AI summary
    let aiSummaryData;
    const articleForAI = {
      title: article.title,
      description: article.description,
      content: hasFullContent ? fullContent.textContent : article.content,
      link: article.link,
      publishedAt: article.publishedAt
    };
    
    try {
      if (hasFullContent) {
        aiSummaryData = await AIService.generateComprehensiveSummary(articleForAI, fullContent);
      } else {
        aiSummaryData = await AIService.generateIncidentSummary(articleForAI);
      }
    } catch (aiError) {
      logger.error(`AI summary generation failed: ${aiError.message}`);
      return res.status(500).json({ 
        error: 'AI summary generation failed',
        message: 'Could not generate AI summary for this article'
      });
    }
    
    // Update article with new summary
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        summary: aiSummaryData.summary || article.summary,
        recommendations: aiSummaryData.recommendations || article.recommendations,
        severity: aiSummaryData.severity || article.severity,
        alertType: aiSummaryData.alertType || article.alertType,
        classificationConfidence: aiSummaryData.classificationConfidence || article.classificationConfidence,
        hasFullContent: hasFullContent,
        content: hasFullContent && fullContent.textContent ? fullContent.textContent : article.content
      }
    });
    
    logger.info(`Successfully generated on-demand summary for article ${id}`);
    
    res.json({
      message: 'Summary generated successfully',
      summary: updatedArticle.summary,
      recommendations: updatedArticle.recommendations,
      severity: updatedArticle.severity,
      alertType: updatedArticle.alertType,
      hasFullContent: updatedArticle.hasFullContent,
      aiGenerated: aiSummaryData.aiGenerated || false
    });
    
  } catch (error) {
    logger.error('Error generating on-demand summary:', error);
    next(error);
  }
});

// Get single article with full details
router.get('/:identifier', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const { includeFullContent } = req.query;
    const userId = req.userId; // From identifyUser middleware
    const { identifier } = req.params;
    
    // Check if identifier is a valid UUID (for ID lookup) or use as slug
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUUID = uuidPattern.test(identifier);
    
    // Build where clause based on identifier type
    const whereClause = isUUID ? { id: identifier } : { slug: identifier };
    
    // First get basic article data
    const article = await prisma.article.findFirst({
      where: whereClause,
      include: {
        feed: true
      }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Then get matched entities separately to avoid complex joins
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
      
      article.matchedKeywords = matchedKeywords;
      article.matchedCompanies = matchedCompanies;
      article.matchedAgencies = matchedAgencies;
      article.matchedLocations = matchedLocations;
    } catch (error) {
      console.error('Error fetching matched entities:', error);
      // Continue without matches if they fail
      article.matchedKeywords = [];
      article.matchedCompanies = [];
      article.matchedAgencies = [];
      article.matchedLocations = [];
    }
    
    // Get vote stats using the helper function
    const articleWithVotes = await calculateVoteStats(article, userId);
    
    // Remove full content if not requested
    if (!includeFullContent) {
      delete articleWithVotes.content;
    }
    
    res.json(articleWithVotes);
  } catch (error) {
    console.error('Error in GET /articles/:identifier:', error);
    res.status(500).json({
      error: 'Failed to fetch article',
      message: error.message
    });
  }
});

// Get articles by matched keyword
router.get('/keyword/:keywordId', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.userId; // From identifyUser middleware
    
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
    
    // Add vote stats to articles
    const articlesWithVotes = await calculateVoteStats(articles, userId);
    
    res.json(articlesWithVotes);
  } catch (error) {
    next(error);
  }
});

// Get articles for a specific user based on their subscriptions
// Updated to use API key authentication for WordPress integration
router.get('/user-feed', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { user_email, severity, days } = req.query;
    const currentUserId = req.userId; // From identifyUser middleware
    
    let articles = [];
    let userId = null;
    
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
      
      if (user) {
        userId = user.id;
        
        if (user.subscriptions.length > 0) {
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
    
    // Add vote stats to articles
    // Use the user ID from the email lookup if provided, otherwise use current user
    const articlesWithVotes = await calculateVoteStats(articles, userId || currentUserId);
    
    res.json(articlesWithVotes);
  } catch (error) {
    next(error);
  }
});

// Keep the old JWT endpoint for backward compatibility
router.get('/user/feed', authenticateJWT, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.userId; // From authenticateJWT
    
    // Get user's subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId: userId,
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
    
    // Add vote stats to articles
    const articlesWithVotes = await calculateVoteStats(articles, userId);
    
    res.json(articlesWithVotes);
  } catch (error) {
    next(error);
  }
});

// Get articles by tag
router.get('/by-tag/:tag', authenticateApiKey, optionalIdentifyUser, async (req, res, next) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.userId; // From identifyUser middleware
    
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
          slug: true,
          voteCount: true,
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
    
    // Add vote stats to articles
    const articlesWithVotes = await calculateVoteStats(articles, userId);
    
    res.json({
      articles: articlesWithVotes,
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

// Delete article endpoint
router.delete('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // First, find the article to get its link and guid
    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        link: true,
        guid: true,
        title: true
      }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Use a transaction to ensure both operations succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
      // Add to deleted articles tracking
      await tx.deletedArticle.create({
        data: {
          articleLink: article.link,
          articleGuid: article.guid,
          deletedBy: req.apiKeyDetails?.apiKey || 'system',
          reason: reason || 'Deleted via API'
        }
      });
      
      // Delete the article and all its relations
      await tx.article.delete({
        where: { id }
      });
      
      return article;
    });
    
    res.json({
      success: true,
      message: 'Article deleted successfully',
      deletedArticle: {
        id: result.id,
        title: result.title,
        link: result.link
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Article not found' });
    }
    next(error);
  }
});

// Regenerate AI content for an article
router.post('/:id/regenerate-ai', authenticateApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    logger.info(`Regenerating AI content for article: ${id}`);
    
    // Fetch the article
    const article = await prisma.article.findUnique({
      where: { id },
      include: { feed: true }
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Try to fetch full content
    let fullContentData = null;
    const ENABLE_FULL_CONTENT_FETCH = process.env.ENABLE_FULL_CONTENT_FETCH === 'true';
    
    if (ENABLE_FULL_CONTENT_FETCH && contentFetchService.shouldFetchUrl(article.link)) {
      try {
        logger.info(`Fetching full content for: ${article.title}`);
        fullContentData = await contentFetchService.fetchArticleContent(article.link);
        
        if (fullContentData && fullContentData.textContent && fullContentData.textContent.length > 1000) {
          logger.info(`Successfully fetched ${fullContentData.textContent.length} characters of full content`);
        }
      } catch (fetchError) {
        logger.warn(`Failed to fetch full content for ${article.link}:`, fetchError.message);
      }
    }
    
    // Generate AI summary
    const aiSummaryData = await AIService.generateComprehensiveSummary(article, fullContentData);
    
    if (!aiSummaryData) {
      return res.status(500).json({ error: 'Failed to generate AI summary' });
    }
    
    // Update article with new AI content
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        summary: aiSummaryData.summary,
        recommendations: aiSummaryData.recommendations,
        severity: aiSummaryData.severity || article.severity,
        alertType: aiSummaryData.alertType || article.alertType,
        classificationConfidence: aiSummaryData.classificationConfidence || article.classificationConfidence,
        content: fullContentData?.textContent || article.content,
        hasFullContent: !!fullContentData?.textContent
      }
    });
    
    // Process entity extraction if AI data includes entities
    if (aiSummaryData.aiGenerated) {
      try {
        // Create new entities from AI extraction if they don't exist
        await createEntitiesFromAI(aiSummaryData);
        
        // Clear existing matches
        await Promise.all([
          prisma.matchedKeyword.deleteMany({ where: { articleId: id } }),
          prisma.matchedCompany.deleteMany({ where: { articleId: id } }),
          prisma.matchedAgency.deleteMany({ where: { articleId: id } }),
          prisma.matchedLocation.deleteMany({ where: { articleId: id } })
        ]);
        
        // Match using traditional keyword matching
        const traditionalMatches = await matchArticleKeywords(updatedArticle);
        logger.info(`Found ${traditionalMatches.length} traditional matches`);
        
        // Match using AI-extracted entities
        const aiMatches = await matchArticleWithAIEntities(updatedArticle, aiSummaryData);
        logger.info(`Found ${aiMatches.length} AI-enhanced matches`);
        
      } catch (matchError) {
        logger.error('Error during entity matching:', matchError);
        // Continue even if matching fails
      }
    }
    
    logger.info(`Successfully regenerated AI content for article: ${article.title}`);
    
    res.json({
      success: true,
      article: {
        id: updatedArticle.id,
        title: updatedArticle.title,
        summary: updatedArticle.summary,
        recommendations: updatedArticle.recommendations,
        alertType: updatedArticle.alertType,
        severity: updatedArticle.severity,
        hasFullContent: updatedArticle.hasFullContent
      }
    });
    
  } catch (error) {
    logger.error('Error regenerating AI content:', error);
    next(error);
  }
});


module.exports = router;