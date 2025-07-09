const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Get all regulators
router.get('/', async (req, res) => {
  try {
    const { isActive = true } = req.query;
    
    const regulators = await prisma.regulator.findMany({
      where: {
        isActive: isActive === 'true'
      },
      include: {
        _count: {
          select: {
            regulations: true
          }
        }
      },
      orderBy: {
        acronym: 'asc'
      }
    });
    
    res.json(regulators);
  } catch (error) {
    console.error('Error fetching regulators:', error);
    res.status(500).json({ error: 'Failed to fetch regulators' });
  }
});

// Get regulator by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const regulator = await prisma.regulator.findUnique({
      where: { slug },
      include: {
        regulations: {
          where: { isActive: true },
          orderBy: { name: 'asc' }
        }
      }
    });
    
    if (!regulator) {
      return res.status(404).json({ error: 'Regulator not found' });
    }
    
    res.json({ regulator });
  } catch (error) {
    console.error('Error fetching regulator:', error);
    res.status(500).json({ error: 'Failed to fetch regulator' });
  }
});

// Get regulator by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const regulator = await prisma.regulator.findUnique({
      where: { id },
      include: {
        regulations: {
          where: { isActive: true },
          orderBy: { name: 'asc' }
        }
      }
    });
    
    if (!regulator) {
      return res.status(404).json({ error: 'Regulator not found' });
    }
    
    res.json({ regulator });
  } catch (error) {
    console.error('Error fetching regulator:', error);
    res.status(500).json({ error: 'Failed to fetch regulator' });
  }
});

// Admin routes (require authentication in production)
// Create new regulator
router.post('/admin', async (req, res) => {
  try {
    const {
      acronym,
      fullName,
      slug,
      description,
      website,
      establishedDate,
      jurisdiction
    } = req.body;
    
    // Validate required fields
    if (!acronym || !fullName || !slug) {
      return res.status(400).json({ 
        error: 'Missing required fields: acronym, fullName, slug' 
      });
    }
    
    // Check if slug already exists
    const existingRegulator = await prisma.regulator.findUnique({
      where: { slug }
    });
    
    if (existingRegulator) {
      return res.status(409).json({ error: 'Regulator with this slug already exists' });
    }
    
    const regulator = await prisma.regulator.create({
      data: {
        acronym,
        fullName,
        slug,
        description,
        website,
        establishedDate: establishedDate ? new Date(establishedDate) : null,
        jurisdiction
      }
    });
    
    res.status(201).json({ regulator });
  } catch (error) {
    console.error('Error creating regulator:', error);
    res.status(500).json({ error: 'Failed to create regulator' });
  }
});

// Update regulator
router.put('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      acronym,
      fullName,
      slug,
      description,
      website,
      establishedDate,
      jurisdiction,
      isActive
    } = req.body;
    
    // Check if regulator exists
    const existingRegulator = await prisma.regulator.findUnique({
      where: { id }
    });
    
    if (!existingRegulator) {
      return res.status(404).json({ error: 'Regulator not found' });
    }
    
    // If slug is being changed, check for conflicts
    if (slug && slug !== existingRegulator.slug) {
      const slugConflict = await prisma.regulator.findUnique({
        where: { slug }
      });
      
      if (slugConflict) {
        return res.status(409).json({ error: 'Slug already in use' });
      }
    }
    
    const regulator = await prisma.regulator.update({
      where: { id },
      data: {
        ...(acronym !== undefined && { acronym }),
        ...(fullName !== undefined && { fullName }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(website !== undefined && { website }),
        ...(establishedDate !== undefined && { 
          establishedDate: establishedDate ? new Date(establishedDate) : null 
        }),
        ...(jurisdiction !== undefined && { jurisdiction }),
        ...(isActive !== undefined && { isActive })
      }
    });
    
    res.json({ regulator });
  } catch (error) {
    console.error('Error updating regulator:', error);
    res.status(500).json({ error: 'Failed to update regulator' });
  }
});

// Delete regulator (soft delete)
router.delete('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if regulator has active regulations
    const regulationsCount = await prisma.regulation.count({
      where: {
        regulatorId: id,
        isActive: true
      }
    });
    
    if (regulationsCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete regulator with active regulations' 
      });
    }
    
    const regulator = await prisma.regulator.update({
      where: { id },
      data: { isActive: false }
    });
    
    res.json({ message: 'Regulator deactivated successfully', regulator });
  } catch (error) {
    console.error('Error deleting regulator:', error);
    res.status(500).json({ error: 'Failed to delete regulator' });
  }
});

module.exports = router;