const express = require('express');
const { getPrismaClient } = require('../utils/database');
const { authenticateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = getPrismaClient();

// Get all locations
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        country: true,
        region: true,
        city: true,
        slug: true,
        createdAt: true
      }
    });
    
    res.json(locations);
  } catch (error) {
    logger.error('Error fetching locations:', error);
    next(error);
  }
});

// Get location by slug
router.get('/slug/:slug', authenticateApiKey, async (req, res, next) => {
  try {
    const { slug } = req.params;
    logger.info(`Fetching location by slug: ${slug}`);
    
    // First try to find by slug field
    let location = await prisma.location.findUnique({
      where: { slug: slug }
    });
    
    // If not found by slug, try by name (for backwards compatibility)
    if (!location) {
      location = await prisma.location.findFirst({
        where: { 
          name: {
            equals: slug.replace(/-/g, ' '),
            mode: 'insensitive'
          }
        }
      });
    }
    
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    // Get related articles
    const articles = await prisma.article.findMany({
      where: {
        matchedLocations: {
          some: {
            locationId: location.id
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
      lastMention: articles.length > 0 ? articles[0].publishedAt : null,
      incidentCount: articles.filter(a => 
        a.severity === 'CRITICAL' || 
        a.severity === 'HIGH'
      ).length
    };
    
    // Format articles to flatten companies
    const formattedArticles = articles.map(article => ({
      ...article,
      companies: article.matchedCompanies.map(mc => mc.company),
      matchedCompanies: undefined
    }));
    
    res.json({
      location,
      articles: formattedArticles,
      stats
    });
  } catch (error) {
    logger.error('Error fetching location by slug:', error);
    next(error);
  }
});

// Get location by ID
router.get('/:id', authenticateApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const location = await prisma.location.findUnique({
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
    
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    res.json(location);
  } catch (error) {
    logger.error('Error fetching location:', error);
    next(error);
  }
});

module.exports = router;