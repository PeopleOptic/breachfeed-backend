const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateApiKey } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Get dashboard statistics for the user
 * This endpoint works with API key authentication from WordPress
 */
router.get('/stats', authenticateApiKey, async (req, res, next) => {
  try {
    // For now, get overall system stats since we're using API key auth
    // In the future, this could be user-specific with proper user context
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get various statistics
    const [
      totalActiveCompanies,
      totalActiveKeywords,
      articlesToday,
      highSeverityIncidents,
      totalNotificationsSent,
      recentIncidents
    ] = await Promise.all([
      // Active companies
      prisma.company.count({
        where: { isActive: true }
      }),
      
      // Active keywords  
      prisma.keyword.count({
        where: { isActive: true }
      }),
      
      // Articles published today
      prisma.article.count({
        where: {
          publishedAt: {
            gte: todayStart
          }
        }
      }),
      
      // High severity incidents today
      prisma.article.count({
        where: {
          publishedAt: {
            gte: todayStart
          },
          severity: {
            in: ['HIGH', 'CRITICAL']
          }
        }
      }),
      
      // Total notifications sent (last 30 days)
      prisma.notification.count({
        where: {
          sentAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          },
          status: 'SENT'
        }
      }),
      
      // Recent incidents for overview - simplified query
      prisma.article.findMany({
        where: {
          severity: {
            in: ['MEDIUM', 'HIGH', 'CRITICAL']
          }
        },
        select: {
          id: true,
          title: true,
          link: true,
          description: true,
          severity: true,
          publishedAt: true,
          imageUrl: true,
          summary: true,
          recommendations: true,
          feed: {
            select: { name: true }
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 10
      })
    ]);
    
    // Calculate weekly trend
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const articlesThisWeek = await prisma.article.count({
      where: {
        publishedAt: {
          gte: weekAgo
        }
      }
    });
    
    const articlesLastWeek = await prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000),
          lt: weekAgo
        }
      }
    });
    
    const weeklyTrend = articlesLastWeek > 0 ? 
      ((articlesThisWeek - articlesLastWeek) / articlesLastWeek * 100).toFixed(1) : 0;
    
    res.json({
      stats: {
        activeSubscriptions: totalActiveCompanies + totalActiveKeywords, // Approximate
        incidentsToday: articlesToday,
        highSeverity: highSeverityIncidents,
        notificationsSent: totalNotificationsSent
      },
      trends: {
        weeklyIncidents: articlesThisWeek,
        weeklyChange: weeklyTrend
      },
      recentIncidents: recentIncidents.map(article => ({
        id: article.id,
        title: article.title,
        link: article.link,
        description: article.description,
        severity: article.severity,
        publishedAt: article.publishedAt,
        source: article.feed?.name || 'Unknown',
        imageUrl: article.imageUrl,
        summary: article.summary,
        recommendations: article.recommendations,
        matchedKeywords: [],  // Simplified - no nested data
        matchedCompanies: []  // Simplified - no nested data
      }))
    });
    
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    next(error);
  }
});

/**
 * Get user-specific feed based on WordPress user email or other identifier
 * This endpoint accepts a user identifier to personalize the feed
 */
router.get('/user-feed', authenticateApiKey, async (req, res, next) => {
  try {
    const {
      user_email,
      severity,
      alertType,
      days = 7,
      limit = 20,
      page = 1
    } = req.query;
    
    let articles = [];
    
    if (user_email) {
      // Get user subscriptions based on email
      const user = await prisma.user.findUnique({
        where: { email: user_email },
        include: {
          subscriptions: {
            where: { isActive: true },
            include: {
              company: true,
              keyword: true,
              agency: true,
              location: true
            }
          }
        }
      });
      
      if (user && user.subscriptions.length > 0) {
        // Get targetIds for each subscription type
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
        
        // Build query conditions
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
          // Build complete where clause
          const where = {
            OR: whereConditions
          };
          
          // Add time filter
          if (days) {
            const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            where.publishedAt = { gte: startDate };
          }
          
          // Add severity filter
          if (severity) {
            where.severity = severity;
          }
          
          // Add alert type filter
          if (alertType) {
            where.alertType = alertType;
          }
          
          articles = await prisma.article.findMany({
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
            take: parseInt(limit),
            orderBy: { publishedAt: 'desc' }
          });
        }
      }
    }
    
    // Fallback: get recent high-impact articles if no user-specific feed
    if (articles.length === 0) {
      const where = {
        severity: {
          in: ['MEDIUM', 'HIGH', 'CRITICAL']
        }
      };
      
      if (days) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        where.publishedAt = { gte: startDate };
      }
      
      if (severity) {
        where.severity = severity;
      }
      
      if (alertType) {
        where.alertType = alertType;
      }
      
      articles = await prisma.article.findMany({
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
        take: parseInt(limit),
        orderBy: { publishedAt: 'desc' }
      });
    }
    
    // Format articles for frontend
    const formattedArticles = articles.map(article => ({
      id: article.id,
      title: article.title,
      link: article.link,
      description: article.description,
      content: article.content,
      publishedAt: article.publishedAt,
      severity: article.severity,
      imageUrl: article.imageUrl,
      summary: article.summary,
      recommendations: article.recommendations,
      categories: article.categories,
      alertType: article.alertType,
      classificationConfidence: article.classificationConfidence,
      feed: article.feed,
      matchedKeywords: article.matchedKeywords.map(mk => ({
        keyword: mk.keyword,
        matchContext: mk.matchContext
      })),
      matchedCompanies: article.matchedCompanies.map(mc => ({
        company: mc.company,
        matchContext: mc.matchContext,
        confidence: mc.confidence
      })),
      matchedAgencies: article.matchedAgencies?.map(ma => ({
        agency: ma.agency,
        matchContext: ma.matchContext,
        confidence: ma.confidence
      })) || [],
      matchedLocations: article.matchedLocations?.map(ml => ({
        location: ml.location,
        matchContext: ml.matchContext,
        confidence: ml.confidence
      })) || []
    }));
    
    res.json(formattedArticles);
    
  } catch (error) {
    console.error('Error fetching user feed:', error);
    next(error);
  }
});

/**
 * Get recent incidents for dashboard overview
 */
router.get('/incidents/recent', authenticateApiKey, async (req, res, next) => {
  try {
    const { limit = 5, severity } = req.query;
    
    const where = {};
    
    if (severity) {
      where.severity = severity;
    } else {
      // Default to medium+ severity for relevance
      where.severity = {
        in: ['MEDIUM', 'HIGH', 'CRITICAL']
      };
    }
    
    const incidents = await prisma.article.findMany({
      where,
      include: {
        feed: {
          select: { name: true }
        },
        matchedKeywords: {
          include: { keyword: true }
        },
        matchedCompanies: {
          include: { company: true }
        }
      },
      orderBy: { publishedAt: 'desc' },
      take: parseInt(limit)
    });
    
    const formattedIncidents = incidents.map(article => ({
      id: article.id,
      title: article.title,
      link: article.link,
      description: article.description,
      severity: article.severity,
      publishedAt: article.publishedAt,
      source: article.feed.name,
      imageUrl: article.imageUrl,
      summary: article.summary,
      matches: [
        ...article.matchedKeywords.map(mk => ({
          type: 'KEYWORD',
          name: mk.keyword.term,
          context: mk.matchContext
        })),
        ...article.matchedCompanies.map(mc => ({
          type: 'COMPANY', 
          name: mc.company.name,
          context: mc.matchContext
        }))
      ]
    }));
    
    res.json(formattedIncidents);
    
  } catch (error) {
    console.error('Error fetching recent incidents:', error);
    next(error);
  }
});

module.exports = router;