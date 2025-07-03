const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateApiKey } = require('../middleware/auth');

// Sync entities from WordPress
router.post('/sync', authenticateApiKey, async (req, res) => {
  try {
    const { agencies, keywords, locations } = req.body;
    const results = {
      agencies: { created: 0, updated: 0, errors: [] },
      keywords: { created: 0, updated: 0, errors: [] },
      locations: { created: 0, updated: 0, errors: [] }
    };

    // Sync agencies
    if (agencies && Array.isArray(agencies)) {
      for (const agency of agencies) {
        try {
          // Check if agency already exists
          const existing = await prisma.agency.findUnique({
            where: { name: agency.name }
          });

          if (existing) {
            // Update existing agency
            await prisma.agency.update({
              where: { id: existing.id },
              data: {
                isActive: agency.isActive ?? true,
                acronym: agency.acronym || null,
                type: agency.type || 'GOVERNMENT',
                updatedAt: new Date()
              }
            });
            results.agencies.updated++;
          } else {
            // Create new agency
            await prisma.agency.create({
              data: {
                name: agency.name,
                acronym: agency.acronym || null,
                country: agency.country || 'US',
                type: agency.type || 'GOVERNMENT',
                isActive: agency.isActive ?? true
              }
            });
            results.agencies.created++;
          }
        } catch (error) {
          console.error(`Error syncing agency ${agency.name}:`, error);
          results.agencies.errors.push({
            name: agency.name,
            error: error.message
          });
        }
      }
    }

    // Sync keywords
    if (keywords && Array.isArray(keywords)) {
      for (const keyword of keywords) {
        try {
          // Check if keyword already exists
          const existing = await prisma.keyword.findUnique({
            where: { term: keyword.term }
          });

          if (existing) {
            // Update existing keyword
            await prisma.keyword.update({
              where: { id: existing.id },
              data: {
                category: keyword.category || existing.category,
                isActive: keyword.isActive ?? true,
                updatedAt: new Date()
              }
            });
            results.keywords.updated++;
          } else {
            // Create new keyword
            await prisma.keyword.create({
              data: {
                term: keyword.term,
                category: keyword.category || null,
                isActive: keyword.isActive ?? true
              }
            });
            results.keywords.created++;
          }
        } catch (error) {
          console.error(`Error syncing keyword ${keyword.term}:`, error);
          results.keywords.errors.push({
            term: keyword.term,
            error: error.message
          });
        }
      }
    }

    // Sync locations
    if (locations && Array.isArray(locations)) {
      for (const location of locations) {
        try {
          // Check if location already exists
          const existing = await prisma.location.findUnique({
            where: { name: location.name }
          });

          if (existing) {
            // Update existing location
            await prisma.location.update({
              where: { id: existing.id },
              data: {
                country: location.country || existing.country,
                region: location.region || existing.region,
                city: location.city || existing.city,
                coordinates: location.coordinates || existing.coordinates,
                isActive: location.isActive ?? true,
                updatedAt: new Date()
              }
            });
            results.locations.updated++;
          } else {
            // Create new location
            await prisma.location.create({
              data: {
                name: location.name,
                country: location.country || 'US',
                region: location.region || null,
                city: location.city || null,
                coordinates: location.coordinates || null,
                isActive: location.isActive ?? true
              }
            });
            results.locations.created++;
          }
        } catch (error) {
          console.error(`Error syncing location ${location.name}:`, error);
          results.locations.errors.push({
            name: location.name,
            error: error.message
          });
        }
      }
    }

    // Get updated counts
    const counts = await prisma.$transaction([
      prisma.agency.count(),
      prisma.keyword.count(),
      prisma.location.count()
    ]);

    res.json({
      success: true,
      message: 'Entity synchronization completed',
      results,
      totalCounts: {
        agencies: counts[0],
        keywords: counts[1],
        locations: counts[2]
      }
    });

  } catch (error) {
    console.error('Entity sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync entities',
      error: error.message
    });
  }
});

// Get current entity counts
router.get('/counts', authenticateApiKey, async (req, res) => {
  try {
    const counts = await prisma.$transaction([
      prisma.company.count(),
      prisma.agency.count(),
      prisma.keyword.count(),
      prisma.location.count()
    ]);

    res.json({
      success: true,
      counts: {
        companies: counts[0],
        agencies: counts[1],
        keywords: counts[2],
        locations: counts[3]
      }
    });
  } catch (error) {
    console.error('Error getting entity counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get entity counts',
      error: error.message
    });
  }
});

module.exports = router;