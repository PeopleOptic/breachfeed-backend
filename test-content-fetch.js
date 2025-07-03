require('dotenv').config();
const logger = require('./src/utils/logger');

console.log('Content Fetch Configuration Check\n');
console.log('=================================\n');

// Check environment variables
console.log('Environment Variables:');
console.log('- ENABLE_FULL_CONTENT_FETCH:', process.env.ENABLE_FULL_CONTENT_FETCH);
console.log('- CONTENT_FETCH_TIMEOUT:', process.env.CONTENT_FETCH_TIMEOUT);
console.log('- CONTENT_FETCH_RATE_LIMIT:', process.env.CONTENT_FETCH_RATE_LIMIT);
console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set (hidden)' : 'Not set');
console.log('- NODE_ENV:', process.env.NODE_ENV);

// Test if content fetching would be enabled
const ENABLE_FULL_CONTENT_FETCH = process.env.ENABLE_FULL_CONTENT_FETCH === 'true';
console.log('\nContent fetching enabled?', ENABLE_FULL_CONTENT_FETCH);

// Test content fetch service
try {
  const contentFetchService = require('./src/services/contentFetchService');
  console.log('\nContent fetch service loaded successfully');
  
  // Test a URL
  const testUrl = 'https://example.com';
  console.log(`\nWould fetch content from ${testUrl}?`, contentFetchService.shouldFetchUrl(testUrl));
  
} catch (error) {
  console.error('\nError loading content fetch service:', error.message);
}

// Test AI service
try {
  const AIService = require('./src/services/aiService');
  console.log('\nAI service loaded successfully');
} catch (error) {
  console.error('\nError loading AI service:', error.message);
}

console.log('\n✅ Configuration check complete');