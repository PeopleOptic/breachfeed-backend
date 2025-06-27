const express = require('express');
const { PrismaClient } = require('@prisma/client');
const Joi = require('joi');
const { authenticateApiKey } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();
const prisma = new PrismaClient();

// Get all companies with basic info
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        industry: true,
        website: true,
        logo: true,
        createdAt: true
      }
    });
    
    res.json(companies);
  } catch (error) {
    next(error);
  }
});

// Get company profile with incident history
router.get('/:id/profile', authenticateApiKey, async (req, res, next) => {
  try {
    const companyId = req.params.id;
    console.log(`Fetching company profile for ID: ${companyId}`);
    
    // Get company details
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        matchedCompanies: {
          include: {
            article: {
              include: {
                feed: {
                  select: { name: true }
                }
              }
            }
          },
          orderBy: {
            article: {
              publishedAt: 'desc'
            }
          }
        }
      }
    });
    
    if (!company) {
      console.log(`Company not found for ID: ${companyId}`);
      return res.status(404).json({ error: 'Company not found' });
    }
    
    console.log(`Found company: ${company.name}`);
    
    // Get articles that mention this company (including aliases)
    // Handle cases where aliases might be null or undefined
    const aliases = company.aliases || [];
    const searchTerms = [company.name, ...aliases];
    const mentionedArticles = await prisma.article.findMany({
      where: {
        OR: searchTerms.map(term => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { content: { contains: term, mode: 'insensitive' } }
          ]
        }))
      },
      include: {
        feed: {
          select: { name: true }
        }
      },
      orderBy: { publishedAt: 'desc' },
      take: 50 // Limit to recent mentions
    });
    
    // Identify incident articles (articles with breach-related keywords or high severity)
    const incidents = company.matchedCompanies
      .map(match => ({
        date: match.article.publishedAt,
        title: match.article.title,
        link: match.article.link,
        description: match.article.description,
        severity: match.article.severity,
        source: match.article.feed.name,
        matchContext: match.matchContext,
        categories: match.article.categories
      }))
      .filter(incident => {
        // Filter for actual security incidents
        const incidentKeywords = ['breach', 'hack', 'attack', 'compromise', 'leak', 'ransomware', 'malware', 'vulnerability'];
        const hasIncidentKeyword = incidentKeywords.some(keyword => 
          incident.title.toLowerCase().includes(keyword) ||
          (incident.description && incident.description.toLowerCase().includes(keyword)) ||
          incident.categories.some(cat => cat.toLowerCase().includes(keyword))
        );
        return hasIncidentKeyword || ['HIGH', 'CRITICAL'].includes(incident.severity);
      });
    
    // Get recent mentions (non-incident articles)
    const recentMentions = mentionedArticles
      .filter(article => {
        // Exclude articles already identified as incidents
        return !incidents.some(incident => incident.link === article.link);
      })
      .slice(0, 20)
      .map(article => ({
        date: article.publishedAt,
        title: article.title,
        link: article.link,
        description: article.description,
        source: article.feed.name,
        categories: article.categories
      }));
    
    // Calculate incident statistics
    const incidentStats = {
      total: incidents.length,
      bySeverity: {
        critical: incidents.filter(i => i.severity === 'CRITICAL').length,
        high: incidents.filter(i => i.severity === 'HIGH').length,
        medium: incidents.filter(i => i.severity === 'MEDIUM').length,
        low: incidents.filter(i => i.severity === 'LOW').length
      },
      lastIncident: incidents.length > 0 ? incidents[0].date : null,
      yearlyBreakdown: getYearlyBreakdown(incidents)
    };
    
    res.json({
      company: {
        id: company.id,
        name: company.name,
        aliases: company.aliases || [],
        description: company.description || null,
        industry: company.industry || null,
        website: company.website || null,
        headquarters: company.headquarters || null,
        foundedYear: company.foundedYear || null,
        employees: company.employees || null,
        logo: company.logo || null,
        domain: company.domain || null
      },
      incidents,
      incidentStats,
      recentMentions,
      totalMentions: mentionedArticles.length
    });
    
  } catch (error) {
    console.error(`Error in company profile endpoint for ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Get company by name or alias (for public pages)
router.get('/by-name/:name', authenticateApiKey, async (req, res, next) => {
  try {
    const searchName = decodeURIComponent(req.params.name);
    
    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { name: { equals: searchName, mode: 'insensitive' } },
          { aliases: { has: searchName } }
        ],
        isActive: true
      }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Instead of redirect, fetch and return the profile data directly
    // Get company details with full profile data
    const fullCompany = await prisma.company.findUnique({
      where: { id: company.id },
      include: {
        matchedCompanies: {
          include: {
            article: {
              include: {
                feed: {
                  select: { name: true }
                }
              }
            }
          },
          orderBy: {
            article: {
              publishedAt: 'desc'
            }
          }
        }
      }
    });
    
    // Get articles that mention this company (including aliases)
    const searchTerms = [fullCompany.name, ...fullCompany.aliases];
    const mentionedArticles = await prisma.article.findMany({
      where: {
        OR: searchTerms.map(term => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { content: { contains: term, mode: 'insensitive' } }
          ]
        }))
      },
      include: {
        feed: {
          select: { name: true }
        }
      },
      orderBy: { publishedAt: 'desc' },
      take: 50 // Limit to recent mentions
    });
    
    // Identify incident articles
    const incidents = fullCompany.matchedCompanies
      .map(match => ({
        date: match.article.publishedAt,
        title: match.article.title,
        link: match.article.link,
        description: match.article.description,
        severity: match.article.severity,
        source: match.article.feed.name,
        matchContext: match.matchContext,
        categories: match.article.categories
      }))
      .filter(incident => {
        const incidentKeywords = ['breach', 'hack', 'attack', 'compromise', 'leak', 'ransomware', 'malware', 'vulnerability'];
        const hasIncidentKeyword = incidentKeywords.some(keyword => 
          incident.title.toLowerCase().includes(keyword) ||
          (incident.description && incident.description.toLowerCase().includes(keyword)) ||
          incident.categories.some(cat => cat.toLowerCase().includes(keyword))
        );
        return hasIncidentKeyword || ['HIGH', 'CRITICAL'].includes(incident.severity);
      });
    
    // Get recent mentions (non-incident articles)
    const recentMentions = mentionedArticles
      .filter(article => {
        return !incidents.some(incident => incident.link === article.link);
      })
      .slice(0, 20)
      .map(article => ({
        date: article.publishedAt,
        title: article.title,
        link: article.link,
        description: article.description,
        source: article.feed.name,
        categories: article.categories
      }));
    
    // Calculate incident statistics
    const incidentStats = {
      total: incidents.length,
      bySeverity: {
        critical: incidents.filter(i => i.severity === 'CRITICAL').length,
        high: incidents.filter(i => i.severity === 'HIGH').length,
        medium: incidents.filter(i => i.severity === 'MEDIUM').length,
        low: incidents.filter(i => i.severity === 'LOW').length
      },
      lastIncident: incidents.length > 0 ? incidents[0].date : null,
      yearlyBreakdown: getYearlyBreakdown(incidents)
    };
    
    res.json({
      company: {
        id: fullCompany.id,
        name: fullCompany.name,
        aliases: fullCompany.aliases,
        description: fullCompany.description,
        industry: fullCompany.industry,
        website: fullCompany.website,
        headquarters: fullCompany.headquarters,
        foundedYear: fullCompany.foundedYear,
        employees: fullCompany.employees,
        logo: fullCompany.logo,
        domain: fullCompany.domain
      },
      incidents,
      incidentStats,
      recentMentions,
      totalMentions: mentionedArticles.length
    });
    
  } catch (error) {
    next(error);
  }
});

// Helper function to get yearly breakdown of incidents
function getYearlyBreakdown(incidents) {
  const breakdown = {};
  
  incidents.forEach(incident => {
    const year = new Date(incident.date).getFullYear();
    if (!breakdown[year]) {
      breakdown[year] = 0;
    }
    breakdown[year]++;
  });
  
  return breakdown;
}

module.exports = router;