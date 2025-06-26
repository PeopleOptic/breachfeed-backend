const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's notification history
router.get('/', authenticateJWT, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // PENDING, SENT, FAILED
    
    const where = { userId: req.userId };
    if (status) {
      where.status = status;
    }
    
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          article: {
            include: {
              feed: {
                select: { id: true, name: true }
              }
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.notification.count({ where })
    ]);
    
    res.json({
      notifications,
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

// Get notification statistics
router.get('/stats', authenticateJWT, async (req, res, next) => {
  try {
    const [total, sent, failed, byType] = await Promise.all([
      prisma.notification.count({
        where: { userId: req.userId }
      }),
      prisma.notification.count({
        where: { userId: req.userId, status: 'SENT' }
      }),
      prisma.notification.count({
        where: { userId: req.userId, status: 'FAILED' }
      }),
      prisma.notification.groupBy({
        by: ['type', 'status'],
        where: { userId: req.userId },
        _count: true
      })
    ]);
    
    res.json({
      total,
      sent,
      failed,
      byType
    });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read/acknowledged
router.post('/:id/acknowledge', authenticateJWT, async (req, res, next) => {
  try {
    // Verify ownership
    const notification = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // You could add an "acknowledged" field to track this
    res.json({ message: 'Notification acknowledged' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;