require('dotenv').config();
const rssService = require('./src/services/rssService');
const logger = require('./src/utils/logger');

async function triggerRssFetch() {
  console.log('Manually triggering RSS feed fetch...\n');
  
  try {
    console.log('Starting RSS feed processing...');
    await rssService.fetchAllActiveFeeds();
    console.log('\n✅ RSS feed processing complete!');
    console.log('Check the logs to see if content fetching and AI summaries are working.');
  } catch (error) {
    console.error('❌ Error during RSS fetch:', error);
  }
  
  // Give some time for async operations to complete
  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

triggerRssFetch();