const Parser = require('rss-parser');
const { getPrismaClient } = require('../utils/database');
const logger = require('../utils/logger');
const { matchArticleKeywords } = require('./matchingService');
const { matchArticleWithAIEntities, createEntitiesFromAI } = require('./enhancedMatchingService');
const { queueNotifications } = require('./notificationService');
const AIService = require('./aiService');
const contentFetchService = require('./contentFetchService');
const { cleanArticleContent } = require('../utils/htmlCleaner');

// Content fetching configuration
const ENABLE_FULL_CONTENT_FETCH = process.env.ENABLE_FULL_CONTENT_FETCH === 'true';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'BreachFeed/1.0'
  }
});

const prisma = getPrismaClient();

// Utility function to generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

async function fetchAndProcessFeed(feed) {
  try {
    logger.info(`Fetching RSS feed: ${feed.name} (${feed.url})`);
    
    // Get exclusion keywords for this feed and global keywords
    const exclusionKeywords = await prisma.exclusionKeyword.findMany({
      where: {
        isActive: true,
        OR: [
          { feedId: feed.id },
          { feedId: null } // Global keywords
        ]
      },
      select: { keyword: true }
    });
    
    const excludeTerms = exclusionKeywords.map(k => k.keyword.toLowerCase());
    logger.info(`Feed ${feed.name} has ${excludeTerms.length} active exclusion keywords`);
    
    const parsedFeed = await parser.parseURL(feed.url);
    let newArticles = 0;
    let filteredArticles = 0;
    
    for (const item of parsedFeed.items) {
      try {
        // Validate required fields
        if (!item.link) {
          logger.warn(`Skipping article without link from feed ${feed.name}`);
          continue;
        }
        
        // Check exclusion keywords
        const articleText = `${item.title || ''} ${item.description || ''} ${item.content || ''}`.toLowerCase();
        const excludedKeyword = excludeTerms.find(term => articleText.includes(term));
        
        if (excludedKeyword) {
          logger.info(`Filtered article "${item.title}" from ${feed.name} - contains excluded keyword: "${excludedKeyword}"`);
          filteredArticles++;
          continue;
        }
        
        // Check if article already exists
        const existingArticle = await prisma.article.findUnique({
          where: { link: item.link }
        });
        
        if (existingArticle) continue;
        
        // Check if article was previously deleted
        const deletedArticle = await prisma.deletedArticle.findUnique({
          where: { articleLink: item.link }
        });
        
        if (deletedArticle) {
          logger.info(`Skipping previously deleted article: ${item.title} (deleted on ${deletedArticle.deletedAt})`);
          continue;
        }
        
        // Prepare categories array from RSS feed
        let originalCategories = [];
        if (item.categories) {
          if (Array.isArray(item.categories)) {
            originalCategories = item.categories;
          } else if (typeof item.categories === 'string') {
            originalCategories = [item.categories];
          }
        }
        
        // Parse publish date safely
        let publishedAt = new Date();
        if (item.pubDate) {
          try {
            publishedAt = new Date(item.pubDate);
            if (isNaN(publishedAt.getTime())) {
              publishedAt = new Date();
            }
          } catch (dateError) {
            logger.warn(`Invalid date format for article ${item.title}: ${item.pubDate}`);
            publishedAt = new Date();
          }
        }
        
        // Extract image URL from various RSS sources
        let imageUrl = null;
        
        // Check for enclosure (common in RSS feeds)
        if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
          imageUrl = item.enclosure.url;
        }
        // Check for direct image field
        else if (item.image && typeof item.image === 'string') {
          imageUrl = item.image;
        }
        // Check for media thumbnail (Media RSS extension)
        else if (item['media:thumbnail'] && item['media:thumbnail']['@_url']) {
          imageUrl = item['media:thumbnail']['@_url'];
        }
        // Check for iTunes image
        else if (item.itunes && item.itunes.image) {
          imageUrl = item.itunes.image;
        }
        // Extract first image from content/description
        else if (item.content || item.description) {
          const contentToSearch = item.content || item.description || '';
          const imgMatch = contentToSearch.match(/<img[^>]+src="([^"]+)"/i);
          if (imgMatch && imgMatch[1]) {
            imageUrl = imgMatch[1];
          }
        }
        
        // Prepare initial article data
        let articleTitle = item.title || 'Untitled';
        // Clean HTML from description and content
        let articleDescription = cleanArticleContent(item.contentSnippet || item.summary || item.description || '');
        let articleContent = cleanArticleContent(item.content || item['content:encoded'] || '');
        let hasFullContent = false;
        let fullContentData = null;
        
        // Try to fetch full content BEFORE creating the article
        if (ENABLE_FULL_CONTENT_FETCH && contentFetchService.shouldFetchUrl(item.link)) {
          try {
            logger.info(`Fetching full content for: ${articleTitle}`);
            
            fullContentData = await contentFetchService.fetchArticleContent(item.link);
            
            if (fullContentData && fullContentData.textContent && fullContentData.textContent.length > 1000) {
              logger.info(`Successfully fetched ${fullContentData.textContent.length} characters of full content`);
              hasFullContent = true;
            } else {
              logger.info(`Insufficient full content fetched (${fullContentData?.textContent?.length || 0} chars)`);
            }
          } catch (fetchError) {
            logger.warn(`Failed to fetch full content for ${item.link}:`, fetchError.message);
          }
        }
        
        // Create article object for AI processing
        const articleForAI = {
          title: articleTitle,
          description: articleDescription,
          content: hasFullContent ? fullContentData.textContent : articleContent,
          link: item.link
        };
        
        // Generate AI summary and classification for ALL articles
        let aiSummaryData = null;
        try {
          // Always attempt to use AI summarization
          if (hasFullContent && fullContentData) {
            // Use comprehensive summary when we have full content
            logger.info(`Generating AI summary with full content (${fullContentData.textContent.length} chars) for: ${articleTitle}`);
            aiSummaryData = await AIService.generateComprehensiveSummary(articleForAI, fullContentData);
          } else {
            // Use AI summary even without full content - Claude can work with RSS data
            logger.info(`Generating AI summary from RSS content for: ${articleTitle}`);
            // Enhance the article data with whatever content we have
            const enhancedArticle = {
              ...articleForAI,
              content: articleContent || articleDescription || articleTitle,
              hasFullContent: false
            };
            aiSummaryData = await AIService.generateIncidentSummary(enhancedArticle);
          }
          
          if (typeof aiSummaryData === 'string') {
            // If it returns just a string, use it as content
            articleContent = aiSummaryData;
          }
        } catch (aiError) {
          logger.error(`Failed to generate AI summary for ${articleTitle}:`, aiError);
          // Even on error, continue processing the article
        }
        
        // Generate AI tags based on full content if available
        let aiTags = [];
        try {
          aiTags = AIService.generateTags(articleForAI);
          logger.info(`Generated ${aiTags.length} AI tags for article: ${articleTitle}`);
        } catch (tagError) {
          logger.warn(`Failed to generate AI tags for article ${articleTitle}:`, tagError);
          aiTags = ['cybersecurity']; // fallback
        }
        
        // Combine original RSS categories with AI-generated tags
        const categories = [...new Set([...originalCategories, ...aiTags])];
        
        // Generate slug from title
        const slug = generateSlug(articleTitle);
        
        // Log article data for debugging
        logger.info(`Creating article: ${articleTitle} from ${feed.name}${imageUrl ? ` with image: ${imageUrl}` : ''} with ${categories.length} tags${hasFullContent ? ' (with full content)' : ''}`);
        
        // Create new article with all the enhanced data
        const article = await prisma.article.create({
          data: {
            feedId: feed.id,
            title: articleTitle,
            link: item.link,
            slug,
            description: articleDescription,
            content: articleContent,
            author: item.creator || item.author || null,
            publishedAt,
            guid: item.guid || item.link,
            categories,
            imageUrl,
            hasFullContent,
            // Add AI-generated data if available
            summary: aiSummaryData?.summary || null,
            recommendations: aiSummaryData?.recommendations || null,
            severity: aiSummaryData?.severity || 'MEDIUM',
            alertType: aiSummaryData?.alertType || 'SECURITY_MENTION',
            classificationConfidence: aiSummaryData?.classificationConfidence || 0.5
          }
        });
        
        newArticles++;
        logger.info(`Successfully created article: ${article.title} (ID: ${article.id}) with ${hasFullContent ? 'full' : 'RSS'} content`);
        
        // Match keywords and companies
        try {
          // First, use traditional matching
          const traditionalMatches = await matchArticleKeywords(article);
          logger.info(`Found ${traditionalMatches.length} traditional matches for article: ${article.title}`);
          
          // Then, use AI-enhanced matching if we have AI data
          let aiMatches = [];
          if (aiSummaryData && aiSummaryData.aiGenerated) {
            // Create new entities from AI extraction if they don't exist
            await createEntitiesFromAI(aiSummaryData);
            
            // Match using AI-extracted entities
            aiMatches = await matchArticleWithAIEntities(article, aiSummaryData);
            logger.info(`Found ${aiMatches.length} AI-enhanced matches for article: ${article.title}`);
          }
          
          // Combine matches (removing duplicates)
          const allMatches = [...traditionalMatches, ...aiMatches];
          const uniqueMatches = allMatches.filter((match, index, self) =>
            index === self.findIndex((m) => m.type === match.type && m.id === match.id)
          );
          
          logger.info(`Total unique matches for article: ${uniqueMatches.length}`);
          
          // Queue notifications if matches found
          if (uniqueMatches.length > 0) {
            await queueNotifications(article, uniqueMatches);
          }
        } catch (matchError) {
          logger.warn(`Matching failed for article ${article.title}, continuing anyway:`, matchError);
        }
        
      } catch (error) {
        logger.error(`Error processing article from ${feed.name}:`, error);
      }
    }
    
    // Update last fetched timestamp
    await prisma.rssFeed.update({
      where: { id: feed.id },
      data: { lastFetchedAt: new Date() }
    });
    
    logger.info(`Feed processing completed for ${feed.name}: ${newArticles} new articles created, ${filteredArticles} filtered by keywords, from ${parsedFeed.items.length} total items`);
    
    if (newArticles === 0 && parsedFeed.items.length > 0) {
      logger.warn(`No new articles created despite ${parsedFeed.items.length} items in feed. ${filteredArticles} filtered by keywords, others might already exist.`);
    }
    
  } catch (error) {
    logger.error(`Error fetching feed ${feed.name}:`, error);
  }
}

async function fetchAllActiveFeeds() {
  try {
    const feeds = await prisma.rssFeed.findMany({
      where: { isActive: true }
    });
    
    logger.info(`Starting to fetch ${feeds.length} active feeds`);
    
    // Process feeds in parallel with concurrency limit
    const concurrencyLimit = 5;
    for (let i = 0; i < feeds.length; i += concurrencyLimit) {
      const batch = feeds.slice(i, i + concurrencyLimit);
      await Promise.allSettled(
        batch.map(feed => fetchAndProcessFeed(feed))
      );
    }
    
    logger.info('Completed fetching all feeds');
  } catch (error) {
    logger.error('Error in fetchAllActiveFeeds:', error);
  }
}

async function fetchRegulationFeeds() {
  try {
    // Get all active regulations with RSS feeds
    const regulations = await prisma.regulation.findMany({
      where: {
        isActive: true,
        rssFeedUrl: { not: null }
      },
      include: {
        regulator: true
      }
    });
    
    logger.info(`Starting to fetch ${regulations.length} regulation-specific RSS feeds`);
    
    for (const regulation of regulations) {
      try {
        logger.info(`Fetching RSS feed for regulation: ${regulation.name} (${regulation.rssFeedUrl})`);
        
        const parsedFeed = await parser.parseURL(regulation.rssFeedUrl);
        let newArticles = 0;
        
        for (const item of parsedFeed.items) {
          try {
            if (!item.link) continue;
            
            // Check if article already exists
            const existingArticle = await prisma.article.findUnique({
              where: { link: item.link }
            });
            
            if (existingArticle) {
              // Link existing article to regulation if not already linked
              const existingLink = await prisma.regulationArticle.findUnique({
                where: {
                  regulationId_articleId: {
                    regulationId: regulation.id,
                    articleId: existingArticle.id
                  }
                }
              });
              
              if (!existingLink) {
                await prisma.regulationArticle.create({
                  data: {
                    regulationId: regulation.id,
                    articleId: existingArticle.id,
                    relevanceScore: 0.9 // High relevance since it's from regulation-specific feed
                  }
                });
                logger.info(`Linked existing article to regulation ${regulation.name}`);
              }
              continue;
            }
            
            // Parse publish date
            let publishedAt = new Date();
            if (item.pubDate) {
              try {
                publishedAt = new Date(item.pubDate);
                if (isNaN(publishedAt.getTime())) {
                  publishedAt = new Date();
                }
              } catch (dateError) {
                publishedAt = new Date();
              }
            }
            
            // Extract image URL
            let imageUrl = null;
            if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
              imageUrl = item.enclosure.url;
            } else if (item.image && typeof item.image === 'string') {
              imageUrl = item.image;
            }
            
            // Clean content
            const articleTitle = item.title || 'Untitled';
            const articleDescription = cleanArticleContent(item.contentSnippet || item.summary || item.description || '');
            const articleContent = cleanArticleContent(item.content || item['content:encoded'] || '');
            
            // Generate slug
            const slug = generateSlug(articleTitle);
            
            // Create a pseudo-feed for regulation RSS
            const feedName = `${regulation.name} Updates`;
            let regulationFeed = await prisma.rssFeed.findFirst({
              where: { url: regulation.rssFeedUrl }
            });
            
            if (!regulationFeed) {
              // Create a feed entry for this regulation RSS
              regulationFeed = await prisma.rssFeed.create({
                data: {
                  name: feedName,
                  url: regulation.rssFeedUrl,
                  category: 'REGULATORY',
                  isActive: true,
                  lastFetchedAt: new Date()
                }
              });
            }
            
            // Create article
            const article = await prisma.article.create({
              data: {
                feedId: regulationFeed.id,
                title: articleTitle,
                link: item.link,
                slug,
                description: articleDescription,
                content: articleContent,
                author: item.creator || item.author || null,
                publishedAt,
                guid: item.guid || item.link,
                categories: ['regulatory', regulation.category, regulation.name.toLowerCase()],
                imageUrl,
                hasFullContent: false
              }
            });
            
            // Link article to regulation
            await prisma.regulationArticle.create({
              data: {
                regulationId: regulation.id,
                articleId: article.id,
                relevanceScore: 1.0 // Maximum relevance for regulation-specific feed
              }
            });
            
            newArticles++;
            logger.info(`Created regulation article: ${article.title} for ${regulation.name}`);
            
          } catch (error) {
            logger.error(`Error processing regulation article:`, error);
          }
        }
        
        logger.info(`Processed ${newArticles} new articles for regulation ${regulation.name}`);
        
      } catch (error) {
        logger.error(`Error fetching regulation feed for ${regulation.name}:`, error);
      }
    }
    
    logger.info('Completed fetching all regulation feeds');
  } catch (error) {
    logger.error('Error in fetchRegulationFeeds:', error);
  }
}

module.exports = {
  fetchAndProcessFeed,
  fetchAllActiveFeeds,
  fetchRegulationFeeds
};