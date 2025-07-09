const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Get all regulations
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      regulatorId, 
      isActive = true,
      page = 1,
      limit = 50
    } = req.query;
    
    const where = {
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
      ...(category && { category }),
      ...(regulatorId && { regulatorId })
    };
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [regulations, total] = await Promise.all([
      prisma.regulation.findMany({
        where,
        include: {
          regulator: true,
          _count: {
            select: {
              amendments: true,
              articles: true
            }
          }
        },
        orderBy: [
          { category: 'asc' },
          { name: 'asc' }
        ],
        skip,
        take: parseInt(limit)
      }),
      prisma.regulation.count({ where })
    ]);
    
    res.json({
      regulations,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching regulations:', error);
    res.status(500).json({ error: 'Failed to fetch regulations' });
  }
});

// Get regulations by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    
    const regulations = await prisma.regulation.findMany({
      where: {
        category,
        isActive: true
      },
      include: {
        regulator: true,
        _count: {
          select: {
            amendments: true,
            articles: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    // Get category statistics
    const stats = {
      totalRegulations: regulations.length,
      totalAmendments: regulations.reduce((sum, reg) => sum + reg._count.amendments, 0),
      regulators: [...new Set(regulations.map(r => r.regulatorId))].length
    };
    
    res.json({ 
      category,
      regulations,
      stats
    });
  } catch (error) {
    console.error('Error fetching regulations by category:', error);
    res.status(500).json({ error: 'Failed to fetch regulations' });
  }
});

// Get regulation by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const regulation = await prisma.regulation.findUnique({
      where: { slug },
      include: {
        regulator: true,
        amendments: {
          orderBy: { effectiveDate: 'desc' }
        }
      }
    });
    
    if (!regulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    // Get related regulations if any
    let relatedRegulations = [];
    if (regulation.relatedRegulations && regulation.relatedRegulations.length > 0) {
      relatedRegulations = await prisma.regulation.findMany({
        where: {
          id: { in: regulation.relatedRegulations },
          isActive: true
        },
        select: {
          id: true,
          name: true,
          slug: true,
          category: true
        }
      });
    }
    
    res.json({ 
      regulation,
      relatedRegulations
    });
  } catch (error) {
    console.error('Error fetching regulation:', error);
    res.status(500).json({ error: 'Failed to fetch regulation' });
  }
});

// Get regulation articles
router.get('/:slug/articles', async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const regulation = await prisma.regulation.findUnique({
      where: { slug },
      select: { id: true }
    });
    
    if (!regulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [regulationArticles, total] = await Promise.all([
      prisma.regulationArticle.findMany({
        where: { regulationId: regulation.id },
        include: {
          article: {
            include: {
              feed: {
                select: { name: true }
              }
            }
          }
        },
        orderBy: [
          { relevanceScore: 'desc' },
          { article: { publishedAt: 'desc' } }
        ],
        skip,
        take: parseInt(limit)
      }),
      prisma.regulationArticle.count({
        where: { regulationId: regulation.id }
      })
    ]);
    
    const articles = regulationArticles.map(ra => ({
      ...ra.article,
      relevanceScore: ra.relevanceScore
    }));
    
    res.json({
      articles,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching regulation articles:', error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get regulation amendments
router.get('/:slug/amendments', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const regulation = await prisma.regulation.findUnique({
      where: { slug },
      select: { id: true }
    });
    
    if (!regulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    const amendments = await prisma.amendment.findMany({
      where: { regulationId: regulation.id },
      orderBy: { effectiveDate: 'desc' }
    });
    
    res.json({ amendments });
  } catch (error) {
    console.error('Error fetching amendments:', error);
    res.status(500).json({ error: 'Failed to fetch amendments' });
  }
});

// Admin routes (require authentication in production)
// Create new regulation
router.post('/admin', async (req, res) => {
  try {
    const {
      name,
      fullName,
      category,
      regulatorId,
      enactedDate,
      effectiveDate,
      description,
      scope,
      relatedRegulations,
      pdfUrl,
      rssFeedUrl,
      slug
    } = req.body;
    
    // Validate required fields
    if (!name || !category || !regulatorId) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, category, regulatorId' 
      });
    }
    
    // Generate slug if not provided
    const finalSlug = slug || generateSlug(name);
    
    // Check if slug already exists
    const existingRegulation = await prisma.regulation.findUnique({
      where: { slug: finalSlug }
    });
    
    if (existingRegulation) {
      return res.status(409).json({ error: 'Regulation with this slug already exists' });
    }
    
    // Verify regulator exists
    const regulator = await prisma.regulator.findUnique({
      where: { id: regulatorId }
    });
    
    if (!regulator) {
      return res.status(400).json({ error: 'Invalid regulator ID' });
    }
    
    const regulation = await prisma.regulation.create({
      data: {
        name,
        fullName,
        slug: finalSlug,
        category,
        regulatorId,
        enactedDate: enactedDate ? new Date(enactedDate) : null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        description,
        scope,
        relatedRegulations: relatedRegulations || [],
        pdfUrl,
        rssFeedUrl
      },
      include: {
        regulator: true
      }
    });
    
    res.status(201).json({ regulation });
  } catch (error) {
    console.error('Error creating regulation:', error);
    res.status(500).json({ error: 'Failed to create regulation' });
  }
});

// Update regulation
router.put('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if regulation exists
    const existingRegulation = await prisma.regulation.findUnique({
      where: { id }
    });
    
    if (!existingRegulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    // If slug is being changed, check for conflicts
    if (updates.slug && updates.slug !== existingRegulation.slug) {
      const slugConflict = await prisma.regulation.findUnique({
        where: { slug: updates.slug }
      });
      
      if (slugConflict) {
        return res.status(409).json({ error: 'Slug already in use' });
      }
    }
    
    // Prepare update data
    const updateData = {};
    const allowedFields = [
      'name', 'fullName', 'slug', 'category', 'regulatorId',
      'enactedDate', 'effectiveDate', 'description', 'scope',
      'relatedRegulations', 'pdfUrl', 'rssFeedUrl', 'isActive'
    ];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'enactedDate' || field === 'effectiveDate') {
          updateData[field] = updates[field] ? new Date(updates[field]) : null;
        } else {
          updateData[field] = updates[field];
        }
      }
    }
    
    const regulation = await prisma.regulation.update({
      where: { id },
      data: updateData,
      include: {
        regulator: true
      }
    });
    
    res.json({ regulation });
  } catch (error) {
    console.error('Error updating regulation:', error);
    res.status(500).json({ error: 'Failed to update regulation' });
  }
});

// Delete regulation (soft delete)
router.delete('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const regulation = await prisma.regulation.update({
      where: { id },
      data: { isActive: false }
    });
    
    res.json({ message: 'Regulation deactivated successfully', regulation });
  } catch (error) {
    console.error('Error deleting regulation:', error);
    res.status(500).json({ error: 'Failed to delete regulation' });
  }
});

// Add amendment to regulation
router.post('/admin/:regulationId/amendments', async (req, res) => {
  try {
    const { regulationId } = req.params;
    const {
      title,
      description,
      effectiveDate,
      changes,
      pdfUrl
    } = req.body;
    
    // Validate required fields
    if (!title || !effectiveDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: title, effectiveDate' 
      });
    }
    
    // Verify regulation exists
    const regulation = await prisma.regulation.findUnique({
      where: { id: regulationId }
    });
    
    if (!regulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    const amendment = await prisma.amendment.create({
      data: {
        regulationId,
        title,
        description,
        effectiveDate: new Date(effectiveDate),
        changes,
        pdfUrl
      }
    });
    
    res.status(201).json({ amendment });
  } catch (error) {
    console.error('Error creating amendment:', error);
    res.status(500).json({ error: 'Failed to create amendment' });
  }
});

// Claude AI Q&A endpoint
router.post('/:slug/ask', async (req, res) => {
  try {
    const { slug } = req.params;
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const regulation = await prisma.regulation.findUnique({
      where: { slug },
      include: {
        regulator: true,
        amendments: {
          orderBy: { effectiveDate: 'desc' },
          take: 5
        }
      }
    });
    
    if (!regulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    // TODO: Implement Claude AI integration
    // For now, return a placeholder response
    res.json({
      question,
      answer: `This feature will provide AI-powered answers about ${regulation.name}. Integration with Claude AI is pending.`,
      context: {
        regulation: regulation.name,
        regulator: regulation.regulator.fullName,
        category: regulation.category
      }
    });
  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// AI Q&A endpoint for regulations
router.post('/:slug/ask', async (req, res) => {
  try {
    const { slug } = req.params;
    const { question } = req.body;
    
    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Get regulation details
    const regulation = await prisma.regulation.findUnique({
      where: { slug },
      include: {
        regulator: true,
        amendments: {
          orderBy: { effectiveDate: 'desc' }
        }
      }
    });
    
    if (!regulation) {
      return res.status(404).json({ error: 'Regulation not found' });
    }
    
    // Import AI service
    const AIService = require('../services/aiService');
    
    // Generate context-aware response
    const answer = await AIService.answerRegulationQuestion(regulation, question);
    
    res.json({
      question,
      answer,
      regulation: {
        name: regulation.name,
        fullName: regulation.fullName
      }
    });
  } catch (error) {
    console.error('Error processing regulation Q&A:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

module.exports = router;