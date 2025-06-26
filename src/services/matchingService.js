const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const AIService = require('./aiService');

const prisma = new PrismaClient();

async function matchArticleKeywords(article) {
  try {
    const matches = [];
    
    // Get all active entities
    const [keywords, companies, agencies, locations] = await Promise.all([
      prisma.keyword.findMany({ where: { isActive: true } }),
      prisma.company.findMany({ where: { isActive: true } }),
      prisma.agency.findMany({ where: { isActive: true } }),
      prisma.location.findMany({ where: { isActive: true } })
    ]);
    
    // Combine title, description, and content for searching
    const searchText = `${article.title} ${article.description} ${article.content}`.toLowerCase();
    
    // Match keywords
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.term.toLowerCase()}\\b`, 'i');
      const match = searchText.match(regex);
      
      if (match) {
        const confidence = calculateMatchConfidence(match, keyword.term, searchText);
        const contextStart = Math.max(0, match.index - 100);
        const contextEnd = Math.min(searchText.length, match.index + keyword.term.length + 100);
        const matchContext = searchText.substring(contextStart, contextEnd).trim();
        
        await prisma.matchedKeyword.create({
          data: {
            articleId: article.id,
            keywordId: keyword.id,
            matchContext: matchContext
          }
        });
        
        matches.push({
          type: 'keyword',
          id: keyword.id,
          term: keyword.term,
          context: matchContext,
          confidence
        });
      }
    }
    
    // Match companies (including aliases)
    for (const company of companies) {
      const companyTerms = [company.name, ...company.aliases];
      let bestMatch = null;
      let bestConfidence = 0;
      
      for (const term of companyTerms) {
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
        const match = searchText.match(regex);
        
        if (match) {
          const confidence = calculateMatchConfidence(match, term, searchText);
          if (confidence > bestConfidence) {
            bestMatch = { match, term, confidence };
            bestConfidence = confidence;
          }
        }
      }
      
      if (bestMatch) {
        const contextStart = Math.max(0, bestMatch.match.index - 100);
        const contextEnd = Math.min(searchText.length, bestMatch.match.index + bestMatch.term.length + 100);
        const matchContext = searchText.substring(contextStart, contextEnd).trim();
        
        await prisma.matchedCompany.create({
          data: {
            articleId: article.id,
            companyId: company.id,
            matchContext: matchContext,
            confidence: bestMatch.confidence
          }
        });
        
        matches.push({
          type: 'company',
          id: company.id,
          term: bestMatch.term,
          companyName: company.name,
          context: matchContext,
          confidence: bestMatch.confidence
        });
      }
    }
    
    // Match agencies
    for (const agency of agencies) {
      const agencyTerms = [agency.name];
      if (agency.acronym) agencyTerms.push(agency.acronym);
      
      for (const term of agencyTerms) {
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
        const match = searchText.match(regex);
        
        if (match) {
          const confidence = calculateMatchConfidence(match, term, searchText);
          const contextStart = Math.max(0, match.index - 100);
          const contextEnd = Math.min(searchText.length, match.index + term.length + 100);
          const matchContext = searchText.substring(contextStart, contextEnd).trim();
          
          await prisma.matchedAgency.create({
            data: {
              articleId: article.id,
              agencyId: agency.id,
              matchContext: matchContext,
              confidence
            }
          });
          
          matches.push({
            type: 'agency',
            id: agency.id,
            term: term,
            agencyName: agency.name,
            context: matchContext,
            confidence
          });
          break;
        }
      }
    }
    
    // Match locations
    for (const location of locations) {
      const locationTerms = [location.name];
      if (location.city) locationTerms.push(location.city);
      if (location.region) locationTerms.push(location.region);
      
      for (const term of locationTerms) {
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
        const match = searchText.match(regex);
        
        if (match) {
          const confidence = calculateMatchConfidence(match, term, searchText);
          const contextStart = Math.max(0, match.index - 100);
          const contextEnd = Math.min(searchText.length, match.index + term.length + 100);
          const matchContext = searchText.substring(contextStart, contextEnd).trim();
          
          await prisma.matchedLocation.create({
            data: {
              articleId: article.id,
              locationId: location.id,
              matchContext: matchContext,
              confidence
            }
          });
          
          matches.push({
            type: 'location',
            id: location.id,
            term: term,
            locationName: location.name,
            context: matchContext,
            confidence
          });
          break;
        }
      }
    }
    
    // Generate AI insights if we have matches
    if (matches.length > 0) {
      const aiInsights = await AIService.generateIncidentSummary(article);
      const imageUrl = AIService.extractImageUrl(article);
      
      // Update article with AI-generated content
      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: aiInsights.summary,
          recommendations: aiInsights.recommendations,
          severity: aiInsights.severity,
          imageUrl: imageUrl
        }
      });
      
      // Create incident record
      await prisma.incident.create({
        data: {
          articleId: article.id,
          title: article.title,
          description: aiInsights.summary,
          severity: aiInsights.severity,
          affectedEntities: aiInsights.affectedEntities,
          incidentType: aiInsights.incidentType,
          impact: article.description
        }
      });
      
      logger.info(`Enhanced article with AI insights: ${article.title}`);
    }
    
    if (matches.length > 0) {
      logger.info(`Found ${matches.length} matches for article: ${article.title}`);
    }
    
    return matches;
  } catch (error) {
    logger.error('Error in matchArticleKeywords:', error);
    return [];
  }
}

/**
 * Calculate match confidence based on context and position
 */
function calculateMatchConfidence(match, term, searchText) {
  let confidence = 0.5; // Base confidence
  
  // Higher confidence for exact case matches
  if (match[0] === term) {
    confidence += 0.2;
  }
  
  // Higher confidence for matches in title (assuming title comes first)
  if (match.index < 200) {
    confidence += 0.2;
  }
  
  // Higher confidence for longer terms
  if (term.length > 10) {
    confidence += 0.1;
  }
  
  return Math.min(confidence, 1.0);
}

module.exports = {
  matchArticleKeywords
};