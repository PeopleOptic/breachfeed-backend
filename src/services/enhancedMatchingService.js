const { getPrismaClient } = require('../utils/database');
const logger = require('../utils/logger');

const prisma = getPrismaClient();

/**
 * Enhanced matching service that uses AI-extracted entities
 */
async function matchArticleWithAIEntities(article, aiData) {
  try {
    const matches = [];
    
    // If we have AI-extracted entities, use them for more accurate matching
    if (aiData && aiData.aiGenerated) {
      logger.info(`Using AI-extracted entities for article: ${article.title}`);
      
      // Match companies from AI extraction
      if (aiData.companies && aiData.companies.length > 0) {
        for (const companyName of aiData.companies) {
          // Try to find exact match first
          let company = await prisma.company.findFirst({
            where: {
              name: {
                equals: companyName,
                mode: 'insensitive'
              },
              isActive: true
            }
          });
          
          // If no exact match, try partial match
          if (!company) {
            company = await prisma.company.findFirst({
              where: {
                name: {
                  contains: companyName,
                  mode: 'insensitive'
                },
                isActive: true
              }
            });
          }
          
          if (company) {
            await prisma.matchedCompany.create({
              data: {
                articleId: article.id,
                companyId: company.id,
                matchConfidence: 0.95 // High confidence for AI-extracted
              }
            });
            
            matches.push({
              type: 'company',
              id: company.id,
              name: company.name,
              confidence: 0.95
            });
            
            logger.info(`Matched company: ${company.name} (AI-extracted)`);
          } else {
            logger.info(`Company not found in database: ${companyName} - consider adding it`);
          }
        }
      }
      
      // Match agencies from AI extraction
      if (aiData.agencies && aiData.agencies.length > 0) {
        for (const agencyName of aiData.agencies) {
          let agency = await prisma.agency.findFirst({
            where: {
              name: {
                contains: agencyName,
                mode: 'insensitive'
              },
              isActive: true
            }
          });
          
          if (agency) {
            await prisma.matchedAgency.create({
              data: {
                articleId: article.id,
                agencyId: agency.id,
                matchConfidence: 0.95
              }
            });
            
            matches.push({
              type: 'agency',
              id: agency.id,
              name: agency.name,
              confidence: 0.95
            });
            
            logger.info(`Matched agency: ${agency.name} (AI-extracted)`);
          }
        }
      }
      
      // Match locations from AI extraction
      if (aiData.locations && aiData.locations.length > 0) {
        for (const locationName of aiData.locations) {
          let location = await prisma.location.findFirst({
            where: {
              OR: [
                {
                  name: {
                    equals: locationName,
                    mode: 'insensitive'
                  }
                },
                {
                  country: {
                    equals: locationName,
                    mode: 'insensitive'
                  }
                },
                {
                  city: {
                    equals: locationName,
                    mode: 'insensitive'
                  }
                }
              ],
              isActive: true
            }
          });
          
          if (location) {
            await prisma.matchedLocation.create({
              data: {
                articleId: article.id,
                locationId: location.id,
                matchConfidence: 0.95
              }
            });
            
            matches.push({
              type: 'location',
              id: location.id,
              name: location.name,
              confidence: 0.95
            });
            
            logger.info(`Matched location: ${location.name} (AI-extracted)`);
          }
        }
      }
      
      // Match keywords based on AI tags
      if (aiData.tags && aiData.tags.length > 0) {
        for (const tag of aiData.tags) {
          const keyword = await prisma.keyword.findFirst({
            where: {
              term: {
                equals: tag,
                mode: 'insensitive'
              },
              isActive: true
            }
          });
          
          if (keyword) {
            await prisma.matchedKeyword.create({
              data: {
                articleId: article.id,
                keywordId: keyword.id,
                matchContext: `AI-identified tag: ${tag}`
              }
            });
            
            matches.push({
              type: 'keyword',
              id: keyword.id,
              term: keyword.term,
              confidence: 0.9
            });
            
            logger.info(`Matched keyword: ${keyword.term} (AI-extracted)`);
          }
        }
      }
    }
    
    return matches;
  } catch (error) {
    logger.error('Error in enhanced matching:', error);
    return [];
  }
}

/**
 * Create entities from AI extraction if they don't exist
 * This helps build the database of companies, agencies, and locations
 */
async function createEntitiesFromAI(aiData) {
  const created = {
    companies: [],
    agencies: [],
    locations: []
  };
  
  try {
    // Create companies if they don't exist
    if (aiData.companies && aiData.companies.length > 0) {
      for (const companyName of aiData.companies) {
        const exists = await prisma.company.findFirst({
          where: {
            name: {
              equals: companyName,
              mode: 'insensitive'
            }
          }
        });
        
        if (!exists && companyName.length > 2) {
          const company = await prisma.company.create({
            data: {
              name: companyName,
              isActive: true
            }
          });
          created.companies.push(company);
          logger.info(`Created new company from AI extraction: ${companyName}`);
        }
      }
    }
    
    // Create agencies if they don't exist
    if (aiData.agencies && aiData.agencies.length > 0) {
      for (const agencyName of aiData.agencies) {
        const exists = await prisma.agency.findFirst({
          where: {
            name: {
              equals: agencyName,
              mode: 'insensitive'
            }
          }
        });
        
        if (!exists && agencyName.length > 2) {
          const agency = await prisma.agency.create({
            data: {
              name: agencyName,
              country: 'US', // Default, can be improved with location detection
              isActive: true
            }
          });
          created.agencies.push(agency);
          logger.info(`Created new agency from AI extraction: ${agencyName}`);
        }
      }
    }
    
    // Create locations if they don't exist
    if (aiData.locations && aiData.locations.length > 0) {
      for (const locationName of aiData.locations) {
        const exists = await prisma.location.findFirst({
          where: {
            name: {
              equals: locationName,
              mode: 'insensitive'
            }
          }
        });
        
        if (!exists && locationName.length > 2) {
          // Try to determine if it's a country, state, or city
          const locationType = guessLocationType(locationName);
          
          const location = await prisma.location.create({
            data: {
              name: locationName,
              type: locationType,
              country: locationType === 'COUNTRY' ? locationName : null,
              isActive: true
            }
          });
          created.locations.push(location);
          logger.info(`Created new location from AI extraction: ${locationName} (${locationType})`);
        }
      }
    }
    
  } catch (error) {
    logger.error('Error creating entities from AI:', error);
  }
  
  return created;
}

function guessLocationType(locationName) {
  const countries = ['United States', 'USA', 'US', 'China', 'Russia', 'UK', 'United Kingdom', 'Germany', 'France', 'Japan', 'Canada', 'Australia'];
  const states = ['California', 'Texas', 'New York', 'Florida', 'Washington'];
  
  if (countries.some(c => c.toLowerCase() === locationName.toLowerCase())) {
    return 'COUNTRY';
  }
  if (states.some(s => s.toLowerCase() === locationName.toLowerCase())) {
    return 'STATE';
  }
  return 'CITY';
}

module.exports = {
  matchArticleWithAIEntities,
  createEntitiesFromAI
};