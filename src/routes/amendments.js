const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Get amendment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const amendment = await prisma.amendment.findUnique({
      where: { id },
      include: {
        regulation: {
          include: {
            regulator: true
          }
        }
      }
    });
    
    if (!amendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }
    
    res.json({ amendment });
  } catch (error) {
    console.error('Error fetching amendment:', error);
    res.status(500).json({ error: 'Failed to fetch amendment' });
  }
});

// Admin routes (require authentication in production)
// Update amendment
router.put('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      effectiveDate,
      changes,
      pdfUrl
    } = req.body;
    
    // Check if amendment exists
    const existingAmendment = await prisma.amendment.findUnique({
      where: { id }
    });
    
    if (!existingAmendment) {
      return res.status(404).json({ error: 'Amendment not found' });
    }
    
    // Prepare update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (effectiveDate !== undefined) updateData.effectiveDate = new Date(effectiveDate);
    if (changes !== undefined) updateData.changes = changes;
    if (pdfUrl !== undefined) updateData.pdfUrl = pdfUrl;
    
    const amendment = await prisma.amendment.update({
      where: { id },
      data: updateData,
      include: {
        regulation: true
      }
    });
    
    res.json({ amendment });
  } catch (error) {
    console.error('Error updating amendment:', error);
    res.status(500).json({ error: 'Failed to update amendment' });
  }
});

// Delete amendment
router.delete('/admin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.amendment.delete({
      where: { id }
    });
    
    res.json({ message: 'Amendment deleted successfully' });
  } catch (error) {
    console.error('Error deleting amendment:', error);
    res.status(500).json({ error: 'Failed to delete amendment' });
  }
});

module.exports = router;