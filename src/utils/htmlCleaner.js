const cheerio = require('cheerio');

/**
 * Remove HTML tags and clean up text content
 * @param {string} html - HTML content to clean
 * @returns {string} - Clean text content
 */
function stripHtml(html) {
  if (!html) return '';
  
  // Load HTML with cheerio
  const $ = cheerio.load(html, {
    decodeEntities: true
  });
  
  // Remove script and style elements
  $('script, style, noscript').remove();
  
  // Get text content
  let text = $.text();
  
  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, '\n\n') // Replace multiple newlines with double newline
    .trim();
  
  return text;
}

/**
 * Clean article content while preserving paragraph structure
 * @param {string} html - HTML content to clean
 * @returns {string} - Clean text with paragraph breaks
 */
function cleanArticleContent(html) {
  if (!html) return '';
  
  // First do a simple replacement of common patterns
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '</p>\n\n')
    .replace(/<\/div>/gi, '</div>\n')
    .replace(/<\/h[1-6]>/gi, '</h1>\n\n');
  
  // Load HTML with cheerio
  const $ = cheerio.load(text, {
    decodeEntities: true
  });
  
  // Remove unwanted elements
  $('script, style, noscript, iframe, img, svg').remove();
  
  // Get text content
  text = $.text();
  
  // Clean up excessive whitespace
  text = text
    .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with double newline
    .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
    .replace(/^\s+|\s+$/gm, '') // Trim each line
    .trim();
  
  return text;
}

module.exports = {
  stripHtml,
  cleanArticleContent
};