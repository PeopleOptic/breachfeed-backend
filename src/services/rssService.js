const Parser = require('rss-parser');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { matchArticleKeywords } = require('./matchingService');
const { queueNotifications } = require('./notificationService');
const AIService = require('./aiService');

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
    
    const parsedFeed = await parser.parseURL(feed.url);
    let newArticles = 0;
    
    for (const item of parsedFeed.items) {
      try {
        // Validate required fields
        if (!item.link) {
          logger.warn(`Skipping article without link from feed ${feed.name}`);
          continue;
        }
        
        // Check if article already exists
        const existingArticle = await prisma.article.findUnique({
          where: { link: item.link }
        });
        
        if (existingArticle) continue;
        
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
        
        // Create temporary article object for AI tag generation
        const tempArticle = {
          title: item.title || 'Untitled',
          description: item.contentSnippet || item.summary || '',
          content: item.content || item['content:encoded'] || ''
        };
        
        // Generate AI tags
        let aiTags = [];
        try {
          aiTags = AIService.generateTags(tempArticle);
          logger.info(`Generated ${aiTags.length} AI tags for article: ${tempArticle.title}`);
        } catch (tagError) {
          logger.warn(`Failed to generate AI tags for article ${tempArticle.title}:`, tagError);
          aiTags = ['cybersecurity']; // fallback
        }
        
        // Combine original RSS categories with AI-generated tags
        const categories = [...new Set([...originalCategories, ...aiTags])];
        
        // Log article data for debugging
        logger.info(`Creating article: ${item.title} from ${feed.name}${imageUrl ? ` with image: ${imageUrl}` : ''} with ${categories.length} tags`);
        
        // Generate slug from title
        const slug = generateSlug(item.title || 'Untitled');
        
        // Create new article
        const article = await prisma.article.create({
          data: {
            feedId: feed.id,
            title: item.title || 'Untitled',
            link: item.link,
            slug,
            description: item.contentSnippet || item.summary || '',
            content: item.content || item['content:encoded'] || '',
            author: item.creator || item.author || null,
            publishedAt,
            guid: item.guid || item.link,
            categories,
            imageUrl
          }
        });
        
        newArticles++;
        logger.info(`Successfully created article: ${article.title} (ID: ${article.id})`);
        
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
    
    logger.info(`Feed processing completed for ${feed.name}: ${newArticles} new articles created from ${parsedFeed.items.length} total items`);
    
    if (newArticles === 0 && parsedFeed.items.length > 0) {
      logger.warn(`No new articles created despite ${parsedFeed.items.length} items in feed. All articles might already exist.`);
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