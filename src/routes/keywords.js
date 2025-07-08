const express = require('express');
const { getPrismaClient } = require('../utils/database');
const { authenticateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = getPrismaClient();

// Get all keywords
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const keywords = await prisma.keyword.findMany({
      where: { isActive: true },
      orderBy: { term: 'asc' },
      select: {
        id: true,
        term: true,
        category: true,
        slug: true,
        createdAt: true
      }
    });
    
    res.json(keywords);
  } catch (error) {
    logger.error('Error fetching keywords:', error);
    next(error);
  }
});

// Get keyword by slug
router.get('/slug/:slug', authenticateApiKey, async (req, res, next) => {
  try {
    const { slug } = req.params;
    logger.info(`Fetching keyword by slug: ${slug}`);
    
    // First try to find by slug field
    let keyword = await prisma.keyword.findUnique({
      where: { slug: slug }
    });
    
    // If not found by slug, try by term (for backwards compatibility)
    if (!keyword) {
      keyword = await prisma.keyword.findFirst({
        where: { 
          term: {
            equals: slug.replace(/-/g, ' '),
            mode: 'insensitive'
          }
        }
      });
    }
    
    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    
    // Get related articles
    const articles = await prisma.article.findMany({
      where: {
        matchedKeywords: {
          some: {
            keywordId: keyword.id
          }
        }
      },
      include: {
        feed: {
          select: {
            id: true,
            name: true,
            url: true
          }
        },
        matchedCompanies: {
          include: {
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { publishedAt: 'desc' },
      take: 50
    });
    
    // Calculate stats
    const stats = {
      articleCount: articles.length,
      lastMention: articles.length > 0 ? articles[0].publishedAt : null
    };
    
    // Format articles to flatten companies
    const formattedArticles = articles.map(article => ({
      ...article,
      companies: article.matchedCompanies.map(mc => mc.company),
      matchedCompanies: undefined
    }));
    
    res.json({
      keyword,
      articles: formattedArticles,
      stats
    });
  } catch (error) {
    logger.error('Error fetching keyword by slug:', error);
    next(error);
  }
});

// Get keyword by ID
router.get('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const keyword = await prisma.keyword.findUnique({
      where: { id },
      include: {
        articles: {
          include: {
            feed: true
          },
          orderBy: { publishedAt: 'desc' },
          take: 20
        }
      }
    });
    
    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    
    res.json(keyword);
  } catch (error) {
    logger.error('Error fetching keyword:', error);
    next(error);
  }
});

module.exports = router;