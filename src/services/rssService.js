const Parser = require('rss-parser');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { matchArticleKeywords } = require('./matchingService');
const { queueNotifications } = require('./notificationService');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'BreachFeed/1.0'
  }
});

const prisma = new PrismaClient();

async function fetchAndProcessFeed(feed) {
  try {
    logger.info(`Fetching RSS feed: ${feed.name} (${feed.url})`);
    
    const parsedFeed = await parser.parseURL(feed.url);
    let newArticles = 0;
    
    for (const item of parsedFeed.items) {
      try {
        // Check if article already exists
        const existingArticle = await prisma.article.findUnique({
          where: { link: item.link }
        });
        
        if (existingArticle) continue;
        
        // Create new article
        const article = await prisma.article.create({
          data: {
            feedId: feed.id,
            title: item.title || 'Untitled',
            link: item.link,
            description: item.contentSnippet || item.summary || '',
            content: item.content || item['content:encoded'] || '',
            author: item.creator || item.author || null,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            guid: item.guid || item.link,
            categories: item.categories || []
          }
        });
        
        newArticles++;
        
        // Match keywords and companies
        const matches = await matchArticleKeywords(article);
        
        // Queue notifications if matches found
        if (matches.length > 0) {
          await queueNotifications(article, matches);
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
    
    if (newArticles > 0) {
      logger.info(`Processed ${newArticles} new articles from ${feed.name}`);
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