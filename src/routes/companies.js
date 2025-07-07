const express = require('express');
const { getPrismaClient } = require('../utils/database');
const Joi = require('joi');
const { authenticateApiKey } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const AIService = require('../services/aiService');

const router = express.Router();
const prisma = getPrismaClient();

// Debug endpoint to check company schema
router.get('/debug/schema', authenticateApiKey, async (req, res, next) => {
  try {
    // Try to get a single company with all possible fields
    const sampleCompany = await prisma.company.findFirst({
      where: { isActive: true }
    });
    
    if (!sampleCompany) {
      return res.json({ message: 'No companies found' });
    }
    
    res.json({
      sampleCompany,
      availableFields: Object.keys(sampleCompany),
      hasNewFields: {
        hasDescription: 'description' in sampleCompany,
        hasIndustry: 'industry' in sampleCompany,
        hasWebsite: 'website' in sampleCompany,
        hasHeadquarters: 'headquarters' in sampleCompany,
        hasFoundedYear: 'foundedYear' in sampleCompany,
        hasEmployees: 'employees' in sampleCompany,
        hasLogo: 'logo' in sampleCompany
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Schema check failed',
      details: error.message 
    });
  }
});

// Get all companies with basic info
router.get('/', authenticateApiKey, async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        domain: true,
        aliases: true,
        // Only select new fields if they exist, use fallbacks if not
        industry: true,
        website: true,
        logo: true,
        createdAt: true
      }
    });
    
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    // If the error is about unknown columns, return basic company data
    if (error.message && error.message.includes('Unknown column')) {
      try {
        const basicCompanies = await prisma.company.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            domain: true,
            aliases: true,
            createdAt: true
          }
        });
        res.json(basicCompanies);
      } catch (basicError) {
        next(basicError);
      }
    } else {
      next(error);
    }
  }
});

// Get company by slug/name
router.get('/slug/:slug', authenticateApiKey, async (req, res, next) => {
  try {
    const { slug } = req.params;
    console.log(`Fetching company by slug: ${slug}`);
    
    // Try to find by name (companies don't have slug field yet)
    let company = await prisma.company.findFirst({
      where: { 
        name: {
          equals: slug.replace(/-/g, ' '),
          mode: 'insensitive'
        }
      }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Get related articles mentioning this company
    const articles = await prisma.article.findMany({
      where: {
        companies: {
          some: {
            id: company.id
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
        }
      },
      orderBy: { publishedAt: 'desc' },
      take: 50
    });
    
    // Get AI profile if available
    const aiService = new AIService();
    const aiProfile = await aiService.getCompanyProfile(company.name);
    
    // Calculate incident stats
    const incidents = articles.filter(a => 
      a.severity === 'CRITICAL' || 
      a.severity === 'HIGH' ||
      a.alertType === 'CONFIRMED_BREACH' ||
      a.alertType === 'SECURITY_INCIDENT'
    );
    
    const incidentStats = {
      bySeverity: {
        critical: incidents.filter(a => a.severity === 'CRITICAL').length,
        high: incidents.filter(a => a.severity === 'HIGH').length,
        medium: incidents.filter(a => a.severity === 'MEDIUM').length,
        low: incidents.filter(a => a.severity === 'LOW').length
      },
      lastIncident: incidents.length > 0 ? incidents[0].publishedAt : null
    };
    
    res.json({
      company,
      articles,
      aiProfile,
      incidents: incidents.map(article => ({
        id: article.id,
        title: article.title,
        description: article.description,
        link: article.link,
        date: article.publishedAt,
        severity: article.severity,
        source: article.feed.name,
        categories: article.categories
      })),
      incidentStats,
      recentMentions: articles.slice(0, 20)
    });
  } catch (error) {
    console.error('Error fetching company by slug:', error);
    next(error);
  }
});

// Get company profile with incident history
router.get('/:id/profile', authenticateApiKey, async (req, res, next) => {
  try {
    const companyId = req.params.id;
    console.log(`Fetching company profile for ID: ${companyId}`);
    
    // Get basic company details first (simple query)
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });
    
    if (!company) {
      console.log(`Company not found for ID: ${companyId}`);
      return res.status(404).json({ error: 'Company not found' });
    }
    
    console.log(`Found company: ${company.name}`);
    
    // Get matched companies separately to avoid complex nested queries
    let matchedCompanies = [];
    try {
      const matches = await prisma.matchedCompany.findMany({
        where: { companyId: companyId },
        orderBy: { createdAt: 'desc' },
        take: 100 // Limit results
      });
      
      // Get articles for matched companies in batches
      const articleIds = matches.map(m => m.articleId);
      if (articleIds.length > 0) {
        const articles = await prisma.article.findMany({
          where: { id: { in: articleIds } },
          include: {
            feed: {
              select: { name: true }
            }
          }
        });
        
        // Map articles to matches
        const articleMap = new Map(articles.map(a => [a.id, a]));
        matchedCompanies = matches.map(match => ({
          ...match,
          article: articleMap.get(match.articleId)
        })).filter(m => m.article);
      }
    } catch (error) {
      console.error('Error fetching matched companies:', error);
      // Continue without matched companies if query fails
    }
    
    // Get articles that mention this company (including aliases) - simplified query
    const aliases = company.aliases || [];
    const searchTerms = [company.name, ...aliases];
    let mentionedArticles = [];
    
    try {
      // Use simpler query without complex OR conditions
      mentionedArticles = await prisma.article.findMany({
        where: {
          OR: searchTerms.flatMap(term => [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } }
          ])
        },
        select: {
          id: true,
          title: true,
          link: true,
          description: true,
          publishedAt: true,
          severity: true,
          categories: true,
          feed: {
            select: { name: true }
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 50 // Limit to recent mentions
      });
    } catch (error) {
      console.error('Error fetching mentioned articles:', error);
      // Continue without mentioned articles if query fails
    }
    
    // Identify incident articles (articles with breach-related keywords or high severity)
    const incidents = matchedCompanies
      .map(match => {
        try {
          if (!match.article) return null;
          return {
            date: match.article.publishedAt,
            title: match.article.title,
            link: match.article.link,
            description: match.article.description,
            severity: match.article.severity,
            source: match.article.feed?.name || 'Unknown',
            matchContext: match.matchContext,
            categories: match.article.categories || []
          };
        } catch (e) {
          console.log('Error mapping incident:', e);
          return null;
        }
      })
      .filter(Boolean)
      .filter(incident => {
        // Filter for actual security incidents
        const incidentKeywords = ['breach', 'hack', 'attack', 'compromise', 'leak', 'ransomware', 'malware', 'vulnerability'];
        const hasIncidentKeyword = incidentKeywords.some(keyword => 
          incident.title.toLowerCase().includes(keyword) ||
          (incident.description && incident.description.toLowerCase().includes(keyword)) ||
          (incident.categories && Array.isArray(incident.categories) && incident.categories.some(cat => cat.toLowerCase().includes(keyword)))
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
    
    // Generate AI-powered company profile
    let aiProfile = null;
    try {
      const relevantArticles = [...incidents, ...recentMentions].slice(0, 10);
      aiProfile = await AIService.generateCompanyProfile(company.name, relevantArticles);
      console.log(`Generated AI profile for ${company.name}:`, aiProfile);
    } catch (error) {
      console.error('Error generating AI profile:', error);
    }
    
    res.json({
      company: {
        id: company.id,
        name: company.name,
        aliases: company.aliases || [],
        description: company.description || aiProfile?.description || null,
        industry: company.industry || aiProfile?.industry || null,
        website: company.website || aiProfile?.website || null,
        headquarters: company.headquarters || aiProfile?.headquarters || null,
        foundedYear: company.foundedYear || aiProfile?.founded || null,
        employees: company.employees || aiProfile?.employees || null,
        logo: company.logo || null,
        domain: company.domain || null
      },
      aiProfile,
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

// Minimal profile endpoint for testing
router.get('/:id/profile-minimal', authenticateApiKey, async (req, res, next) => {
  try {
    const companyId = req.params.id;
    
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
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
      incidents: [],
      incidentStats: {
        total: 0,
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        lastIncident: null,
        yearlyBreakdown: {}
      },
      recentMentions: [],
      totalMentions: 0
    });
  } catch (error) {
    console.error('Error in minimal profile:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get company by name or alias (for public pages)
router.get('/by-name/:name', authenticateApiKey, async (req, res, next) => {
  try {
    const searchName = decodeURIComponent(req.params.name);
    
    // Simple query to find company
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
    
    // Get matched companies separately
    let matchedCompanies = [];
    try {
      const matches = await prisma.matchedCompany.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      
      const articleIds = matches.map(m => m.articleId);
      if (articleIds.length > 0) {
        const articles = await prisma.article.findMany({
          where: { id: { in: articleIds } },
          include: {
            feed: {
              select: { name: true }
            }
          }
        });
        
        const articleMap = new Map(articles.map(a => [a.id, a]));
        matchedCompanies = matches.map(match => ({
          ...match,
          article: articleMap.get(match.articleId)
        })).filter(m => m.article);
      }
    } catch (error) {
      console.error('Error fetching matched companies:', error);
    }
    
    // Get articles that mention this company - simplified
    const searchTerms = [company.name, ...(company.aliases || [])];
    let mentionedArticles = [];
    
    try {
      mentionedArticles = await prisma.article.findMany({
        where: {
          OR: searchTerms.flatMap(term => [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } }
          ])
        },
        select: {
          id: true,
          title: true,
          link: true,
          description: true,
          publishedAt: true,
          severity: true,
          categories: true,
          feed: {
            select: { name: true }
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 50
      });
    } catch (error) {
      console.error('Error fetching mentioned articles:', error);
    }
    
    // Identify incident articles
    const incidents = matchedCompanies
      .map(match => {
        if (!match.article) return null;
        return {
          date: match.article.publishedAt,
          title: match.article.title,
          link: match.article.link,
          description: match.article.description,
          severity: match.article.severity,
          source: match.article.feed?.name || 'Unknown',
          matchContext: match.matchContext,
          categories: match.article.categories || []
        };
      })
      .filter(Boolean)
      .filter(incident => {
        const incidentKeywords = ['breach', 'hack', 'attack', 'compromise', 'leak', 'ransomware', 'malware', 'vulnerability'];
        const hasIncidentKeyword = incidentKeywords.some(keyword => 
          incident.title.toLowerCase().includes(keyword) ||
          (incident.description && incident.description.toLowerCase().includes(keyword)) ||
          (incident.categories && Array.isArray(incident.categories) && incident.categories.some(cat => cat.toLowerCase().includes(keyword)))
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
    
    // Generate AI-powered company profile
    let aiProfile = null;
    try {
      const relevantArticles = [...incidents, ...recentMentions].slice(0, 10);
      aiProfile = await AIService.generateCompanyProfile(company.name, relevantArticles);
      console.log(`Generated AI profile for ${fullCompany.name}:`, aiProfile);
    } catch (error) {
      console.error('Error generating AI profile:', error);
    }
    
    res.json({
      company: {
        id: fullCompany.id,
        name: fullCompany.name,
        aliases: fullCompany.aliases,
        description: fullCompany.description || aiProfile?.description,
        industry: fullCompany.industry || aiProfile?.industry,
        website: fullCompany.website || aiProfile?.website,
        headquarters: fullCompany.headquarters || aiProfile?.headquarters,
        foundedYear: fullCompany.foundedYear || aiProfile?.founded,
        employees: fullCompany.employees || aiProfile?.employees,
        logo: fullCompany.logo,
        domain: fullCompany.domain
      },
      aiProfile,
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