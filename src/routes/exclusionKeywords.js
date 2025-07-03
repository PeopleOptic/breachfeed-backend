const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateApiKey } = require('../middleware/auth');

// Get all exclusion keywords
router.get('/', authenticateApiKey, async (req, res) => {
  try {
    const { feedId, isActive } = req.query;
    
    const where = {};
    if (feedId !== undefined) {
      where.feedId = feedId === 'global' ? null : feedId;
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    const keywords = await prisma.exclusionKeyword.findMany({
      where,
      include: {
        feed: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(keywords);
  } catch (error) {
    console.error('Error fetching exclusion keywords:', error);
    res.status(500).json({ error: 'Failed to fetch exclusion keywords' });
  }
});

// Create new exclusion keyword
router.post('/', authenticateApiKey, async (req, res) => {
  try {
    const { keyword, feedId, isActive = true } = req.body;
    
    if (!keyword || keyword.trim().length === 0) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    // Check if keyword already exists for this feed
    const existing = await prisma.exclusionKeyword.findFirst({
      where: {
        keyword: keyword.toLowerCase(),
        feedId: feedId || null
      }
    });
    
    if (existing) {
      return res.status(400).json({ error: 'This keyword already exists for the specified feed' });
    }
    
    const exclusionKeyword = await prisma.exclusionKeyword.create({
      data: {
        keyword: keyword.toLowerCase(),
        feedId: feedId || null,
        isActive
      },
      include: {
        feed: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    res.status(201).json(exclusionKeyword);
  } catch (error) {
    console.error('Error creating exclusion keyword:', error);
    res.status(500).json({ error: 'Failed to create exclusion keyword' });
  }
});

// Update exclusion keyword
router.put('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { keyword, feedId, isActive } = req.body;
    
    const data = {};
    if (keyword !== undefined) data.keyword = keyword.toLowerCase();
    if (feedId !== undefined) data.feedId = feedId || null;
    if (isActive !== undefined) data.isActive = isActive;
    
    const exclusionKeyword = await prisma.exclusionKeyword.update({
      where: { id },
      data,
      include: {
        feed: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    res.json(exclusionKeyword);
  } catch (error) {
    console.error('Error updating exclusion keyword:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Exclusion keyword not found' });
    } else {
      res.status(500).json({ error: 'Failed to update exclusion keyword' });
    }
  }
});

// Delete exclusion keyword
router.delete('/:id', authenticateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.exclusionKeyword.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exclusion keyword:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Exclusion keyword not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete exclusion keyword' });
    }
  }
});

// Bulk create exclusion keywords
router.post('/bulk', authenticateApiKey, async (req, res) => {
  try {
    const { keywords, feedId } = req.body;
    
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'Keywords array is required' });
    }
    
    // Filter out duplicates and empty strings
    const uniqueKeywords = [...new Set(keywords.map(k => k.toLowerCase().trim()))].filter(k => k.length > 0);
    
    // Check for existing keywords
    const existing = await prisma.exclusionKeyword.findMany({
      where: {
        keyword: { in: uniqueKeywords },
        feedId: feedId || null
      },
      select: { keyword: true }
    });
    
    const existingKeywords = existing.map(e => e.keyword);
    const newKeywords = uniqueKeywords.filter(k => !existingKeywords.includes(k));
    
    if (newKeywords.length === 0) {
      return res.status(400).json({ 
        error: 'All keywords already exist for this feed',
        existing: existingKeywords 
      });
    }
    
    // Create new keywords
    const created = await prisma.exclusionKeyword.createMany({
      data: newKeywords.map(keyword => ({
        keyword,
        feedId: feedId || null,
        isActive: true
      }))
    });
    
    res.status(201).json({
      created: created.count,
      keywords: newKeywords,
      skipped: existingKeywords
    });
  } catch (error) {
    console.error('Error bulk creating exclusion keywords:', error);
    res.status(500).json({ error: 'Failed to create exclusion keywords' });
  }
});

module.exports = router;