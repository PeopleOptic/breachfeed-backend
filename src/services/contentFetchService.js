const axios = require('axios');
const cheerio = require('cheerio');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const logger = require('../utils/logger');

class ContentFetchService {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (compatible; BreachFeed/1.0; +https://breachfeed.com/bot)';
    this.timeout = parseInt(process.env.CONTENT_FETCH_TIMEOUT) || 30000; // 30 seconds default
    this.rateLimitDelay = parseInt(process.env.CONTENT_FETCH_RATE_LIMIT) || 1000; // 1 second default
    this.lastFetchTime = 0;
  }

  /**
   * Rate limiting to be respectful to source websites
   */
  async respectRateLimit() {
    const now = Date.now();
    const timeSinceLastFetch = now - this.lastFetchTime;
    
    if (timeSinceLastFetch < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastFetch;
      logger.info(`Rate limiting: waiting ${waitTime}ms before next fetch`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastFetchTime = Date.now();
  }

  /**
   * Fetch and extract article content from URL
   */
  async fetchArticleContent(url) {
    try {
      await this.respectRateLimit();
      
      logger.info(`Fetching full content from: ${url}`);
      
      // Fetch the HTML
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: this.timeout,
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });

      const html = response.data;
      
      // Try Mozilla Readability first (best for article extraction)
      const readableContent = this.extractWithReadability(html, url);
      if (readableContent && readableContent.textContent.length > 500) {
        logger.info(`Successfully extracted ${readableContent.textContent.length} characters using Readability`);
        return readableContent;
      }
      
      // Fallback to custom extraction
      const customContent = this.extractWithCheerio(html);
      if (customContent && customContent.textContent.length > 500) {
        logger.info(`Successfully extracted ${customContent.textContent.length} characters using custom extraction`);
        return customContent;
      }
      
      logger.warn(`Could not extract sufficient content from ${url}`);
      return null;
      
    } catch (error) {
      logger.error(`Error fetching content from ${url}:`, error.message);
      
      // Don't retry on certain errors
      if (error.response?.status === 403 || error.response?.status === 451) {
        logger.warn(`Access forbidden for ${url} - skipping`);
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        logger.warn(`Connection failed for ${url} - site may be down`);
      }
      
      return null;
    }
  }

  /**
   * Extract content using Mozilla Readability
   */
  extractWithReadability(html, url) {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      
      if (article) {
        return {
          title: article.title,
          content: article.content,
          textContent: article.textContent,
          excerpt: article.excerpt,
          byline: article.byline
        };
      }
    } catch (error) {
      logger.debug('Readability extraction failed:', error.message);
    }
    
    return null;
  }

  /**
   * Custom content extraction using Cheerio
   */
  extractWithCheerio(html) {
    try {
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style, noscript, iframe, svg').remove();
      
      // Common article content selectors
      const contentSelectors = [
        'article',
        '[role="main"]',
        '.article-content',
        '.entry-content',
        '.post-content',
        '.content-area',
        '.story-body',
        '.article-body',
        '.post-body',
        'main',
        '#main-content',
        '.main-content'
      ];
      
      let content = '';
      let textContent = '';
      
      // Try each selector
      for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length && element.text().trim().length > 500) {
          // Clean up the content
          element.find('aside, .sidebar, .advertisement, .social-share').remove();
          
          content = element.html();
          textContent = element.text().trim();
          break;
        }
      }
      
      // Fallback to paragraphs if no container found
      if (!content) {
        const paragraphs = $('p').filter((i, el) => {
          const text = $(el).text().trim();
          return text.length > 50;
        });
        
        if (paragraphs.length > 3) {
          content = paragraphs.map((i, el) => $(el).html()).get().join('\n');
          textContent = paragraphs.map((i, el) => $(el).text()).get().join('\n');
        }
      }
      
      if (textContent.length > 500) {
        return {
          title: $('title').text() || $('h1').first().text(),
          content: content,
          textContent: textContent,
          excerpt: textContent.substring(0, 200) + '...'
        };
      }
    } catch (error) {
      logger.debug('Cheerio extraction failed:', error.message);
    }
    
    return null;
  }

  /**
   * Check if a URL should be fetched (basic robots.txt respect)
   */
  shouldFetchUrl(url) {
    // Skip certain domains known to block scrapers
    const blockedDomains = [
      'twitter.com',
      'x.com',
      'facebook.com',
      'linkedin.com',
      'instagram.com'
    ];
    
    try {
      const urlObj = new URL(url);
      return !blockedDomains.some(domain => urlObj.hostname.includes(domain));
    } catch {
      return false;
    }
  }
}

module.exports = new ContentFetchService();