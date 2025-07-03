const Parser = require('rss-parser');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { matchArticleKeywords } = require('./matchingService');
const { queueNotifications } = require('./notificationService');
const AIService = require('./aiService');
const contentFetchService = require('./contentFetchService');

// Content fetching configuration
const ENABLE_FULL_CONTENT_FETCH = process.env.ENABLE_FULL_CONTENT_FETCH === 'true';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'BreachFeed/1.0'
  }
});

const prisma = new PrismaClient();

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
        let articleDescription = item.contentSnippet || item.summary || '';
        let articleContent = item.content || item['content:encoded'] || '';
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
        
        // Generate AI summary and classification
        let aiSummaryData = null;
        try {
          if (hasFullContent) {
            // Use comprehensive summary for full content
            aiSummaryData = await AIService.generateComprehensiveSummary(articleForAI, fullContentData);
            if (typeof aiSummaryData === 'string') {
              // If it returns just a string, use it as content
              articleContent = aiSummaryData;
            }
          } else {
            // Use regular summary generation
            aiSummaryData = await AIService.generateIncidentSummary(articleForAI);
          }
        } catch (aiError) {
          logger.error(`Failed to generate AI summary for ${articleTitle}:`, aiError);
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
        
        // Match keywords and companies (skip if no entities exist)
        try {
          const matches = await matchArticleKeywords(article);
          logger.info(`Found ${matches.length} matches for article: ${article.title}`);
          
          // Queue notifications if matches found
          if (matches.length > 0) {
            await queueNotifications(article, matches);
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

module.exports = {
  fetchAndProcessFeed,
  fetchAllActiveFeeds
};