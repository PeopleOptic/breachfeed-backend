const express = require('express');
const { getPrismaClient } = require('../utils/database');
const { authenticateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = getPrismaClient();

// Get all agencies
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const agencies = await prisma.agency.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        acronym: true,
        country: true,
        type: true,
        slug: true,
        createdAt: true
      }
    });
    
    res.json(agencies);
  } catch (error) {
    logger.error('Error fetching agencies:', error);
    next(error);
  }
});

// Get agency by slug
router.get('/slug/:slug', authenticateApiKey, async (req, res, next) => {
  try {
    const { slug } = req.params;
    logger.info(`Fetching agency by slug: ${slug}`);
    
    // First try to find by slug field
    let agency = await prisma.agency.findUnique({
      where: { slug: slug }
    });
    
    // If not found by slug, try by name or acronym (for backwards compatibility)
    if (!agency) {
      agency = await prisma.agency.findFirst({
        where: { 
          OR: [
            {
              name: {
                equals: slug.replace(/-/g, ' ').toUpperCase(),
                mode: 'insensitive'
              }
            },
            {
              acronym: {
                equals: slug.toUpperCase(),
                mode: 'insensitive'
              }
            }
          ]
        }
      });
    }
    
    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    
    // Get related articles
    const articles = await prisma.article.findMany({
      where: {
        agencies: {
          some: {
            id: agency.id
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
        companies: {
          select: {
            id: true,
            name: true
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
    
    res.json({
      agency,
      articles,
      stats
    });
  } catch (error) {
    logger.error('Error fetching agency by slug:', error);
    next(error);
  }
});

// Get agency by ID
router.get('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const agency = await prisma.agency.findUnique({
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
    
    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    
    res.json(agency);
  } catch (error) {
    logger.error('Error fetching agency:', error);
    next(error);
  }
});

module.exports = router;